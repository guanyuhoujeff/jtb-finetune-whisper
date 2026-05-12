from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Body, Request
import warnings
warnings.filterwarnings("ignore")
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from backend.services.minio_client import minio_client, MINIO_ENDPOINT, BUCKET_NAME
from backend.services.dataset_manager import dataset_manager
from pydantic import BaseModel
from typing import Optional
import uvicorn
import shutil
import os
import secrets
import logging

logger = logging.getLogger("jtb.backend")
if not logger.handlers:
    logging.basicConfig(
        level=os.getenv("BACKEND_LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

app = FastAPI()

def _build_cors_origins() -> list[str]:
    configured = os.getenv(
        "BACKEND_CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    )
    origins = [origin.strip() for origin in configured.split(",") if origin.strip()]
    if "*" in origins:
        return ["*"]
    return origins


def _allow_cors_credentials(origins: list[str]) -> bool:
    # Browsers disallow wildcard origins with credentials.
    return "*" not in origins


def _is_api_request_authorized(
    path: str,
    method: str,
    headers: dict,
    configured_api_key: str,
    allow_unauth: bool = False,
) -> bool:
    if not path.startswith("/api") or method.upper() == "OPTIONS":
        return True
    if not configured_api_key:
        return allow_unauth
    request_key = headers.get("x-api-key", "")
    return secrets.compare_digest(request_key, configured_api_key)


def _safe_remove_temp_file(path: Optional[str]) -> None:
    if not path:
        return
    try:
        os.remove(path)
    except Exception:
        pass


API_KEY = os.getenv("BACKEND_API_KEY", "").strip()
ALLOW_INSECURE_NO_AUTH = os.getenv("BACKEND_ALLOW_INSECURE_NO_AUTH", "").lower() in ("1", "true", "yes")
if not API_KEY and not ALLOW_INSECURE_NO_AUTH:
    raise RuntimeError(
        "BACKEND_API_KEY is not configured. Set it in your environment, "
        "or set BACKEND_ALLOW_INSECURE_NO_AUTH=1 explicitly to opt-in to an unauthenticated API."
    )
if not API_KEY:
    logger.warning(
        "BACKEND_API_KEY is empty and BACKEND_ALLOW_INSECURE_NO_AUTH is enabled — "
        "the API will accept unauthenticated requests. DO NOT use this in production."
    )

origins = _build_cors_origins()
allow_credentials = _allow_cors_credentials(origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def api_key_guard(request: Request, call_next):
    if not _is_api_request_authorized(
        request.url.path,
        request.method,
        request.headers,
        API_KEY,
        allow_unauth=ALLOW_INSECURE_NO_AUTH,
    ):
        return JSONResponse(
            status_code=401,
            content={"detail": "Unauthorized. Missing or invalid x-api-key."},
        )
    return await call_next(request)

class TranscriptionUpdate(BaseModel):
    bucket_name: str
    split: str
    file_name: str
    transcription: str
    tags: Optional[str] = None
    description: Optional[str] = None

class MinioConfig(BaseModel):
    endpoint: str
    access_key: str
    secret_key: str
    bucket_name: str

class BatchOperationRequest(BaseModel):
    bucket_name: str
    split: str
    file_names: list[str]

class BatchTagRequest(BatchOperationRequest):
    tag: str

class BatchCopyRequest(BatchOperationRequest):
    target_bucket: str

class CloneBucketRequest(BaseModel):
    source_bucket: str
    new_bucket_name: str


@app.post("/api/config")
def update_config(config: MinioConfig):
    """Frontend-driven config update.

    The backend's internal MinIO endpoint must match the docker network (e.g.
    `minio:9000`) and is configured via env at startup. The frontend ships the
    *browser-facing* endpoint here so we only update the presigned-URL host
    and the credentials — never the internal connection target. Otherwise a
    user pasting `localhost:9000` from their machine would silently break
    every backend->MinIO call from inside the container.
    """
    try:
        minio_client.update_config(
            minio_client.endpoint,  # keep internal endpoint pinned to env
            config.access_key,
            config.secret_key,
            secure=False,
            external_endpoint=config.endpoint or minio_client.external_endpoint,
        )
        import backend.services.minio_client as mc
        mc.BUCKET_NAME = config.bucket_name

        return {
            "status": "success",
            "message": "Credentials and presigned-URL host updated. Internal endpoint stays at "
                       f"{minio_client.endpoint} (set via MINIO_ENDPOINT env).",
        }
    except Exception:
        logger.exception("update_config failed")
        raise HTTPException(status_code=500, detail="Failed to update MinIO config")

@app.get("/api/buckets")
def list_buckets():
    try:
        buckets = minio_client.list_buckets()
        return {"buckets": [b.name for b in buckets]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class BucketCreate(BaseModel):
    bucket_name: str

@app.post("/api/buckets")
def create_bucket(bucket: BucketCreate):
    logger.info("Create bucket request: %s", bucket.bucket_name)
    try:
        minio_client.create_bucket(bucket.bucket_name)
        return {"status": "success", "message": f"Bucket {bucket.bucket_name} created"}
    except Exception:
        logger.exception("Failed to create bucket %s", bucket.bucket_name)
        raise HTTPException(status_code=500, detail="Failed to create bucket")

@app.post("/api/buckets/clone")
def clone_bucket(req: CloneBucketRequest):
    try:
        # 1. Create new bucket
        minio_client.create_bucket(req.new_bucket_name)
        
        # 2. Clone contents
        count = dataset_manager.clone_bucket(req.source_bucket, req.new_bucket_name)
        
        return {"status": "success", "message": f"Cloned {count} objects to {req.new_bucket_name}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/dataset/{bucket}/{split}")
def get_dataset(bucket: str, split: str, page: int = 1, limit: int = 50, search: Optional[str] = None):
    result = dataset_manager.get_dataset(bucket, split, page, limit, search)
    return result

@app.post("/api/dataset/row")
def update_row(update: TranscriptionUpdate):
    try:
        dataset_manager.update_transcription(
            update.bucket_name,
            update.split,
            update.file_name,
            update.transcription,
            tags=update.tags,
            description=update.description
        )
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/dataset/batch/delete")
def batch_delete(req: BatchOperationRequest):
    try:
        count = dataset_manager.delete_rows(req.bucket_name, req.split, req.file_names)
        return {"status": "success", "deleted_count": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/dataset/batch/tag")
def batch_add_tag(req: BatchTagRequest):
    try:
        count = dataset_manager.add_tags_batch(req.bucket_name, req.split, req.file_names, req.tag)
        return {"status": "success", "updated_count": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/dataset/batch/copy")
def batch_copy(req: BatchCopyRequest):
    try:
        count = dataset_manager.copy_rows(req.bucket_name, req.target_bucket, req.split, req.file_names)
        return {"status": "success", "copied_count": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/dataset/batch/download")
def batch_download(req: BatchOperationRequest):
    """Download selected audio files and their metadata as a ZIP archive."""
    import zipfile
    from io import BytesIO

    try:
        buf = BytesIO()
        rows = dataset_manager.get_rows_metadata(req.bucket_name, req.split, req.file_names)

        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            # Write metadata CSV
            csv_lines = ["file_name,transcription,tags,description"]
            for row in rows:
                # Escape fields for CSV
                fields = [
                    row.get("file_name", ""),
                    row.get("transcription", ""),
                    row.get("tags", ""),
                    row.get("description", ""),
                ]
                csv_lines.append(",".join(
                    f'"{f.replace(chr(34), chr(34)+chr(34))}"' for f in fields
                ))
            zf.writestr("metadata.csv", "\n".join(csv_lines))

            # Write audio files
            for row in rows:
                fname = row.get("file_name", "")
                object_name = f"{req.split}/audio/{fname}"
                try:
                    resp = minio_client.get_object(req.bucket_name, object_name)
                    zf.writestr(f"audio/{fname}", resp.read())
                    resp.close()
                    resp.release_conn()
                except Exception:
                    logger.warning("Skipping %s during batch download", fname, exc_info=True)

        buf.seek(0)
        archive_name = f"{req.bucket_name}_{req.split}_selected.zip"
        return StreamingResponse(
            buf,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{archive_name}"'},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/upload")
async def upload_audio(
    bucket: str = Form(...),
    split: str = Form(...),
    transcription: str = Form(...),
    tags: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    file: UploadFile = File(...)
):
    try:
        content = await file.read()
        dataset_manager.add_audio_record(
            bucket,
            split,
            file.filename,
            transcription,
            content,
            tags=tags,
            description=description
        )
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/upload/bulk")
async def upload_bulk(
    bucket: str = Form(...),
    split: str = Form(...),
    csv_file: UploadFile = File(...),
    files: list[UploadFile] = File(...)
):
    try:
        csv_content = await csv_file.read()
        count = await dataset_manager.add_bulk_records(
            bucket,
            split,
            files,
            csv_content
        )
        return {"status": "success", "count": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



from backend.services.system_monitor import system_monitor

@app.get("/api/system/stats")
def get_system_stats():
    return system_monitor.get_stats()

from backend.services.training_manager import training_manager

class TrainingConfig(BaseModel):
    model_name: str = "openai/whisper-large-v3"
    bucket_name: Optional[str] = None
    output_dir: str = "lora-whisper"
    max_steps: int = 100
    learning_rate: float = 1e-4
    per_device_train_batch_size: int = 1
    eval_steps: int = 50
    # LoRA capacity. Default r=32,alpha=64 keeps backwards-compatible behavior;
    # raise r (and alpha=2*r) when the model needs to memorize more specialized
    # vocabulary (e.g. medical jargon overfit).
    lora_r: int = 32
    lora_alpha: int = 64
    do_merge: bool = False
    do_convert: bool = False
    do_upload: bool = False
    hf_repo_id: str = ""
    hf_token: str = ""

@app.post("/api/train/start")
def start_training(config: TrainingConfig):
    try:
        training_manager.start_training(config.dict())
        return {"status": "success", "message": "Training started"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/train/stop")
def stop_training():
    try:
        training_manager.stop_training()
        return {"status": "success", "message": "Training stop signal sent"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/train/status")
def get_training_status():
    return training_manager.get_status()

@app.get("/api/train/models")
def get_available_models():
    return {
        "models": [
            "openai/whisper-tiny",
            "openai/whisper-base",
            "openai/whisper-small",
            "openai/whisper-medium",
            "openai/whisper-large-v2",
            "openai/whisper-large-v3",
        ]
    }

class UploadModelRequest(BaseModel):
    model_name: str
    variant: Optional[str] = None # 'lora', 'merged', 'ct2'
    source: str = "custom" 
    repo_id: str
    hf_token: str

@app.post("/api/train/upload")
def upload_model(request: UploadModelRequest):
    try:
        # Resolve path - reusing evaluate_manager logic
        model_path = evaluate_manager._get_model_path(request.model_name, request.source, request.variant)

        training_manager.start_upload_task(model_path, request.repo_id, request.hf_token)
        return {"status": "success", "message": "Upload task started"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class PreprocessLongAudioRequest(BaseModel):
    source_bucket: str
    target_bucket: str
    splits: str = "train,test"
    max_chunk_sec: float = 25.0
    min_chunk_sec: float = 1.0
    confidence_threshold: float = 0.7
    whisper_model: str = "small"
    language: str = "zh"


@app.post("/api/dataset/preprocess-long-audio")
def preprocess_long_audio(req: PreprocessLongAudioRequest):
    """Queue a job that splits >25s audio into chunks with aligned transcripts.
    Progress is exposed through the same /api/train/status endpoint as training."""
    try:
        training_manager.start_preprocess_task(
            source_bucket=req.source_bucket,
            target_bucket=req.target_bucket,
            splits=req.splits,
            max_chunk_sec=req.max_chunk_sec,
            min_chunk_sec=req.min_chunk_sec,
            confidence_threshold=req.confidence_threshold,
            whisper_model=req.whisper_model,
            language=req.language,
        )
        return {"status": "success", "message": "Preprocess task started"}
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("preprocess-long-audio failed to start")
        raise HTTPException(status_code=500, detail="Failed to start preprocess task")


from fastapi.responses import StreamingResponse
import asyncio
import json

@app.get("/api/events")
async def sse_events():
    async def event_generator():
        while True:
            # 1. System Stats
            try:
                stats = system_monitor.get_stats()
                yield f"event: system_stats\ndata: {json.dumps(stats)}\n\n"
            except Exception:
                logger.warning("Error getting system stats", exc_info=True)

            # 2. Training Status
            try:
                status = training_manager.get_status()
                yield f"event: training_status\ndata: {json.dumps(status)}\n\n"
            except Exception:
                logger.warning("Error getting training status", exc_info=True)

            await asyncio.sleep(2)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# =============================================================================
# EVALUATE API ENDPOINTS
# =============================================================================
from backend.services.evaluate_manager import evaluate_manager
import tempfile
import os as os_module

class InferRequest(BaseModel):
    model_name: str
    source: str  # "custom" or "official"
    variant: Optional[str] = None  # "ct2", "merged", or None
    # Audio source options
    audio_source: str  # "bucket", "upload", "recording"
    bucket_name: Optional[str] = None
    file_name: Optional[str] = None
    audio_base64: Optional[str] = None

class CompareRequest(BaseModel):
    model_a: dict  # {"name": str, "source": str, "variant": str}
    model_b: dict  # {"name": str, "source": str, "variant": str}
    # Audio source options
    audio_source: str
    bucket_name: Optional[str] = None
    file_name: Optional[str] = None
    audio_base64: Optional[str] = None


@app.get("/api/evaluate/models")
def get_available_models_for_eval():
    """List all available models for evaluation (custom + official)."""
    try:
        models = evaluate_manager.list_available_models()
        return {
            "models": [
                {
                    "name": m.name,
                    "path": m.path,
                    "source": m.source,
                    "variants": m.variants,
                    "created_at": m.created_at
                }
                for m in models
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/system/gpu-status")
def get_gpu_status():
    """Get GPU memory status and cached models info."""
    try:
        cache_info = evaluate_manager.get_cache_info()
        return cache_info
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/system/release-gpu")
def release_gpu_memory():
    """Release GPU memory by clearing all cached models."""
    try:
        result = evaluate_manager.clear_cache()
        return {
            "success": True,
            "message": f"Cleared {result['count']} cached items",
            **result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _get_audio_path(audio_source: str, bucket_name: Optional[str], file_name: Optional[str], audio_base64: Optional[str]) -> str:
    """Helper to resolve audio path from different sources."""
    if audio_source == "bucket" and bucket_name and file_name:
        # Download from MinIO to temp file
        # file_name now contains full object path like "train/filename.wav"
        object_name = file_name
        fd, temp_path = tempfile.mkstemp(suffix=".wav")
        os_module.close(fd)
        try:
            minio_client.client.fget_object(bucket_name, object_name, temp_path)
        except Exception as e:
            _safe_remove_temp_file(temp_path)
            raise ValueError(f"File not found in bucket: {bucket_name}/{object_name}. Error: {str(e)}")
        return temp_path
    elif audio_source == "recording" and audio_base64:
        return evaluate_manager.save_audio_from_base64(audio_base64)
    else:
        raise ValueError(f"Invalid audio source configuration: {audio_source}")


@app.post("/api/evaluate/infer")
async def infer_single(request: InferRequest):
    """Run inference with a single model."""
    audio_path = None
    try:
        audio_path = _get_audio_path(
            request.audio_source,
            request.bucket_name,
            request.file_name,
            request.audio_base64
        )

        result = evaluate_manager.infer(
            model_name=request.model_name,
            source=request.source,
            variant=request.variant,
            audio_path=audio_path
        )

        return {
            "transcription": result.transcription,
            "confidence": result.confidence,
            "inference_time_ms": result.inference_time_ms,
            "language": result.language
        }
    except ValueError as e:
        logger.warning("Invalid evaluate/infer request: %s", e)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("evaluate/infer failed")
        raise HTTPException(status_code=500, detail="Inference failed")
    finally:
        _safe_remove_temp_file(audio_path)


@app.post("/api/evaluate/infer-upload")
async def infer_with_upload(
    model_name: str = Form(...),
    source: str = Form(...),
    variant: Optional[str] = Form(None),
    audio_file: UploadFile = File(...)
):
    """Run inference with an uploaded audio file."""
    temp_path = None
    try:
        # Save uploaded file to temp
        fd, temp_path = tempfile.mkstemp(suffix=".wav")
        with os_module.fdopen(fd, 'wb') as f:
            content = await audio_file.read()
            f.write(content)
        
        result = evaluate_manager.infer(
            model_name=model_name,
            source=source,
            variant=variant,
            audio_path=temp_path
        )

        return {
            "transcription": result.transcription,
            "confidence": result.confidence,
            "inference_time_ms": result.inference_time_ms,
            "language": result.language
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        _safe_remove_temp_file(temp_path)


@app.post("/api/evaluate/compare")
async def compare_models(request: CompareRequest):
    """Compare two models on the same audio."""
    audio_path = None
    try:
        audio_path = _get_audio_path(
            request.audio_source,
            request.bucket_name,
            request.file_name,
            request.audio_base64
        )
        
        result = evaluate_manager.compare(
            model_a=request.model_a,
            model_b=request.model_b,
            audio_path=audio_path
        )

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        _safe_remove_temp_file(audio_path)



@app.post("/api/evaluate/save")
async def save_evaluation_result(
    transcription: str = Form(...),
    target_bucket: str = Form(...),
    splits: str = Form(...),  # JSON string list e.g. '["train", "test"]'
    audio_source: str = Form(...),  # "bucket" or "upload"
    # For bucket source
    source_bucket: Optional[str] = Form(None),
    source_file: Optional[str] = Form(None),
    # For upload/mic source
    audio_file: Optional[UploadFile] = File(None)
):
    try:
        import json
        target_splits = json.loads(splits)
        if not target_splits:
            raise HTTPException(status_code=400, detail="At least one split (train/test) must be selected")

        audio_content = None
        file_name = None

        if audio_source == "bucket":
            if not source_bucket or not source_file:
                 raise HTTPException(status_code=400, detail="Source bucket and file required for bucket source")
            
            # Fetch from MinIO source
            # source_file is the full object path e.g. "train/audio/file.wav"
            # But wait, dataset_manager.add_audio_record expects just the filename part for the clean name,
            # and it puts it into {split}/audio/{filename}.
            # We should probably preserve the original filename.
            
            try:
                response = minio_client.client.get_object(source_bucket, source_file)
                audio_content = response.read()
                response.close()
                response.release_conn()
                file_name = source_file.split('/')[-1] # Extract filename from path
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Could not read source file: {e}")

        elif audio_source == "upload":
            if not audio_file:
                 raise HTTPException(status_code=400, detail="Audio file required for upload source")
            audio_content = await audio_file.read()
            file_name = audio_file.filename or f"eval_{os_module.urandom(4).hex()}.wav"
        
        else:
             raise HTTPException(status_code=400, detail="Invalid audio source")

        # Save to dataset
        results = dataset_manager.save_evaluation_data(
            target_bucket=target_bucket,
            splits=target_splits,
            file_name=file_name,
            transcription=transcription,
            audio_data=audio_content
        )

        return {"status": "success", "results": results}

    except HTTPException:
        raise
    except Exception:
        logger.exception("evaluate/save failed")
        raise HTTPException(status_code=500, detail="Failed to save evaluation result")


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
