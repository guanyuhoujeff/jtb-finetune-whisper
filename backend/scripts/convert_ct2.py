# -*- coding: utf-8 -*-
from __future__ import annotations

import argparse
import warnings
warnings.filterwarnings("ignore")
from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor
from ctranslate2.converters import TransformersConverter
import os
import shutil
from typing import Optional, Tuple

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Convert HuggingFace Whisper model to CTranslate2")
    parser.add_argument("--model-path", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--quantization", default="float16")
    return parser.parse_args()

def convert_to_ct2(model_path: str, output_dir: str, quantization: str = "float16") -> None:
    if os.path.isdir(output_dir):
        shutil.rmtree(output_dir)

    converter = TransformersConverter(
        model_name_or_path=model_path,
        copy_files=["tokenizer.json", "preprocessor_config.json"],
    )
    converter.convert(
        output_dir=output_dir,
        quantization=quantization,
        force=True,
    )

def main() -> None:
    args = parse_args()
    convert_to_ct2(args.model_path, args.output_dir, args.quantization)
    print("Finish convert")

if __name__ == "__main__":
    main()
