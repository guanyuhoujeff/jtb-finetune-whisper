from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Body
import warnings
warnings.filterwarnings("ignore")
from fastapi.middleware.cors import CORSMiddleware
from backend.services.minio_client import minio_client, MINIO_ENDPOINT, BUCKET_NAME
from backend.services.dataset_manager import dataset_manager
from pydantic import BaseModel
from typing import Optional
import uvicorn
import shutil

app = FastAPI()

# CORS configuration
origins = [
    "http://localhost:5173",  # Vite default
    "http://127.0.0.1:5173",
    "*"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    try:
        # Update MinIO Client
        minio_client.update_config(
            config.endpoint,
            config.access_key,
            config.secret_key,
            secure=False # Assumed false for internal IP
        )
        # Update global bucket name context if needed, or frontend handles it passed in requests.
        # Ideally, main.py shouldn't hold state, but minio_client.py has constants. 
        # For this simple app, we update the module level variable is a bit hacky but works for singleton.
        import backend.services.minio_client as mc
        mc.BUCKET_NAME = config.bucket_name
        
        return {"status": "success", "message": "Configuration updated"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
    print("bucket name: ", bucket.bucket_name)
    try:
        minio_client.create_bucket(bucket.bucket_name)
        return {"status": "success", "message": f"Bucket {bucket.bucket_name} created"}
    except Exception as e:
        print(e)
        raise HTTPException(status_code=500, detail=str(e))

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
    """Returns a list of available Whisper models."""
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
            except Exception as e:
                print(f"Error getting system stats: {e}")

            # 2. Training Status
            try:
                status = training_manager.get_status()
                yield f"event: training_status\ndata: {json.dumps(status)}\n\n"
            except Exception as e:
                print(f"Error getting training status: {e}")

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
            # Clean up temp file on error
            try:
                os_module.remove(temp_path)
            except:
                pass
            raise ValueError(f"File not found in bucket: {bucket_name}/{object_name}. Error: {str(e)}")
        return temp_path
    elif audio_source == "recording" and audio_base64:
        return evaluate_manager.save_audio_from_base64(audio_base64)
    else:
        raise ValueError(f"Invalid audio source configuration: {audio_source}")


@app.post("/api/evaluate/infer")
async def infer_single(request: InferRequest):
    """Run inference with a single model."""
    import traceback
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
        
        # Clean up temp file
        try:
            os_module.remove(audio_path)
        except:
            pass
        
        return {
            "transcription": result.transcription,
            "confidence": result.confidence,
            "inference_time_ms": result.inference_time_ms,
            "language": result.language
        }
    except Exception as e:
        print(f"[EVALUATE ERROR] {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/evaluate/infer-upload")
async def infer_with_upload(
    model_name: str = Form(...),
    source: str = Form(...),
    variant: Optional[str] = Form(None),
    audio_file: UploadFile = File(...)
):
    """Run inference with an uploaded audio file."""
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
        
        # Clean up
        try:
            os_module.remove(temp_path)
        except:
            pass
        
        return {
            "transcription": result.transcription,
            "confidence": result.confidence,
            "inference_time_ms": result.inference_time_ms,
            "language": result.language
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/evaluate/compare")
async def compare_models(request: CompareRequest):
    """Compare two models on the same audio."""
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
        
        # Clean up temp file
        try:
            os_module.remove(audio_path)
        except:
            pass
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



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

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
