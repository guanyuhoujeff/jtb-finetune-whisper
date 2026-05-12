import subprocess
import threading
import time
import os
import signal
import sys
import json
import logging
import psutil
from collections import deque

STATE_FILE = "training_state.json"
LOG_FILE = "training.log"

logger = logging.getLogger("jtb.training")

class TrainingManager:
    def __init__(self):
        self.process = None
        self.logs = deque(maxlen=2000)
        self.status = "idle"  # idle, running, stopping, stopped, completed, error
        self.lock = threading.RLock()
        self.command_queue = deque()
        self.current_task_name = ""
        self.pipeline_steps = []  # List of all step names in the current pipeline
        self.current_step_index = 0  # Index of the currently executing step
        
        # Recover state if possible
        self._recover_state()

    def _save_state(self, pid=None):
        """Saves current state to file. Never persists secrets (e.g. HF tokens)."""
        # Persist only the task names — command queues may carry secrets via stdin
        # and we never want them on disk.
        state = {
            "status": self.status,
            "current_task": self.current_task_name,
            "pid": pid,
            "queue_task_names": [task_name for task_name, *_ in self.command_queue],
        }
        try:
            with open(STATE_FILE, "w") as f:
                json.dump(state, f)
        except Exception:
            logger.exception("Failed to save training state")

    def _recover_state(self):
        """Attempts to recover state from file on startup."""
        if not os.path.exists(STATE_FILE):
            return

        try:
            with open(STATE_FILE, "r") as f:
                state = json.load(f)
            
            if state.get("status") == "running" and state.get("pid"):
                pid = state["pid"]
                if psutil.pid_exists(pid):
                    self.status = "running"
                    self.current_task_name = state.get("current_task", "Unknown")
                    self.process = psutil.Process(pid) # Wrap existing PID
                    # self.command_queue = deque(state.get("queue", [])) # Queue recovery is complex since deque holds tuples, but json has lists. Re-parsing commands is risky.
                    # For simplicity, we just monitor the current task. If it finishes, we might stop or failing to continue queue.
                    # Ideally we serialize queue properly.
                    
                    # Start log tailing
                    t_tail = threading.Thread(target=self._tail_logs)
                    t_tail.daemon = True
                    t_tail.start()
                    
                    # Start monitoring existing process
                    t_monitor = threading.Thread(target=self._monitor_existing_process)
                    t_monitor.daemon = True
                    t_monitor.start()
                    
                    self.logs.append(f"[SYSTEM] Recovered training session (PID: {pid})")
                else:
                    self.status = "error"
                    self.logs.append("[SYSTEM] Previous session crashed or disappeared.")
                    self._save_state(None) # Reset
            
            # Load previous logs from file reference if exists
            if os.path.exists(LOG_FILE):
                 with open(LOG_FILE, "r") as f:
                     # Load last 100 lines
                     lines = f.readlines()
                     for line in lines[-100:]:
                         self.logs.append(line.strip())

        except Exception:
            logger.exception("Failed to recover training state")

    def _tail_logs(self):
        """Tails the log file and updates self.logs"""
        if not os.path.exists(LOG_FILE): return
        
        with open(LOG_FILE, "r") as f:
            # Seek to end initially
            f.seek(0, 2)
            while self.status == "running":
                line = f.readline()
                if not line:
                    time.sleep(0.1)
                    continue
                with self.lock:
                    self.logs.append(line.strip())

    def _monitor_existing_process(self):
        """Monitors a recovered process (where we don't have popen obj)"""
        if not self.process: return
        try:
            self.process.wait() # psutil process wait
            # If we get here, it finished. We don't know the return code easily from psutil wait() directly across OS without wait_procs, but assuming it ended.
            with self.lock:
                self.status = "completed" # Or unknown.
                self.process = None
                self.logs.append("[SYSTEM] Recovered task finished.")
                self._save_state(None)
        except Exception as e:
             with self.lock:
                self.status = "error"
                self.logs.append(f"[SYSTEM] Monitoring failed: {e}")
                self._save_state(None)

    def start_training(self, config):
        with self.lock:
            if self.status == "running":
                raise RuntimeError("Training is already running.")
            
            # Reset logs
            self.logs.clear()
            # Clear log file
            open(LOG_FILE, 'w').close()
            
            self.status = "running"
            self.command_queue.clear()
            
            # --- Build Pipeline (Copy from previous implementation) ---
            # Base output directory for this training run
            run_name = config.get("output_dir", "lora-whisper")
            base_output_dir = os.path.join("model_output", run_name)
            lora_dir = os.path.join(base_output_dir, "lora")
            merged_dir = os.path.join(base_output_dir, "merged")
            ct2_dir = os.path.join(base_output_dir, "ct2")
            
            model_name = config.get("model_name", "openai/whisper-large-v3")
            
            # Define bucket_name here so it's always available for minio args
            bucket_name = config.get("bucket_name", "") # Default to empty string if not provided
            
            # 1. Train
            from backend.services.minio_client import minio_client
            cmd_train = [
                sys.executable,
                "-m", "backend.scripts.train_lora",
                "--model-name", model_name,
                "--output-dir", lora_dir,
                "--max-steps", str(config.get("max_steps", 100)),
                "--eval-steps", str(config.get("eval_steps", 50)),
                "--bucket-name", bucket_name,
                "--learning-rate", str(config.get("learning_rate", 1e-4)),
                "--batch-size", str(config.get("per_device_train_batch_size", 1)),
                "--lora-r", str(config.get("lora_r", 32)),
                "--lora-alpha", str(config.get("lora_alpha", 64)),
                "--minio-endpoint", minio_client.endpoint,
                "--minio-access-key", minio_client.access_key,
                "--minio-secret-key", minio_client.secret_key,
                "--minio-bucket", bucket_name  # Use the target bucket as the default minio bucket context
            ]
            
            self.command_queue.append(("Training", cmd_train, None))

            # 2. Merge
            if config.get("do_merge"):
                cmd_merge = [
                    sys.executable,
                    "-m", "backend.scripts.merge_lora",
                    "--lora-checkpoint", lora_dir,
                    "--output-dir", merged_dir
                ]
                self.command_queue.append(("Merging", cmd_merge, None))

                # 3. Convert
                if config.get("do_convert"):
                    cmd_convert = [
                        sys.executable,
                        "-m", "backend.scripts.convert_ct2",
                        "--model-path", merged_dir,
                        "--output-dir", ct2_dir,
                        "--quantization", "float16"
                    ]
                    self.command_queue.append(("Converting", cmd_convert, None))

            # 4. Upload
            if config.get("do_upload"):
                upload_folder_path = lora_dir
                if config.get("do_convert") and config.get("do_merge"):
                    upload_folder_path = ct2_dir
                elif config.get("do_merge"):
                    upload_folder_path = merged_dir

                cmd_upload = [
                    sys.executable,
                    "-m", "backend.scripts.upload_hf",
                    "--repo-id", config.get("hf_repo_id", ""),
                    "--folder", upload_folder_path,
                    "--token-from", "stdin",
                ]
                # Token is fed to the child via stdin so it never appears in argv / ps / audit logs.
                hf_token = (config.get("hf_token") or "").strip()
                if not hf_token:
                    raise ValueError("hf_token is required when do_upload is true")
                self.command_queue.append(("Uploading", cmd_upload, hf_token + "\n"))

            # Store pipeline steps for status tracking
            self.pipeline_steps = [task_name for task_name, *_ in self.command_queue]
            self.current_step_index = 0

            self.logs.append("[SYSTEM] Pipeline started.")
            self._start_next_task()

    def start_upload_task(self, model_path: str, repo_id: str, hf_token: str):
        with self.lock:
            if self.status == "running":
                raise RuntimeError("A task is already running.")

            hf_token = (hf_token or "").strip()
            if not hf_token:
                raise ValueError("hf_token is required for upload tasks")

            # Reset logs
            self.logs.clear()
            open(LOG_FILE, 'w').close()

            self.status = "running"
            self.command_queue.clear()

            # Verify path
            cwd = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../"))
            full_model_path = os.path.abspath(model_path)
            if not os.path.exists(full_model_path):
                 # Try relative to cwd
                 full_model_path = os.path.join(cwd, model_path)
                 if not os.path.exists(full_model_path):
                     raise ValueError(f"Model path does not exist: {model_path}")

            cmd_upload = [
                sys.executable,
                "-m", "backend.scripts.upload_hf",
                "--repo-id", repo_id,
                "--folder", full_model_path,
                "--token-from", "stdin",
            ]

            self.command_queue.append(("Uploading to HF", cmd_upload, hf_token + "\n"))

            # Store pipeline steps for status tracking
            self.pipeline_steps = ["Uploading to HF"]
            self.current_step_index = 0

            self.logs.append(f"[SYSTEM] Upload task started for {model_path}")
            self._start_next_task()

    def start_preprocess_task(
        self,
        source_bucket: str,
        target_bucket: str,
        *,
        splits: str = "train,test",
        max_chunk_sec: float = 25.0,
        min_chunk_sec: float = 1.0,
        confidence_threshold: float = 0.7,
        whisper_model: str = "small",
        language: str = "zh",
    ) -> None:
        """Queue a long-audio preprocessing task. Reuses the same pipeline
        machinery (single-task queue, log tailing, status reporting) as training."""
        with self.lock:
            if self.status == "running":
                raise RuntimeError("A task is already running.")
            if not source_bucket or not target_bucket:
                raise ValueError("source_bucket and target_bucket are required")
            if source_bucket == target_bucket:
                raise ValueError("source_bucket and target_bucket must differ")

            from backend.services.minio_client import minio_client

            self.logs.clear()
            open(LOG_FILE, "w").close()
            self.status = "running"
            self.command_queue.clear()

            cmd = [
                sys.executable,
                "-m", "backend.scripts.preprocess_long_audio",
                "--source-bucket", source_bucket,
                "--target-bucket", target_bucket,
                "--splits", splits,
                "--max-chunk-sec", str(max_chunk_sec),
                "--min-chunk-sec", str(min_chunk_sec),
                "--confidence-threshold", str(confidence_threshold),
                "--whisper-model", whisper_model,
                "--language", language,
                "--minio-endpoint", minio_client.endpoint,
                "--minio-access-key", minio_client.access_key,
                "--minio-secret-key", minio_client.secret_key,
            ]
            self.command_queue.append(("Preprocessing long audio", cmd, None))
            self.pipeline_steps = ["Preprocessing long audio"]
            self.current_step_index = 0

            self.logs.append(
                f"[SYSTEM] Preprocess task started: {source_bucket} -> {target_bucket}"
            )
            self._start_next_task()

    def _start_next_task(self):
        if not self.command_queue:
            with self.lock:
                self.status = "completed"
                self.logs.append("[SYSTEM] All tasks finished successfully.")
                self.process = None
                self._save_state(None)
                # Clear log file on successful completion
                try:
                    open(LOG_FILE, 'w').close()
                except Exception:
                    pass
            return

        task_name, cmd, stdin_data = self.command_queue.popleft()
        self.current_task_name = task_name

        with self.lock:
             self.logs.append(f"[SYSTEM] Starting task: {task_name}")
             # Never log the raw command for tasks that carry secrets via stdin —
             # the stdin payload itself is already kept off the command line, but
             # the cmd is safe to log because it no longer holds the token.
             self.logs.append(f"[SYSTEM] Command: {' '.join(cmd)}")

        cwd = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../"))

        try:
            # Use a log file for stdout/stderr redirection to allow persistence + tailing
            self.log_file_handle = open(LOG_FILE, "a")

            self.process = subprocess.Popen(
                cmd,
                cwd=cwd,
                stdin=subprocess.PIPE if stdin_data else subprocess.DEVNULL,
                stdout=self.log_file_handle,
                stderr=subprocess.STDOUT,  # Merge stderr into stdout
                text=True,
                bufsize=1
            )

            # Send stdin secret (e.g. HF token) and close the pipe so the child
            # sees EOF after the single line.
            if stdin_data:
                try:
                    assert self.process.stdin is not None
                    self.process.stdin.write(stdin_data)
                    self.process.stdin.flush()
                finally:
                    try:
                        self.process.stdin.close()
                    except Exception:
                        pass

            # Save state with new PID
            self._save_state(self.process.pid)

            # Start thread to tail the log file
            t_tail = threading.Thread(target=self._tail_logs)
            t_tail.daemon = True
            t_tail.start()

            # Start monitor
            t_monitor = threading.Thread(target=self._monitor_process)
            t_monitor.daemon = True
            t_monitor.start()

        except Exception as e:
            with self.lock:
                self.status = "error"
                self.logs.append(f"[SYSTEM] Failed to start task {task_name}: {e}")
                self._save_state(None)

    def _monitor_process(self):
        if not self.process: return
        
        return_code = self.process.wait()
        
        # Close log handle if open
        try:
            self.log_file_handle.close()
        except: pass

        with self.lock:
            if return_code == 0:
                self.logs.append(f"[SYSTEM] Task '{self.current_task_name}' finished successfully.")
                self.process = None
                self.current_step_index += 1  # Move to next step
                # Launch next task via thread
                threading.Thread(target=self._start_next_task).start()
            elif return_code == -15 or return_code == 15: # SIGTERM
                 self.status = "stopped"
                 self.logs.append(f"[SYSTEM] Task '{self.current_task_name}' stopped by user.")
                 self.process = None
                 self._save_state(None)
            else:
                self.status = "error"
                self.logs.append(f"[SYSTEM] Task '{self.current_task_name}' failed with return code {return_code}.")
                self.process = None
                self.command_queue.clear()
                self._save_state(None)

    def stop_training(self):
        with self.lock:
            if self.process and self.status == "running":
                self.command_queue.clear() 
                self.process.terminate()
                self.status = "stopping"
                self.logs.append("[SYSTEM] Stopping pipeline...")
                self._save_state(self.process.pid) # Update state? Or wait for monitor.
            elif self.status != "running":
                 self.logs.append("[SYSTEM] No running pipeline to stop.")

    def get_status(self):
        with self.lock:
            return {
                "status": self.status,
                "current_task": self.current_task_name if self.status == 'running' else None,
                "steps": self.pipeline_steps,
                "current_step_index": self.current_step_index if self.status == 'running' else None,
                "total_steps": len(self.pipeline_steps),
                "logs": list(self.logs)
            }

training_manager = TrainingManager()
