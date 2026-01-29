# -*- coding: utf-8 -*-
from __future__ import annotations

import argparse

import torch
import torchaudio
from transformers import WhisperForConditionalGeneration, WhisperProcessor


def load_audio_16k(path: str):
    speech_array, sampling_rate = torchaudio.load(path)
    if sampling_rate != 16000:
        resampler = torchaudio.transforms.Resample(orig_freq=sampling_rate, new_freq=16000)
        speech_array = resampler(speech_array)
    return speech_array.squeeze()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run inference with Whisper model")
    parser.add_argument("--model-dir", required=True)
    parser.add_argument("--audio", required=True)
    parser.add_argument("--language", default="zh")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    model = WhisperForConditionalGeneration.from_pretrained(args.model_dir)
    processor = WhisperProcessor.from_pretrained(args.model_dir)

    model.config.forced_decoder_ids = processor.get_decoder_prompt_ids(
        language=args.language, task="transcribe"
    )

    input_audio = load_audio_16k(args.audio)
    input_features = processor(input_audio, sampling_rate=16000, return_tensors="pt").input_features

    with torch.no_grad():
        predicted_ids = model.generate(input_features)
    transcription = processor.batch_decode(predicted_ids, skip_special_tokens=True)[0]
    print(transcription)


if __name__ == "__main__":
    main()
