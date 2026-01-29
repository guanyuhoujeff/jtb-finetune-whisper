# -*- coding: utf-8 -*-
from __future__ import annotations

import os
import shutil
from typing import Optional, Tuple

from huggingface_hub import snapshot_download

def load_or_download_model(repo_id: str, model_path: str) -> Tuple[Optional[AutoModelForSpeechSeq2Seq], Optional[AutoProcessor]]:
    current_dir = os.path.abspath(os.getcwd())
    local_model_dir = os.path.join(current_dir, model_path)
    config_path = os.path.join(local_model_dir, "config.json")

    if not os.path.exists(config_path):
        snapshot_download(
            repo_id=repo_id,
            local_dir=local_model_dir,
            local_dir_use_symlinks=False,
            resume_download=True,
        )

    processor = AutoProcessor.from_pretrained(local_model_dir)
    model = AutoModelForSpeechSeq2Seq.from_pretrained(local_model_dir)
    return model, processor


