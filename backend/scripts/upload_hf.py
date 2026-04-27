# -*- coding: utf-8 -*-
from __future__ import annotations

import argparse
import os
import sys
import warnings

warnings.filterwarnings("ignore")

from backend.mlops.config import HuggingFaceConfig
from backend.mlops.hf_utils import upload_folder


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Upload a model folder to HuggingFace Hub")
    parser.add_argument("--repo-id", required=True)
    parser.add_argument("--folder", required=True)
    parser.add_argument(
        "--token-from",
        choices=("env", "stdin"),
        default="env",
        help=(
            "Where to read the HF token from. 'env' reads HF_TOKEN from the environment "
            "(default). 'stdin' reads a single line from stdin. The token is never "
            "passed via argv to avoid leaking it through `ps`/audit logs."
        ),
    )
    return parser.parse_args()


def _read_token(source: str) -> str | None:
    if source == "stdin":
        token = sys.stdin.readline().strip()
        return token or None
    return (os.environ.get("HF_TOKEN") or "").strip() or None


def main() -> None:
    args = parse_args()
    token = _read_token(args.token_from)
    if not token:
        raise SystemExit(
            "HuggingFace token is missing. Provide it via HF_TOKEN env var or "
            "--token-from stdin."
        )
    cfg = HuggingFaceConfig(repo_id=args.repo_id, token=token)
    upload_folder(cfg, args.folder)


if __name__ == "__main__":
    main()
