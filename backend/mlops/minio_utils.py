# -*- coding: utf-8 -*-
from __future__ import annotations

import os
from typing import Dict

from handler import MinioHandler
from .config import MinioConfig


def set_minio_env_vars(cfg: MinioConfig) -> None:
    """
    Ensure boto/s3fs can find MinIO credentials and endpoint.
    """
    os.environ["AWS_ACCESS_KEY_ID"] = cfg.access_key
    os.environ["AWS_SECRET_ACCESS_KEY"] = cfg.secret_key
    os.environ["AWS_ENDPOINT_URL"] = f"http://{cfg.endpoint}"
    os.environ["S3_ENDPOINT_URL"] = f"http://{cfg.endpoint}"


def get_storage_options(cfg: MinioConfig) -> Dict[str, Dict[str, str]]:
    return {
        "client_kwargs": {
            "endpoint_url": f"http://{cfg.endpoint}",
            "region_name": "us-east-1",
        }
    }


def create_minio_handler(cfg: MinioConfig) -> MinioHandler:
    return MinioHandler(
        cfg.endpoint,
        cfg.access_key,
        cfg.secret_key,
        cfg.bucket_name,
        secure=cfg.secure,
    )
