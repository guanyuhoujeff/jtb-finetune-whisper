# -*- coding: utf-8 -*-
from __future__ import annotations

import os
from glob import glob
from typing import Iterable, List
import pandas as pd
from tqdm import tqdm
from handler import MinioHandler
import shutil
import random
from pathlib import Path
from tqdm import tqdm  # 進度條顯示
 
def split_dataset(source_root: str, output_root: str, train_ratio: float, seed: int = 42) -> None:
    """
    source_root: 原始資料夾路徑 (裡面應該要有 audio 和 label 兩個資料夾)
    output_root: 輸出的目標路徑 (會自動建立 train 和 test 資料夾)
    train_ratio: 訓練集比例 (預設 0.9，代表 90% train, 10% test)
    seed: 隨機種子，確保每次分割結果一致
    """
    
    # 1. 設定路徑
    src_audio_dir = os.path.join(source_root, "audio")
    src_label_dir = os.path.join(source_root, "label")
    
    if not os.path.exists(src_audio_dir) or not os.path.exists(src_label_dir):
        print(f"錯誤: 原始資料夾結構不正確。請確認 {source_root} 下有 'audio' 和 'label' 資料夾。")
        return

    # 2. 搜尋並配對檔案
    print("正在掃描並配對檔案...")
    valid_pairs = [] # 儲存 (base_filename)
    
    audio_files = [f for f in os.listdir(src_audio_dir) if f.endswith(".wav")]
    
    for audio_file in audio_files:
        base_name = os.path.splitext(audio_file)[0]
        label_file = f"{base_name}.txt"
        
        # 檢查對應的 label 是否存在
        if os.path.exists(os.path.join(src_label_dir, label_file)):
            valid_pairs.append(base_name)
        else:
            print(f"略過: 找不到對應的 label 檔案 -> {audio_file}")

    total_files = len(valid_pairs)
    print(f"共找到 {total_files} 組完整的 (wav + txt) 資料配對。")

    if total_files == 0:
        print("沒有可用的資料，程式終止。")
        return

    # 3. 隨機打亂並分割
    random.seed(seed)
    random.shuffle(valid_pairs)
    
    split_idx = int(total_files * train_ratio)
    train_set = valid_pairs[:split_idx]
    test_set = valid_pairs[split_idx:]
    
    print(f"分配結果: 訓練集 {len(train_set)} 筆, 測試集 {len(test_set)} 筆")

    # 4. 定義複製函式
    def copy_files(file_list, split_name):
        # 建立目標資料夾結構: output/train/audio, output/train/label
        target_audio_dir = os.path.join(output_root, split_name, "audio")
        target_label_dir = os.path.join(output_root, split_name, "label")
        
        os.makedirs(target_audio_dir, exist_ok=True)
        os.makedirs(target_label_dir, exist_ok=True)
        
        print(f"正在複製檔案到 {split_name} 資料夾...")
        for base_name in tqdm(file_list):
            # 來源檔案
            src_wav = os.path.join(src_audio_dir, f"{base_name}.wav")
            src_txt = os.path.join(src_label_dir, f"{base_name}.txt")
            
            # 目標檔案
            dst_wav = os.path.join(target_audio_dir, f"{base_name}.wav")
            dst_txt = os.path.join(target_label_dir, f"{base_name}.txt")
            
            # 執行複製 (copy2 保留檔案時間資訊)
            shutil.copy2(src_wav, dst_wav)
            shutil.copy2(src_txt, dst_txt)

    if os.path.isdir(output_root):
        shutil.rmtree(output_root)
    # 5. 執行複製
    copy_files(train_set, "train")
    copy_files(test_set, "test")
    
    print("\n完成！資料集已準備好。")
    print(f"新的資料集位置: {output_root}")


def build_metadata_rows(audio_dir: str, label_dir: str) -> List[dict]:
    rows: List[dict] = []
    for wav_path in tqdm(glob(os.path.join(audio_dir, "*.wav"))):
        label_path = os.path.join(label_dir, os.path.basename(wav_path).replace(".wav", ".txt"))
        if not os.path.isfile(label_path):
            continue
        with open(label_path, "r", encoding="utf-8") as reader:
            label = reader.read().strip()
        wav_name = os.path.basename(wav_path)
        rows.append({"file_name": f"audio/{wav_name}", "transcription": label})
    return rows


def upload_split_to_minio(
    minio: MinioHandler,
    local_root: str,
    split_name: str,
    cleanup_tmp: bool = True,
) -> None:
    audio_dir = os.path.join(local_root, split_name, "audio")
    label_dir = os.path.join(local_root, split_name, "label")

    rows = build_metadata_rows(audio_dir, label_dir)
    metadata_df = pd.DataFrame(rows)
    metadata_path = os.path.join(local_root, "metadata.csv")
    metadata_df.to_csv(metadata_path, index=False)

    for wav_path in tqdm(glob(os.path.join(audio_dir, "*.wav")), desc=f"upload {split_name}"):
        wav_name = os.path.basename(wav_path)
        minio.upload_file(f"{split_name}/audio/{wav_name}", wav_path)

    minio.upload_file(f"{split_name}/{split_name}_metadata.csv", metadata_path)

    if cleanup_tmp and os.path.exists(metadata_path):
        os.remove(metadata_path)
