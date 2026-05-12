# -*- coding: utf-8 -*-
from __future__ import annotations

import argparse
import os
import warnings
warnings.filterwarnings("ignore")

import evaluate
from backend.mlops.minio_utils import set_minio_env_vars
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from transformers import Seq2SeqTrainingArguments, Seq2SeqTrainer

from backend.mlops.config import MinioConfig
from backend.mlops.settings import load_pipeline_config
from backend.mlops.whisper_utils import (
    DataCollatorSpeechSeq2SeqWithPadding,
    build_processor,
    load_quantized_model,
    load_streaming_dataset,
    prepare_dataset_fn,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train Whisper with QLoRA on MinIO dataset")
    parser.add_argument("--config", help="Path to .env/.yaml/.json config")
    parser.add_argument("--model-name", default=None)
    parser.add_argument("--output-dir", default=None)
    parser.add_argument("--max-steps", type=int, default=None)
    parser.add_argument("--eval-steps", type=int, default=None)
    parser.add_argument("--minio-endpoint", default=None)
    parser.add_argument("--minio-access-key", default=None)
    parser.add_argument("--minio-secret-key", default=None)
    parser.add_argument("--minio-bucket", default=None)
    parser.add_argument("--bucket-name", default=None, help="Bucket to train on")
    parser.add_argument("--learning-rate", type=float, default=None)
    parser.add_argument("--batch-size", type=int, default=None)
    parser.add_argument(
        "--eval-samples",
        type=int,
        default=100,
        help=(
            "Number of test samples used for mid-training eval. Whisper "
            "evaluation runs predict_with_generate=True which is much slower "
            "than training (each sample = full autoregressive decoding). "
            "Running eval on a 4k+ test set every eval_steps adds many hours "
            "to a 10k-step run, so we sample a small subset by default; pass "
            "0 to use the full test set."
        ),
    )
    parser.add_argument(
        "--lora-r",
        type=int,
        default=32,
        help="LoRA rank (capacity). Higher = more trainable params and more "
             "ability to memorize, at the cost of more VRAM and slower training. "
             "Typical: 16 (light), 32 (default), 64 (high), 128 (extreme).",
    )
    parser.add_argument(
        "--lora-alpha",
        type=int,
        default=64,
        help="LoRA alpha (scaling). Convention: alpha = 2 * r. The effective "
             "LoRA scale during forward pass is alpha / r.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    cfg = None
    if args.config:
        cfg = load_pipeline_config(args.config)

    if cfg:
        model_name = args.model_name or cfg.train.model_name
        output_dir = args.output_dir or cfg.train.output_dir
        max_steps = args.max_steps or cfg.train.max_steps
        eval_steps = args.eval_steps or cfg.train.eval_steps
        train_cfg = cfg.train
        minio_cfg = cfg.minio
    else:
        model_name = args.model_name
        output_dir = args.output_dir
        max_steps = args.max_steps or 6000
        eval_steps = args.eval_steps or 500
        train_cfg = None
        minio_cfg = MinioConfig(
            endpoint=args.minio_endpoint,
            access_key=args.minio_access_key,
            secret_key=args.minio_secret_key,
            bucket_name=args.minio_bucket,
        )

    learning_rate = args.learning_rate or (train_cfg.learning_rate if train_cfg else 1e-4)
    batch_size = args.batch_size or (train_cfg.per_device_train_batch_size if train_cfg else 1)

    # Use specified bucket or fallback to config
    target_bucket = args.bucket_name or minio_cfg.bucket_name

    if not model_name or not output_dir:
        raise ValueError("model_name and output_dir are required (via args or config)")

    train_csv = f"s3://{target_bucket}/train/metadata.csv"
    test_csv = f"s3://{target_bucket}/test/metadata.csv"
    # print("train_csv > ", train_csv)
    # print("test_csv > ", test_csv)
    dataset = load_streaming_dataset(minio_cfg, train_csv=train_csv, test_csv=test_csv)
    # print("dataset > ", dataset)
    processor = build_processor(model_name, language="chinese", task="transcribe")
    dataset = dataset.map(
        prepare_dataset_fn(processor),
        remove_columns=["audio", "file_name", "transcription"],
    )

    data_collator = DataCollatorSpeechSeq2SeqWithPadding(processor=processor)

    model = load_quantized_model(model_name)
    model.gradient_checkpointing_enable()

    training_args = Seq2SeqTrainingArguments(
        output_dir=output_dir,
        report_to=["tensorboard"],
        per_device_train_batch_size=batch_size,
        gradient_accumulation_steps=(train_cfg.gradient_accumulation_steps if train_cfg else 4),
        learning_rate=learning_rate,
        warmup_steps=(train_cfg.warmup_steps if train_cfg else 50),
        max_steps=max_steps,
        evaluation_strategy=(train_cfg.evaluation_strategy if train_cfg else "steps"),
        eval_steps=eval_steps,
        # save_steps must be a multiple of eval_steps when load_best_model_at_end=True;
        # tying them together keeps "save best by CER" consistent across configs.
        save_strategy="steps",
        save_steps=eval_steps,
        logging_steps=(train_cfg.logging_steps if train_cfg else 25),
        fp16=(train_cfg.fp16 if train_cfg else True),
        gradient_checkpointing=(train_cfg.gradient_checkpointing if train_cfg else True),
        optim=(train_cfg.optim if train_cfg else "paged_adamw_8bit"),
        remove_unused_columns=False,
        label_names=["labels"],
        predict_with_generate=True,
        generation_max_length=(train_cfg.generation_max_length if train_cfg else 128),
        load_best_model_at_end=True,
        metric_for_best_model="cer",
        greater_is_better=False,
        save_total_limit=(train_cfg.save_total_limit if train_cfg else 1),
    )

    model = prepare_model_for_kbit_training(model)
    lora_config = LoraConfig(
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        target_modules=["q_proj", "v_proj"],
        lora_dropout=0.05,
        bias="none",
    )
    print(f"[lora] r={args.lora_r}  alpha={args.lora_alpha}  scale={args.lora_alpha/args.lora_r:.2f}")
    model = get_peft_model(model, lora_config)

    metric = evaluate.load("cer")

    def compute_metrics(pred):
        pred_ids = pred.predictions
        label_ids = pred.label_ids
        label_ids[label_ids == -100] = processor.tokenizer.pad_token_id
        pred_str = processor.tokenizer.batch_decode(pred_ids, skip_special_tokens=True)
        label_str = processor.tokenizer.batch_decode(label_ids, skip_special_tokens=True)
        cer = 100 * metric.compute(predictions=pred_str, references=label_str)
        return {"cer": cer}

    # Subsample test for mid-training eval (see --eval-samples docs above for
    # why). 0 means "use full test set".
    eval_split = dataset["test"]
    if args.eval_samples and args.eval_samples > 0:
        eval_split = eval_split.take(args.eval_samples)

    trainer = Seq2SeqTrainer(
        args=training_args,
        model=model,
        train_dataset=dataset["train"],
        eval_dataset=eval_split,
        data_collator=data_collator,
        compute_metrics=compute_metrics,
        tokenizer=processor.tokenizer,
    )

    model.config.use_cache = False
    trainer.train()

    trainer.save_model()
    print("Finished training, saving model to", trainer.args.output_dir)
    


if __name__ == "__main__":
    main()
