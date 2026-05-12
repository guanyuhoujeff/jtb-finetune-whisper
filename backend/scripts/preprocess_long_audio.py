# -*- coding: utf-8 -*-
"""
CLI: pre-process long audio files in a MinIO dataset bucket so each training
sample fits Whisper's 30s window with a properly aligned transcript.

For each row in {split}/metadata.csv of the source bucket:
  - duration ≤ MAX_CHUNK_SEC → copied as-is to the target bucket.
  - duration  > MAX_CHUNK_SEC → split via VAD; transcript split via Whisper
                                word-level alignment to the user's GT.

Outputs in the target bucket:
  - {split}/audio/<original_stem>_partNN.wav
  - {split}/metadata.csv          (high-confidence chunks only)
  - {split}/low_confidence.csv    (chunks below --confidence-threshold,
                                   for human review — NOT used for training)

Usage:
  python -m backend.scripts.preprocess_long_audio \\
    --source-bucket raw-recordings \\
    --target-bucket chunked-recordings \\
    --minio-endpoint minio:9000 \\
    --minio-access-key ... --minio-secret-key ... \\
    --max-chunk-sec 25 --confidence-threshold 0.7 \\
    --whisper-model small --language zh
"""

from __future__ import annotations

import argparse
import io
import logging
import os
import sys
import warnings
from dataclasses import dataclass
from typing import List, Optional

warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd
import soundfile as sf
import librosa

from backend.mlops.audio_chunker import (
    DEFAULT_CONFIDENCE_THRESHOLD,
    DEFAULT_MAX_CHUNK_SEC,
    ChunkResult,
    chunk_long_audio,
    load_whisper_model,
)

logger = logging.getLogger("preprocess_long_audio")

TARGET_SAMPLE_RATE = 16000
SUPPORTED_SPLITS = ("train", "test")


@dataclass
class CliArgs:
    source_bucket: str
    target_bucket: str
    minio_endpoint: str
    minio_access_key: str
    minio_secret_key: str
    minio_secure: bool
    splits: List[str]
    max_chunk_sec: float
    min_chunk_sec: float
    confidence_threshold: float
    whisper_model: str
    language: str


def parse_args(argv: Optional[List[str]] = None) -> CliArgs:
    p = argparse.ArgumentParser(
        description=(
            "Pre-process long audio files in a MinIO bucket: split >30s clips "
            "into ≤25s chunks with aligned transcripts."
        )
    )
    p.add_argument("--source-bucket", required=True)
    p.add_argument("--target-bucket", required=True)
    p.add_argument("--minio-endpoint", default=os.getenv("MINIO_ENDPOINT", "minio:9000"))
    p.add_argument("--minio-access-key", default=os.getenv("MINIO_ACCESS_KEY"))
    p.add_argument("--minio-secret-key", default=os.getenv("MINIO_SECRET_KEY"))
    p.add_argument("--minio-secure", action="store_true")
    p.add_argument(
        "--splits",
        default="train,test",
        help="Comma-separated splits to process (default: train,test).",
    )
    p.add_argument("--max-chunk-sec", type=float, default=DEFAULT_MAX_CHUNK_SEC)
    p.add_argument("--min-chunk-sec", type=float, default=1.0)
    p.add_argument(
        "--confidence-threshold",
        type=float,
        default=DEFAULT_CONFIDENCE_THRESHOLD,
        help="Chunks below this score go to low_confidence.csv instead of metadata.csv.",
    )
    p.add_argument("--whisper-model", default="small")
    p.add_argument("--language", default="zh")

    ns = p.parse_args(argv)
    if ns.source_bucket == ns.target_bucket:
        p.error("--source-bucket and --target-bucket must be different.")
    if not ns.minio_access_key or not ns.minio_secret_key:
        p.error("MinIO credentials missing. Set MINIO_ACCESS_KEY / MINIO_SECRET_KEY or pass flags.")

    return CliArgs(
        source_bucket=ns.source_bucket,
        target_bucket=ns.target_bucket,
        minio_endpoint=ns.minio_endpoint,
        minio_access_key=ns.minio_access_key,
        minio_secret_key=ns.minio_secret_key,
        minio_secure=ns.minio_secure,
        splits=[s.strip() for s in ns.splits.split(",") if s.strip()],
        max_chunk_sec=ns.max_chunk_sec,
        min_chunk_sec=ns.min_chunk_sec,
        confidence_threshold=ns.confidence_threshold,
        whisper_model=ns.whisper_model,
        language=ns.language,
    )


def _make_minio_client(args: CliArgs):
    from minio import Minio  # noqa: WPS433

    return Minio(
        args.minio_endpoint,
        access_key=args.minio_access_key,
        secret_key=args.minio_secret_key,
        secure=args.minio_secure,
    )


def _read_object_bytes(client, bucket: str, key: str) -> bytes:
    resp = client.get_object(bucket, key)
    try:
        return resp.read()
    finally:
        resp.close()
        resp.release_conn()


def _put_object_bytes(client, bucket: str, key: str, data: bytes, content_type: str) -> None:
    client.put_object(
        bucket,
        key,
        io.BytesIO(data),
        length=len(data),
        content_type=content_type,
    )


def _load_audio_mono16k(audio_bytes: bytes) -> np.ndarray:
    audio, sr = sf.read(io.BytesIO(audio_bytes), dtype="float32", always_2d=False)
    if audio.ndim == 2:
        audio = audio.mean(axis=1)
    if sr != TARGET_SAMPLE_RATE:
        audio = librosa.resample(y=audio, orig_sr=sr, target_sr=TARGET_SAMPLE_RATE)
    return audio.astype(np.float32, copy=False)


def _encode_wav(audio: np.ndarray, sr: int) -> bytes:
    buf = io.BytesIO()
    sf.write(buf, audio, sr, format="WAV", subtype="PCM_16")
    return buf.getvalue()


def _chunk_filename(original_filename: str, idx: int) -> str:
    """Chunk filename. Always uses .wav because _encode_wav always emits WAV
    regardless of the source format (mp3/m4a/flac/... are decoded then
    re-encoded as 16kHz mono PCM_16 WAV). Keeping the source extension would
    leave WAV bytes inside a file named .mp3, which breaks downstream readers
    that rely on the extension."""
    stem = original_filename.rsplit(".", 1)[0]
    return f"{stem}_part{idx:02d}.wav"


def process_split(
    args: CliArgs,
    client,
    split: str,
    whisper_model,
) -> None:
    src_csv_key = f"{split}/metadata.csv"
    try:
        csv_bytes = _read_object_bytes(client, args.source_bucket, src_csv_key)
    except Exception:
        logger.warning("No %s in %s — skipping split.", src_csv_key, args.source_bucket)
        return

    df = pd.read_csv(io.BytesIO(csv_bytes), dtype=str, keep_default_na=False)
    required = {"file_name", "transcription"}
    missing = required - set(df.columns)
    if missing:
        logger.error("Source %s missing columns: %s", src_csv_key, missing)
        return

    out_rows: List[dict] = []
    low_conf_rows: List[dict] = []

    for row_idx, row in enumerate(df.itertuples(index=False)):
        row_dict = {col: getattr(row, col, "") for col in df.columns}
        file_name = row_dict["file_name"]
        gt = row_dict["transcription"] or ""

        try:
            src_audio_key = f"{split}/audio/{file_name}"
            audio_bytes = _read_object_bytes(client, args.source_bucket, src_audio_key)
        except Exception:
            logger.warning("[%s] cannot fetch audio: %s/%s — skipped.",
                           split, args.source_bucket, src_audio_key)
            continue

        try:
            audio = _load_audio_mono16k(audio_bytes)
        except Exception:
            logger.exception("[%s] failed to decode %s — skipped.", split, file_name)
            continue

        duration = len(audio) / TARGET_SAMPLE_RATE
        try:
            chunks = chunk_long_audio(
                audio,
                TARGET_SAMPLE_RATE,
                gt,
                max_chunk_sec=args.max_chunk_sec,
                min_chunk_sec=args.min_chunk_sec,
                confidence_threshold=args.confidence_threshold,
                language=args.language,
                whisper_model=whisper_model,
                whisper_model_size=args.whisper_model,
            )
        except Exception:
            logger.exception("[%s] chunking failed for %s — skipped.", split, file_name)
            continue

        if not chunks:
            logger.warning("[%s] %s produced no chunks (silent or VAD failed).",
                           split, file_name)
            continue

        logger.info(
            "[%s] %s: %.1fs -> %d chunk(s)", split, file_name, duration, len(chunks),
        )

        for idx, chunk in enumerate(chunks, start=1):
            chunk_name = _chunk_filename(file_name, idx) if len(chunks) > 1 else file_name
            chunk_audio_key = f"{split}/audio/{chunk_name}"
            target_audio_uri = f"s3://{args.target_bucket}/{chunk_audio_key}"

            base_row = {
                **row_dict,
                "file_name": chunk_name,
                "audio": target_audio_uri,
                "transcription": chunk.gt_transcript,
            }
            base_row.setdefault("tags", row_dict.get("tags", ""))
            base_row.setdefault("description", row_dict.get("description", ""))

            wav_bytes = _encode_wav(chunk.audio, chunk.sample_rate)
            _put_object_bytes(
                client, args.target_bucket, chunk_audio_key, wav_bytes, "audio/wav"
            )

            if chunk.confidence < args.confidence_threshold and len(chunks) > 1:
                base_row["confidence"] = f"{chunk.confidence:.3f}"
                base_row["whisper_transcript"] = chunk.whisper_transcript
                base_row["t_start_sec"] = f"{chunk.t_start_sec:.2f}"
                base_row["t_end_sec"] = f"{chunk.t_end_sec:.2f}"
                base_row["source_file"] = file_name
                low_conf_rows.append(base_row)
            else:
                out_rows.append(base_row)

        if (row_idx + 1) % 25 == 0:
            logger.info("[%s] processed %d/%d rows", split, row_idx + 1, len(df))

    _write_csv(client, args.target_bucket, f"{split}/metadata.csv", out_rows)
    if low_conf_rows:
        _write_csv(
            client, args.target_bucket, f"{split}/low_confidence.csv", low_conf_rows
        )
        logger.warning(
            "[%s] %d chunk(s) below confidence threshold %.2f — review %s/low_confidence.csv.",
            split,
            len(low_conf_rows),
            args.confidence_threshold,
            args.target_bucket,
        )


def _write_csv(client, bucket: str, key: str, rows: List[dict]) -> None:
    if not rows:
        # Still write an empty CSV with whatever schema we know — downstream
        # code expects the file to exist.
        df = pd.DataFrame(columns=["file_name", "audio", "transcription"])
    else:
        df = pd.DataFrame(rows)
    buf = io.BytesIO()
    df.to_csv(buf, index=False)
    payload = buf.getvalue()
    _put_object_bytes(client, bucket, key, payload, "text/csv")


def main(argv: Optional[List[str]] = None) -> int:
    logging.basicConfig(
        level=os.getenv("BACKEND_LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    args = parse_args(argv)

    invalid_splits = [s for s in args.splits if s not in SUPPORTED_SPLITS]
    if invalid_splits:
        logger.error("Unknown split(s): %s. Supported: %s", invalid_splits, SUPPORTED_SPLITS)
        return 2

    client = _make_minio_client(args)
    if not client.bucket_exists(args.source_bucket):
        logger.error("Source bucket %s does not exist.", args.source_bucket)
        return 2
    if not client.bucket_exists(args.target_bucket):
        logger.info("Target bucket %s does not exist — creating it.", args.target_bucket)
        client.make_bucket(args.target_bucket)

    logger.info("Loading Whisper model %s ...", args.whisper_model)
    whisper_model = load_whisper_model(args.whisper_model)

    for split in args.splits:
        logger.info("=== Processing split: %s ===", split)
        process_split(args, client, split, whisper_model)

    logger.info("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
