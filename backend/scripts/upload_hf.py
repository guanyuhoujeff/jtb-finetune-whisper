# -*- coding: utf-8 -*-
from __future__ import annotations

import argparse
import warnings
warnings.filterwarnings("ignore")

from backend.mlops.config import HuggingFaceConfig
from backend.mlops.hf_utils import upload_folder


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Upload a model folder to HuggingFace Hub")
    parser.add_argument("--repo-id", required=True)
    parser.add_argument("--folder", required=True)
    parser.add_argument("--token", default=None)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    cfg = HuggingFaceConfig(repo_id=args.repo_id, token=args.token)
    upload_folder(cfg, args.folder)


if __name__ == "__main__":
    main()
