# -*- coding: utf-8 -*-
from __future__ import annotations

import os
from huggingface_hub import HfApi, create_repo

from .config import HuggingFaceConfig


def login_if_token(cfg: HuggingFaceConfig) -> None:
    if cfg.token:
        os.environ["HF_TOKEN"] = cfg.token


def upload_folder(cfg: HuggingFaceConfig, folder_path: str, repo_type: str = "model") -> None:
    login_if_token(cfg)
    create_repo(repo_id=cfg.repo_id, repo_type=repo_type, exist_ok=True)
    api = HfApi()
    api.upload_folder(
        folder_path=folder_path,
        repo_id=cfg.repo_id,
        repo_type=repo_type,
    )
