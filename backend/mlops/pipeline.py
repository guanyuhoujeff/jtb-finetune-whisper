# -*- coding: utf-8 -*-
from __future__ import annotations

import os
from glob import glob
from typing import Optional

from peft import PeftConfig, PeftModel
from transformers import WhisperForConditionalGeneration, WhisperFeatureExtractor, WhisperTokenizerFast, WhisperProcessor

from .config import HuggingFaceConfig
from .ct2_utils import convert_to_ct2
from .dataset_utils import split_dataset, upload_split_to_minio
from .hf_utils import upload_folder
from .minio_utils import create_minio_handler
from .settings import PipelineConfig
from .whisper_utils import (
    DataCollatorSpeechSeq2SeqWithPadding,
    build_processor,
    load_quantized_model,
    load_streaming_dataset,
    prepare_dataset_fn,
)


def _find_latest_checkpoint(output_dir: str) -> Optional[str]:
    pattern = os.path.join(output_dir, "checkpoint-*")
    candidates = sorted(glob(pattern))
    return candidates[-1] if candidates else None


def step_prepare_dataset(cfg: PipelineConfig) -> None:
    split_dataset(
        source_root=cfg.dataset.source_root,
        output_root=cfg.dataset.output_root,
        train_ratio=cfg.dataset.split_ratio,
        seed=cfg.dataset.seed,
    )
    minio = create_minio_handler(cfg.minio)
    for split_name in ["train", "test"]:
        upload_split_to_minio(minio, cfg.dataset.output_root, split_name)


def step_train_lora(cfg: PipelineConfig) -> None:
    train_csv = f"s3://{cfg.minio.bucket_name}/train/metadata.csv"
    test_csv = f"s3://{cfg.minio.bucket_name}/test/metadata.csv"

    dataset = load_streaming_dataset(cfg.minio, train_csv=train_csv, test_csv=test_csv)
    processor = build_processor(cfg.train.model_name, language="chinese", task="transcribe")
    dataset = dataset.map(
        prepare_dataset_fn(processor),
        remove_columns=["audio", "file_name", "transcription"],
    )

    data_collator = DataCollatorSpeechSeq2SeqWithPadding(processor=processor)
    model = load_quantized_model(cfg.train.model_name)
    model.gradient_checkpointing_enable()

    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
    from transformers import Seq2SeqTrainingArguments, Seq2SeqTrainer
    import evaluate

    training_args = Seq2SeqTrainingArguments(
        output_dir=cfg.train.output_dir,
        report_to=["tensorboard"],
        per_device_train_batch_size=cfg.train.per_device_train_batch_size,
        gradient_accumulation_steps=cfg.train.gradient_accumulation_steps,
        learning_rate=cfg.train.learning_rate,
        warmup_steps=cfg.train.warmup_steps,
        max_steps=cfg.train.max_steps,
        evaluation_strategy=cfg.train.evaluation_strategy,
        eval_steps=cfg.train.eval_steps,
        logging_steps=cfg.train.logging_steps,
        fp16=cfg.train.fp16,
        gradient_checkpointing=cfg.train.gradient_checkpointing,
        optim=cfg.train.optim,
        remove_unused_columns=False,
        label_names=["labels"],
        predict_with_generate=True,
        generation_max_length=cfg.train.generation_max_length,
        load_best_model_at_end=True,
        metric_for_best_model="cer",
        greater_is_better=False,
        save_total_limit=cfg.train.save_total_limit,
    )

    model = prepare_model_for_kbit_training(model)
    lora_config = LoraConfig(
        r=32,
        lora_alpha=64,
        target_modules=["q_proj", "v_proj"],
        lora_dropout=0.05,
        bias="none",
    )
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

    trainer = Seq2SeqTrainer(
        args=training_args,
        model=model,
        train_dataset=dataset["train"],
        eval_dataset=dataset["test"],
        data_collator=data_collator,
        compute_metrics=compute_metrics,
        tokenizer=processor.tokenizer,
    )

    model.config.use_cache = False
    trainer.train()


def step_merge_lora(cfg: PipelineConfig) -> str:
    lora_checkpoint = cfg.merge.lora_checkpoint
    if not lora_checkpoint:
        lora_checkpoint = _find_latest_checkpoint(cfg.train.output_dir)
        if not lora_checkpoint:
            raise FileNotFoundError("No LoRA checkpoint found. Provide merge.lora_checkpoint")

    if not os.path.exists(lora_checkpoint):
        raise FileNotFoundError(f"LoRA checkpoint not found: {lora_checkpoint}")

    peft_config = PeftConfig.from_pretrained(lora_checkpoint)
    base_model = WhisperForConditionalGeneration.from_pretrained(
        peft_config.base_model_name_or_path,
        device_map={"": "cpu"},
        local_files_only=cfg.merge.local_files_only,
    )

    model = PeftModel.from_pretrained(base_model, lora_checkpoint, local_files_only=cfg.merge.local_files_only)
    feature_extractor = WhisperFeatureExtractor.from_pretrained(
        peft_config.base_model_name_or_path, local_files_only=cfg.merge.local_files_only
    )
    tokenizer = WhisperTokenizerFast.from_pretrained(
        peft_config.base_model_name_or_path, local_files_only=cfg.merge.local_files_only
    )
    processor = WhisperProcessor.from_pretrained(
        peft_config.base_model_name_or_path, local_files_only=cfg.merge.local_files_only
    )

    model = model.merge_and_unload()
    model.train(False)

    output_dir = cfg.merge.output_dir
    if not output_dir:
        output_dir = os.path.join(cfg.train.output_dir, "merged")

    os.makedirs(output_dir, exist_ok=True)

    model.save_pretrained(output_dir, max_shard_size="4GB")
    feature_extractor.save_pretrained(output_dir)
    tokenizer.save_pretrained(output_dir)
    processor.save_pretrained(output_dir)

    return output_dir


def step_convert_ct2(cfg: PipelineConfig, merged_dir: str) -> str:
    model_path = cfg.ct2.model_path or merged_dir
    output_dir = cfg.ct2.output_dir
    if not output_dir:
        output_dir = f"{model_path}-ct2"

    convert_to_ct2(model_path=model_path, output_dir=output_dir, quantization=cfg.ct2.quantization)
    return output_dir


def step_upload_hf(cfg: PipelineConfig, folder_path: str) -> None:
    if not cfg.hf.repo_id:
        raise ValueError("hf.repo_id is required for upload")
    upload_folder(cfg.hf, folder_path)


def run_pipeline(cfg: PipelineConfig, do_prepare: bool, do_train: bool, do_merge: bool, do_ct2: bool, do_upload: bool) -> None:
    merged_dir = None
    ct2_dir = None

    if do_prepare:
        step_prepare_dataset(cfg)

    if do_train:
        step_train_lora(cfg)

    if do_merge:
        merged_dir = step_merge_lora(cfg)

    if do_ct2:
        if not merged_dir:
            merged_dir = cfg.merge.output_dir or os.path.join(cfg.train.output_dir, "merged")
        ct2_dir = step_convert_ct2(cfg, merged_dir)

    if do_upload:
        upload_target = ct2_dir or merged_dir or cfg.ct2.output_dir or cfg.merge.output_dir
        if not upload_target:
            raise ValueError("No upload target found. Run merge/ct2 or set paths in config.")
        step_upload_hf(cfg, upload_target)
