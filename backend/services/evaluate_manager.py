"""
Evaluate Manager - Handles model loading, inference, and comparison for evaluation.
"""
import os
import time
import tempfile
import base64
from typing import Dict, List, Optional, Any, Literal
from dataclasses import dataclass
from pathlib import Path

# Model output directory
MODEL_OUTPUT_DIR = "model_output"

# Official Whisper models available from HuggingFace
OFFICIAL_MODELS = [
    "openai/whisper-tiny",
    "openai/whisper-base", 
    "openai/whisper-small",
    "openai/whisper-medium",
    "openai/whisper-large-v2",
    "openai/whisper-large-v3",
]


@dataclass
class ModelInfo:
    """Information about an available model."""
    name: str
    path: str
    source: Literal["custom", "official"]
    variants: List[str]  # ["lora", "merged", "ct2"]
    created_at: Optional[str] = None


@dataclass
class InferenceResult:
    """Result of a single inference."""
    transcription: str
    confidence: float
    inference_time_ms: float
    language: str = "zh"


class EvaluateManager:
    """Manages model evaluation, inference, and comparison."""
    
    def __init__(self):
        self._model_cache: Dict[str, Any] = {}
        self._processor_cache: Dict[str, Any] = {}
    
    def clear_cache(self) -> Dict[str, Any]:
        """
        Clear all cached models to release GPU memory.
        Returns info about what was cleared.
        """
        import gc
        
        cleared_models = list(self._model_cache.keys())
        cleared_processors = list(self._processor_cache.keys())
        
        # Move models to CPU before deletion (helps release GPU memory)
        try:
            import torch
            for key, model in list(self._model_cache.items()):
                if hasattr(model, 'to'):
                    try:
                        model.to('cpu')
                    except:
                        pass
                if hasattr(model, 'model') and hasattr(model.model, 'to'):
                    try:
                        model.model.to('cpu')
                    except:
                        pass
        except ImportError:
            pass
        
        # Clear model cache
        for key in list(self._model_cache.keys()):
            model = self._model_cache.pop(key)
            del model
        self._model_cache.clear()
        
        # Clear processor cache
        for key in list(self._processor_cache.keys()):
            processor = self._processor_cache.pop(key)
            del processor
        self._processor_cache.clear()
        
        # Force multiple rounds of garbage collection
        for _ in range(3):
            gc.collect()
        
        # Release GPU memory more thoroughly
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                torch.cuda.ipc_collect()
                torch.cuda.synchronize()
                # Reset peak memory stats
                torch.cuda.reset_peak_memory_stats()
                torch.cuda.reset_accumulated_memory_stats()
        except (ImportError, RuntimeError):
            pass
        
        # Final garbage collection
        gc.collect()
        
        return {
            "cleared_models": cleared_models,
            "cleared_processors": cleared_processors,
            "count": len(cleared_models) + len(cleared_processors)
        }
    
    def get_cache_info(self) -> Dict[str, Any]:
        """Get information about currently cached models."""
        try:
            import torch
            gpu_info = {}
            if torch.cuda.is_available():
                gpu_info = {
                    "gpu_available": True,
                    "gpu_name": torch.cuda.get_device_name(0),
                    "memory_allocated_mb": round(torch.cuda.memory_allocated(0) / 1024 / 1024, 2),
                    "memory_reserved_mb": round(torch.cuda.memory_reserved(0) / 1024 / 1024, 2),
                }
            else:
                gpu_info = {"gpu_available": False}
        except ImportError:
            gpu_info = {"gpu_available": False, "error": "torch not available"}
        
        return {
            "cached_models": list(self._model_cache.keys()),
            "cached_processors": list(self._processor_cache.keys()),
            "total_cached": len(self._model_cache) + len(self._processor_cache),
            "gpu": gpu_info
        }
    
    def list_available_models(self) -> List[ModelInfo]:
        """
        List all available models (custom trained + official).
        Returns list of ModelInfo objects.
        """
        models = []
        
        # Scan model_output directory for custom models
        if os.path.exists(MODEL_OUTPUT_DIR):
            for model_name in os.listdir(MODEL_OUTPUT_DIR):
                model_path = os.path.join(MODEL_OUTPUT_DIR, model_name)
                if os.path.isdir(model_path):
                    variants = []
                    
                    # Check for each variant
                    for variant in ["lora", "merged", "ct2"]:
                        variant_path = os.path.join(model_path, variant)
                        if os.path.isdir(variant_path) and os.listdir(variant_path):
                            variants.append(variant)
                    
                    if variants:
                        # Get creation time
                        created_at = None
                        try:
                            stat = os.stat(model_path)
                            created_at = time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(stat.st_ctime))
                        except:
                            pass
                        
                        models.append(ModelInfo(
                            name=model_name,
                            path=model_path,
                            source="custom",
                            variants=variants,
                            created_at=created_at
                        ))
        
        # Add official models
        for official_model in OFFICIAL_MODELS:
            model_name = official_model.split("/")[-1]
            models.append(ModelInfo(
                name=model_name,
                path=official_model,
                source="official",
                variants=["hf"],  # HuggingFace format
                created_at=None
            ))
        
        return models
    
    def _get_model_path(self, model_name: str, source: str, variant: Optional[str] = None) -> str:
        """Resolve the actual model path based on source and variant."""
        if source == "official":
            # Return HuggingFace model ID directly
            if "/" not in model_name:
                return f"openai/{model_name}"
            return model_name
        else:  # custom
            base_path = os.path.join(MODEL_OUTPUT_DIR, model_name)
            if variant:
                return os.path.join(base_path, variant)
            return base_path
    
    def _load_ct2_model(self, model_path: str):
        """Load a CTranslate2/faster-whisper model."""
        from faster_whisper import WhisperModel
        
        cache_key = f"ct2:{model_path}"
        if cache_key not in self._model_cache:
            print(f"[EvaluateManager] Loading CT2 model from {model_path}")
            model = WhisperModel(model_path, device="cuda", compute_type="float16")
            self._model_cache[cache_key] = model
        
        return self._model_cache[cache_key]
    
    def _load_hf_model(self, model_path: str, is_merged: bool = False):
        """Load a HuggingFace transformers model."""
        from transformers import WhisperProcessor, WhisperForConditionalGeneration
        import torch
        
        cache_key = f"hf:{model_path}"
        if cache_key not in self._model_cache:
            print(f"[EvaluateManager] Loading HF model from {model_path}")
            
            # For merged models, we need to load processor from base whisper model
            # because the merged directory only contains the model weights
            if is_merged:
                # Try to detect base model from config or use large-v3 as default
                processor_path = "openai/whisper-large-v3"
                try:
                    import json
                    config_path = os.path.join(model_path, "config.json")
                    if os.path.exists(config_path):
                        with open(config_path, 'r') as f:
                            config = json.load(f)
                            # Check if there's a base model reference
                            if "_name_or_path" in config:
                                base_name = config["_name_or_path"]
                                if "whisper" in base_name.lower():
                                    processor_path = base_name
                except Exception as e:
                    print(f"[EvaluateManager] Could not detect base model, using default: {e}")
                
                print(f"[EvaluateManager] Using processor from: {processor_path}")
                processor = WhisperProcessor.from_pretrained(processor_path)
            else:
                processor = WhisperProcessor.from_pretrained(model_path)
            
            model = WhisperForConditionalGeneration.from_pretrained(
                model_path,
                torch_dtype=torch.float16,
                device_map="auto"
            )
            self._model_cache[cache_key] = model
            self._processor_cache[cache_key] = processor
        
        return self._model_cache[cache_key], self._processor_cache[cache_key]
    
    def _infer_ct2(self, model, audio_path: str) -> InferenceResult:
        """Run inference with faster-whisper (CT2) model."""
        start_time = time.time()
        
        segments, info = model.transcribe(
            audio_path,
            language="zh",
            beam_size=5,
            vad_filter=True
        )
        
        # Collect transcription
        transcription = ""
        total_confidence = 0.0
        segment_count = 0
        
        for segment in segments:
            transcription += segment.text
            total_confidence += segment.avg_logprob
            segment_count += 1
        
        inference_time = (time.time() - start_time) * 1000
        
        # Convert log prob to rough confidence (0-1 scale)
        avg_confidence = 0.0
        if segment_count > 0:
            avg_log_prob = total_confidence / segment_count
            avg_confidence = min(1.0, max(0.0, 1.0 + avg_log_prob / 5))  # Rough heuristic
        
        return InferenceResult(
            transcription=transcription.strip(),
            confidence=round(avg_confidence, 3),
            inference_time_ms=round(inference_time, 1),
            language=info.language if hasattr(info, 'language') else "zh"
        )
    
    def _infer_hf(self, model, processor, audio_path: str) -> InferenceResult:
        """Run inference with HuggingFace transformers model."""
        import torch
        import librosa
        
        start_time = time.time()
        
        # Load and preprocess audio
        audio, sr = librosa.load(audio_path, sr=16000)
        input_features = processor(
            audio,
            sampling_rate=16000,
            return_tensors="pt"
        ).input_features.to(model.device, dtype=torch.float16)
        
        # Generate
        with torch.no_grad():
            predicted_ids = model.generate(
                input_features,
                language="zh",
                task="transcribe"
            )
        
        # Decode
        transcription = processor.batch_decode(predicted_ids, skip_special_tokens=True)[0]
        
        inference_time = (time.time() - start_time) * 1000
        
        return InferenceResult(
            transcription=transcription.strip(),
            confidence=0.9,  # HF doesn't easily expose confidence
            inference_time_ms=round(inference_time, 1),
            language="zh"
        )
    
    def infer(
        self,
        model_name: str,
        source: Literal["custom", "official"],
        variant: Optional[str],
        audio_path: str
    ) -> InferenceResult:
        """
        Run inference on a single audio file.
        
        Args:
            model_name: Name of the model
            source: "custom" or "official"
            variant: "ct2", "merged", or None for official models
            audio_path: Path to audio file
        
        Returns:
            InferenceResult with transcription and metrics
        """
        print(f"[EvaluateManager] Inferring on model: {model_name}, source: {source}, variant: {variant}, audio_path: {audio_path}")
        model_path = self._get_model_path(model_name, source, variant)
        
        # Determine model type and run inference
        if source == "official":
            model, processor = self._load_hf_model(model_path, is_merged=False)
            return self._infer_hf(model, processor, audio_path)
        elif variant == "merged":
            model, processor = self._load_hf_model(model_path, is_merged=True)
            return self._infer_hf(model, processor, audio_path)
        elif variant == "ct2":
            model = self._load_ct2_model(model_path)
            return self._infer_ct2(model, audio_path)
        else:
            raise ValueError(f"Unknown variant: {variant}")
    
    def compare(
        self,
        model_a: Dict[str, Any],
        model_b: Dict[str, Any],
        audio_path: str
    ) -> Dict[str, Any]:
        """
        Compare two models on the same audio.
        
        Args:
            model_a: {"name": str, "source": str, "variant": str}
            model_b: {"name": str, "source": str, "variant": str}
            audio_path: Path to audio file
        
        Returns:
            Comparison results including both transcriptions and metrics
        """
        result_a = self.infer(
            model_a["name"],
            model_a["source"],
            model_a.get("variant"),
            audio_path
        )
        
        result_b = self.infer(
            model_b["name"],
            model_b["source"],
            model_b.get("variant"),
            audio_path
        )
        
        # Compute comparison metrics
        speed_ratio = 0.0
        if result_a.inference_time_ms > 0 and result_b.inference_time_ms > 0:
            speed_ratio = round(result_b.inference_time_ms / result_a.inference_time_ms, 2)
        
        confidence_diff = round(result_a.confidence - result_b.confidence, 3)
        
        return {
            "model_a": {
                "name": f"{model_a['name']}/{model_a.get('variant', 'hf')}",
                "transcription": result_a.transcription,
                "confidence": result_a.confidence,
                "inference_time_ms": result_a.inference_time_ms
            },
            "model_b": {
                "name": f"{model_b['name']}/{model_b.get('variant', 'hf')}",
                "transcription": result_b.transcription,
                "confidence": result_b.confidence,
                "inference_time_ms": result_b.inference_time_ms
            },
            "comparison": {
                "speed_ratio": speed_ratio,
                "confidence_diff": confidence_diff
            }
        }
    
    def save_audio_from_base64(self, audio_base64: str) -> str:
        """Save base64 encoded audio to a temporary file."""
        audio_data = base64.b64decode(audio_base64)
        
        # Create temp file
        fd, temp_path = tempfile.mkstemp(suffix=".wav")
        with os.fdopen(fd, 'wb') as f:
            f.write(audio_data)
        
        return temp_path


# Singleton instance
evaluate_manager = EvaluateManager()
