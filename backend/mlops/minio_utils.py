# -*- coding: utf-8 -*-
from __future__ import annotations

import os
from typing import Dict

from minio import Minio
from .config import MinioConfig


class MinioHandler:
    def __init__(self, endpoint, access_key, secret_key, bucket_name, secure=False):
        self.bucket_name = bucket_name
        self.client = Minio(
            endpoint,
            access_key=access_key,
            secret_key=secret_key,
            secure=secure
        )
        # Ensure bucket exists
        if not self.client.bucket_exists(bucket_name):
            self.client.make_bucket(bucket_name)

    def upload_file(self, object_name, file_path):
        self.client.fput_object(self.bucket_name, object_name, file_path)


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
