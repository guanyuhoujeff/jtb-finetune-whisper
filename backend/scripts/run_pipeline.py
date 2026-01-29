# -*- coding: utf-8 -*-
from __future__ import annotations

import argparse
import warnings
warnings.filterwarnings("ignore")

from backend.mlops.pipeline import run_pipeline
from backend.mlops.settings import load_pipeline_config


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run end-to-end Whisper MLOps pipeline")
    parser.add_argument("--config", required=True, help="Path to .env/.yaml/.json config")

    parser.add_argument("--prepare", action="store_true", help="Run dataset prepare + upload")
    parser.add_argument("--train", action="store_true", help="Run LoRA training")
    parser.add_argument("--merge", action="store_true", help="Merge LoRA into base model")
    parser.add_argument("--ct2", action="store_true", help="Convert to CTranslate2")
    parser.add_argument("--upload", action="store_true", help="Upload model folder to HF")
    parser.add_argument("--all", action="store_true", help="Run all steps")

    return parser.parse_args()


def main() -> None:
    args = parse_args()
    cfg = load_pipeline_config(args.config)

    if args.all:
        run_pipeline(cfg, True, True, True, True, True)
        return

    run_pipeline(cfg, args.prepare, args.train, args.merge, args.ct2, args.upload)


if __name__ == "__main__":
    main()
