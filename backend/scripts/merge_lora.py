# -*- coding: utf-8 -*-
from __future__ import annotations

import argparse
import os
import warnings
warnings.filterwarnings("ignore")
from glob import glob

from peft import PeftModel, PeftConfig
from transformers import WhisperForConditionalGeneration, WhisperFeatureExtractor, WhisperTokenizerFast, WhisperProcessor


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Merge LoRA adapter into base Whisper model")
    parser.add_argument("--lora-checkpoint", help="Path to a LoRA checkpoint (adapter)")
    parser.add_argument("--output-dir", required=True, help="Output directory for merged model")
    parser.add_argument("--local-files-only", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    lora_model = args.lora_checkpoint
    if not lora_model:
        checkpoints = glob(os.path.join(os.getcwd(), "checkpoint-*"))
        if not checkpoints:
            raise FileNotFoundError("No checkpoint found. Provide --lora-checkpoint")
        lora_model = sorted(checkpoints)[-1]

    if not os.path.exists(lora_model):
        raise FileNotFoundError(f"LoRA checkpoint not found: {lora_model}")

    peft_config = PeftConfig.from_pretrained(lora_model)
    base_model = WhisperForConditionalGeneration.from_pretrained(
        peft_config.base_model_name_or_path,
        device_map={"": "cpu"},
        local_files_only=args.local_files_only,
    )

    model = PeftModel.from_pretrained(base_model, lora_model, local_files_only=args.local_files_only)
    feature_extractor = WhisperFeatureExtractor.from_pretrained(
        peft_config.base_model_name_or_path, local_files_only=args.local_files_only
    )
    tokenizer = WhisperTokenizerFast.from_pretrained(
        peft_config.base_model_name_or_path, local_files_only=args.local_files_only
    )
    processor = WhisperProcessor.from_pretrained(
        peft_config.base_model_name_or_path, local_files_only=args.local_files_only
    )

    model = model.merge_and_unload()
    model.train(False)

    if peft_config.base_model_name_or_path.endswith("/"):
        peft_config.base_model_name_or_path = peft_config.base_model_name_or_path[:-1]

    os.makedirs(args.output_dir, exist_ok=True)

    model.save_pretrained(args.output_dir, max_shard_size="4GB")
    feature_extractor.save_pretrained(args.output_dir)
    tokenizer.save_pretrained(args.output_dir)
    processor.save_pretrained(args.output_dir)

    print(f"Merged model saved to: {args.output_dir}")


if __name__ == "__main__":
    main()
