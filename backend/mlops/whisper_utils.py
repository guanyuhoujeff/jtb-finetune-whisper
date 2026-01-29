# -*- coding: utf-8 -*-
from __future__ import annotations

from dataclasses import dataclass
import os
from typing import Any, Dict, List, Union

import torch
from datasets import Audio, load_dataset
from datasets import IterableDatasetDict, IterableDataset
import os
from datasets import load_dataset, Features, Value, Audio


from transformers import (
    WhisperFeatureExtractor,
    WhisperTokenizer,
    WhisperProcessor,
    WhisperForConditionalGeneration,
    BitsAndBytesConfig,
)

from .config import MinioConfig
from .minio_utils import get_storage_options, set_minio_env_vars


@dataclass
class DataCollatorSpeechSeq2SeqWithPadding:
    processor: Any

    def __call__(self, features: List[Dict[str, Union[List[int], torch.Tensor]]]) -> Dict[str, torch.Tensor]:
        input_features = [{"input_features": f["input_features"]} for f in features]
        batch = self.processor.feature_extractor.pad(input_features, return_tensors="pt")

        label_features = [{"input_ids": f["labels"]} for f in features]
        labels_batch = self.processor.tokenizer.pad(label_features, return_tensors="pt")

        labels = labels_batch["input_ids"].masked_fill(labels_batch.attention_mask.ne(1), -100)
        if (labels[:, 0] == self.processor.tokenizer.bos_token_id).all().cpu().item():
            labels = labels[:, 1:]

        batch["labels"] = labels
        return batch


def build_processor(model_name: str, language: str = "chinese", task: str = "transcribe") -> WhisperProcessor:
    WhisperFeatureExtractor.from_pretrained(model_name)
    WhisperTokenizer.from_pretrained(model_name, language=language, task=task)
    return WhisperProcessor.from_pretrained(model_name, language=language, task=task)


def prepare_dataset_fn(processor: WhisperProcessor):
    def _prepare(batch: Dict[str, Any]) -> Dict[str, Any]:
        audio = batch["audio"]
        batch["input_features"] = processor.feature_extractor(
            audio["array"], sampling_rate=audio["sampling_rate"]
        ).input_features[0]
        batch["labels"] = processor.tokenizer(batch["transcription"]).input_ids
        return batch

    return _prepare


def load_streaming_dataset(
    minio_cfg: MinioConfig,
    train_csv: str,
    test_csv: str,
    sampling_rate: int = 16000,
):
    set_minio_env_vars(minio_cfg)
    
    # storage_options=get_storage_options(minio_cfg)
    # print('[storage_options] ', storage_options)
    # print('[environ]', os.environ)
    
    # dataset = load_dataset(
    #     "audiofolder",
    #     data_files={
    #         "train": train_csv,
    #         "test": test_csv,
    #     },
    #     streaming=True,
    #     storage_options=storage_options,
    # )
    # return dataset.cast_column("audio", Audio(sampling_rate=sampling_rate))

    features = Features({
        "file_name": Value("string"),
        "audio": Audio(sampling_rate=16000),
        "transcription": Value("string"),
        "tags": Value("string"),
        "description": Value("string"),
    })

    ds_train = load_dataset(
        "csv",
        data_files=f"s3://{minio_cfg.bucket_name}/train/metadata.csv",
        streaming=True,
        features=features,
    )["train"]
    ds_test = load_dataset(
        "csv",
        data_files=f"s3://{minio_cfg.bucket_name}/test/metadata.csv",
        streaming=True,
        features=features,
    )["train"]
    
    return IterableDatasetDict({"train":  ds_train, "test": ds_test})




def load_quantized_model(model_name: str) -> WhisperForConditionalGeneration:
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_use_double_quant=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.float16,
    )
    model = WhisperForConditionalGeneration.from_pretrained(
        model_name,
        quantization_config=bnb_config,
        device_map="auto",
    )
    model.generation_config.language = "chinese"
    model.generation_config.task = "transcribe"
    model.generation_config.forced_decoder_ids = None
    return model
