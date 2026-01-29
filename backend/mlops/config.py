# -*- coding: utf-8 -*-
from __future__ import annotations

from dataclasses import dataclass
import os


@dataclass
class MinioConfig:
    endpoint: str
    access_key: str
    secret_key: str
    bucket_name: str
    secure: bool = False

    @staticmethod
    def from_env(prefix: str = "MINIO_") -> "MinioConfig":
        return MinioConfig(
            endpoint=os.getenv(f"{prefix}ENDPOINT", ""),
            access_key=os.getenv(f"{prefix}ACCESS_KEY", ""),
            secret_key=os.getenv(f"{prefix}SECRET_KEY", ""),
            bucket_name=os.getenv(f"{prefix}BUCKET", ""),
            secure=os.getenv(f"{prefix}SECURE", "false").lower() == "true",
        )


@dataclass
class HuggingFaceConfig:
    repo_id: str
    token: str | None = None

    @staticmethod
    def from_env(prefix: str = "HF_") -> "HuggingFaceConfig":
        return HuggingFaceConfig(
            repo_id=os.getenv(f"{prefix}REPO_ID", ""),
            token=os.getenv(f"{prefix}TOKEN", None),
        )
