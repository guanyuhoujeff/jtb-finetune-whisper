# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Dict, Optional

from .config import MinioConfig, HuggingFaceConfig


@dataclass
class DatasetConfig:
    source_root: str
    output_root: str
    split_ratio: float = 0.9
    seed: int = 42


@dataclass
class TrainConfig:
    model_name: str
    output_dir: str
    max_steps: int = 6000
    eval_steps: int = 500
    per_device_train_batch_size: int = 1
    gradient_accumulation_steps: int = 4
    learning_rate: float = 1e-4
    warmup_steps: int = 50
    evaluation_strategy: str = "steps"
    logging_steps: int = 25
    fp16: bool = True
    gradient_checkpointing: bool = True
    optim: str = "paged_adamw_8bit"
    generation_max_length: int = 128
    save_total_limit: int = 1


@dataclass
class MergeConfig:
    lora_checkpoint: Optional[str] = None
    output_dir: str = ""
    local_files_only: bool = False


@dataclass
class CT2Config:
    model_path: str
    output_dir: str
    quantization: str = "float16"


@dataclass
class PipelineConfig:
    dataset: DatasetConfig
    minio: MinioConfig
    train: TrainConfig
    merge: MergeConfig
    ct2: CT2Config
    hf: HuggingFaceConfig


def _parse_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "y"}


def load_env_file(path: str) -> Dict[str, str]:
    data: Dict[str, str] = {}
    if not path:
        return data
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            raw = line.strip()
            if not raw or raw.startswith("#"):
                continue
            if "=" not in raw:
                continue
            key, value = raw.split("=", 1)
            data[key.strip()] = value.strip().strip('"').strip("'")
    return data


def load_yaml_file(path: str) -> Dict[str, Any]:
    try:
        import yaml  # type: ignore
    except Exception as exc:  # pragma: no cover - optional dependency
        raise RuntimeError("PyYAML not installed. Add pyyaml to requirements.txt") from exc

    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def load_json_file(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def env_to_config(env: Dict[str, str]) -> PipelineConfig:
    dataset = DatasetConfig(
        source_root=env.get("DATASET_SOURCE_ROOT", ""),
        output_root=env.get("DATASET_OUTPUT_ROOT", ""),
        split_ratio=float(env.get("DATASET_SPLIT_RATIO", 0.9)),
        seed=int(env.get("DATASET_SEED", 42)),
    )
    minio = MinioConfig(
        endpoint=env.get("MINIO_ENDPOINT", ""),
        access_key=env.get("MINIO_ACCESS_KEY", ""),
        secret_key=env.get("MINIO_SECRET_KEY", ""),
        bucket_name=env.get("MINIO_BUCKET", ""),
        secure=_parse_bool(env.get("MINIO_SECURE"), False),
    )
    train = TrainConfig(
        model_name=env.get("TRAIN_MODEL_NAME", "openai/whisper-large-v2"),
        output_dir=env.get("TRAIN_OUTPUT_DIR", ""),
        max_steps=int(env.get("TRAIN_MAX_STEPS", 6000)),
        eval_steps=int(env.get("TRAIN_EVAL_STEPS", 500)),
        per_device_train_batch_size=int(env.get("TRAIN_BATCH_SIZE", 1)),
        gradient_accumulation_steps=int(env.get("TRAIN_GRAD_ACCUM_STEPS", 4)),
        learning_rate=float(env.get("TRAIN_LEARNING_RATE", 1e-4)),
        warmup_steps=int(env.get("TRAIN_WARMUP_STEPS", 50)),
        evaluation_strategy=env.get("TRAIN_EVAL_STRATEGY", "steps"),
        logging_steps=int(env.get("TRAIN_LOGGING_STEPS", 25)),
        fp16=_parse_bool(env.get("TRAIN_FP16"), True),
        gradient_checkpointing=_parse_bool(env.get("TRAIN_GRADIENT_CHECKPOINTING"), True),
        optim=env.get("TRAIN_OPTIM", "paged_adamw_8bit"),
        generation_max_length=int(env.get("TRAIN_GENERATION_MAX_LENGTH", 128)),
        save_total_limit=int(env.get("TRAIN_SAVE_TOTAL_LIMIT", 1)),
    )
    merge = MergeConfig(
        lora_checkpoint=env.get("MERGE_LORA_CHECKPOINT") or None,
        output_dir=env.get("MERGE_OUTPUT_DIR", ""),
        local_files_only=_parse_bool(env.get("MERGE_LOCAL_FILES_ONLY"), False),
    )
    ct2 = CT2Config(
        model_path=env.get("CT2_MODEL_PATH", ""),
        output_dir=env.get("CT2_OUTPUT_DIR", ""),
        quantization=env.get("CT2_QUANTIZATION", "float16"),
    )
    hf = HuggingFaceConfig(
        repo_id=env.get("HF_REPO_ID", ""),
        token=env.get("HF_TOKEN", None),
    )
    return PipelineConfig(dataset=dataset, minio=minio, train=train, merge=merge, ct2=ct2, hf=hf)


def dict_to_config(data: Dict[str, Any]) -> PipelineConfig:
    dataset_data = data.get("dataset", {})
    minio_data = data.get("minio", {})
    train_data = data.get("train", {})
    merge_data = data.get("merge", {})
    ct2_data = data.get("ct2", {})
    hf_data = data.get("hf", {})

    dataset = DatasetConfig(
        source_root=dataset_data.get("source_root", ""),
        output_root=dataset_data.get("output_root", ""),
        split_ratio=float(dataset_data.get("split_ratio", 0.9)),
        seed=int(dataset_data.get("seed", 42)),
    )
    minio = MinioConfig(
        endpoint=minio_data.get("endpoint", ""),
        access_key=minio_data.get("access_key", ""),
        secret_key=minio_data.get("secret_key", ""),
        bucket_name=minio_data.get("bucket_name", ""),
        secure=_parse_bool(minio_data.get("secure"), False),
    )
    train = TrainConfig(
        model_name=train_data.get("model_name", "openai/whisper-large-v2"),
        output_dir=train_data.get("output_dir", ""),
        max_steps=int(train_data.get("max_steps", 6000)),
        eval_steps=int(train_data.get("eval_steps", 500)),
        per_device_train_batch_size=int(train_data.get("per_device_train_batch_size", 1)),
        gradient_accumulation_steps=int(train_data.get("gradient_accumulation_steps", 4)),
        learning_rate=float(train_data.get("learning_rate", 1e-4)),
        warmup_steps=int(train_data.get("warmup_steps", 50)),
        evaluation_strategy=train_data.get("evaluation_strategy", "steps"),
        logging_steps=int(train_data.get("logging_steps", 25)),
        fp16=_parse_bool(train_data.get("fp16", True), True),
        gradient_checkpointing=_parse_bool(train_data.get("gradient_checkpointing", True), True),
        optim=train_data.get("optim", "paged_adamw_8bit"),
        generation_max_length=int(train_data.get("generation_max_length", 128)),
        save_total_limit=int(train_data.get("save_total_limit", 1)),
    )
    merge = MergeConfig(
        lora_checkpoint=merge_data.get("lora_checkpoint") or None,
        output_dir=merge_data.get("output_dir", ""),
        local_files_only=_parse_bool(merge_data.get("local_files_only"), False),
    )
    ct2 = CT2Config(
        model_path=ct2_data.get("model_path", ""),
        output_dir=ct2_data.get("output_dir", ""),
        quantization=ct2_data.get("quantization", "float16"),
    )
    hf = HuggingFaceConfig(
        repo_id=hf_data.get("repo_id", ""),
        token=hf_data.get("token", None),
    )
    return PipelineConfig(dataset=dataset, minio=minio, train=train, merge=merge, ct2=ct2, hf=hf)


def load_pipeline_config(path: str) -> PipelineConfig:
    if not path:
        raise ValueError("config path is required")

    ext = os.path.splitext(path)[1].lower()
    if ext in {".yml", ".yaml"}:
        return dict_to_config(load_yaml_file(path))
    if ext == ".json":
        return dict_to_config(load_json_file(path))
    if ext == ".env":
        return env_to_config(load_env_file(path))

    # Fallback: try json then env
    try:
        return dict_to_config(load_json_file(path))
    except Exception:
        return env_to_config(load_env_file(path))
