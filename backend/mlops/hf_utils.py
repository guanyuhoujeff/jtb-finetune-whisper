# -*- coding: utf-8 -*-
from __future__ import annotations

import os
from huggingface_hub import HfApi, create_repo

from .config import HuggingFaceConfig


def login_if_token(cfg: HuggingFaceConfig) -> None:
    if cfg.token:
        os.environ["HF_TOKEN"] = cfg.token


def upload_folder(
    cfg: HuggingFaceConfig,
    folder_path: str,
    repo_type: str = "model",
    path_in_repo: str | None = None,
) -> None:
    """Upload a local folder to a HF repo.

    `path_in_repo`: subdirectory inside the repo (e.g. "lora", "merged", "ct2").
    Needed when pushing multiple model variants to the *same* repo so they
    don't overwrite each other's shared filenames (config.json, etc.).
    """
    login_if_token(cfg)
    create_repo(repo_id=cfg.repo_id, repo_type=repo_type, exist_ok=True)
    api = HfApi()
    kwargs = dict(folder_path=folder_path, repo_id=cfg.repo_id, repo_type=repo_type)
    if path_in_repo:
        kwargs["path_in_repo"] = path_in_repo
    api.upload_folder(**kwargs)
