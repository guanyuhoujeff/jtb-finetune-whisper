# -*- coding: utf-8 -*-
from __future__ import annotations

import argparse
import warnings
warnings.filterwarnings("ignore")

from backend.mlops.config import MinioConfig
from backend.mlops.dataset_utils import split_dataset, upload_split_to_minio
from backend.mlops.minio_utils import create_minio_handler


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Split dataset and upload to MinIO")
    parser.add_argument("--source-root", required=True, help="Path containing audio/ and label/")
    parser.add_argument("--output-root", required=True, help="Output root for train/test")
    parser.add_argument("--split-ratio", type=float, default=0.9)
    parser.add_argument("--minio-endpoint", required=True)
    parser.add_argument("--minio-access-key", required=True)
    parser.add_argument("--minio-secret-key", required=True)
    parser.add_argument("--minio-bucket", required=True)
    parser.add_argument("--minio-secure", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    split_dataset(
        source_root=args.source_root,
        output_root=args.output_root,
        train_ratio=args.split_ratio,
    )

    minio_cfg = MinioConfig(
        endpoint=args.minio_endpoint,
        access_key=args.minio_access_key,
        secret_key=args.minio_secret_key,
        bucket_name=args.minio_bucket,
        secure=args.minio_secure,
    )
    minio = create_minio_handler(minio_cfg)

    for split_name in ["train", "test"]:
        upload_split_to_minio(minio, args.output_root, split_name)


if __name__ == "__main__":
    main()
