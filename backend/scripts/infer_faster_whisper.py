# -*- coding: utf-8 -*-
from __future__ import annotations

import argparse

from faster_whisper import WhisperModel


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run inference with faster-whisper (CTranslate2)")
    parser.add_argument("--model-dir", required=True)
    parser.add_argument("--audio", required=True)
    parser.add_argument("--device", default="cuda")
    parser.add_argument("--compute-type", default="float16")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    model = WhisperModel(args.model_dir, device=args.device, compute_type=args.compute_type)
    segments, info = model.transcribe(args.audio, beam_size=1, temperature=0)

    print("Detected language:", info.language)
    transcript = ""
    for seg in segments:
        transcript += seg.text
    print(transcript)


if __name__ == "__main__":
    main()
