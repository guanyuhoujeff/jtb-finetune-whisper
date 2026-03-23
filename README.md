# 🎙️ JTB Finetune Whisper

一套完整的 OpenAI Whisper 語音辨識模型微調平台，提供 Web UI 進行資料集管理、模型訓練、評估與推理。

[![Python 3.10+](https://img.shields.io/badge/Python-3.10+-blue.svg)](https://www.python.org/)
[![CUDA 12.x](https://img.shields.io/badge/CUDA-12.x-green.svg)](https://developer.nvidia.com/cuda-toolkit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## ✨ 功能特色

- 📦 **資料集管理** - 透過 MinIO 儲存與管理音訊資料集，支援分頁、搜尋、標籤管理
- 🎯 **LoRA 微調** - 使用 PEFT (Parameter-Efficient Fine-Tuning) 進行高效模型訓練
- 📊 **訓練監控** - 即時查看訓練進度、Loss 曲線、GPU 使用率
- 🔄 **模型轉換** - 支援 Merged Model、CTranslate2 (CT2) 格式轉換
- 🎤 **模型評估** - 選擇不同模型進行推理比較，支援音檔上傳、麥克風錄音、Bucket 選取
- 🖥️ **GPU 管理** - 即時監控 GPU 記憶體使用，一鍵釋放快取模型

---

## 📁 專案結構

```
jtb-finetune-whisper/
├── backend/                    # FastAPI 後端服務
│   ├── main.py                 # API 入口
│   ├── services/               # 核心服務模組
│   │   ├── dataset_manager.py  # 資料集管理
│   │   ├── training_manager.py # 訓練管理
│   │   ├── evaluate_manager.py # 模型評估
│   │   └── minio_client.py     # MinIO 客戶端
│   ├── scripts/                # 訓練腳本
│   │   ├── train_whisper_lora.py
│   │   └── convert_*.py
│   └── Dockerfile              # 後端 Docker 映像
├── frontend/                   # React + Vite 前端
│   ├── src/
│   │   ├── components/         # UI 組件
│   │   └── App.jsx             # 主應用程式
│   └── Dockerfile              # 前端 Docker 映像
├── model_output/               # 訓練輸出模型
├── configs/                    # 設定檔
└── requirements.txt            # Python 依賴
```

---

## 🔧 系統需求

| 項目 | 最低需求 |
|------|----------|
| **GPU** | NVIDIA GPU (建議 VRAM ≥ 8GB) |
| **CUDA** | 12.x (需配合驅動版本) |
| **Docker** | 20.10+ |
| **Node.js** | 18+ (前端開發) |

---

## 🚀 快速開始

### 使用 Docker Compose (推薦)

**一鍵啟動所有服務：**

```bash
# 1. 複製環境設定檔
cp .env.example .env

# 2. 建置並啟動服務 (MinIO + Backend + Frontend)
docker compose up -d --build

# 3. 查看服務狀態
docker compose ps
```

**服務連結：**
| 服務 | URL | 說明 |
|------|-----|------|
| **Web UI** | http://localhost:42040 | 主要操作介面 |
| **API Docs** | http://localhost:42045/docs | 後端 API 文件 |
| **MinIO Console** | http://localhost:9001 | 資料儲存管理 |

**啟動可選服務：**
```bash
# 啟動 TensorBoard (訓練監控)
docker compose --profile monitoring up -d tensorboard

# 啟動 JupyterLab (互動式開發)
docker compose --profile dev up -d jupyter
```

**停止服務：**
```bash
docker compose down
```

---

### 手動啟動 (進階)

如需個別控制各服務，請參考以下指令：

<details>
<summary>展開手動啟動指令</summary>

#### 1️⃣ 建置 Docker 映像

```bash
docker run -d \
  -p 9000:9000 -p 9001:9001 \
  --name minio-server \
  -v ./minio-data:/data \
  -e "MINIO_ROOT_USER=admin" \
  -e "MINIO_ROOT_PASSWORD=password123" \
  minio/minio server /data --console-address ":9001"


**後端映像** (含 CUDA 環境)：
```bash
cd backend
docker build -f Dockerfile -t jtb-cuda-env \
  --build-arg CUDA_VER=12.8 \
```

#### 3️⃣ 啟動後端 API

docker rm -f jtb-finetune-backend jtb-finetune-frontend
```bash
cd <專案根目錄>
docker run -d \
  --name jtb-finetune-backend \
  --restart=always \
  --gpus all --network host \
  -e BACKEND_CORS_ORIGINS="*" \
  -e MINIO_ENDPOINT="localhost:9000" \
  -e MINIO_EXTERNAL_ENDPOINT="192.168.1.37:9000" \
  -v $(pwd):/workspace \
  jtb-cuda-env \
  python -m uvicorn backend.main:app --host 0.0.0.0 --port 42045  
```

#### 4️⃣ 啟動前端

```bash
cd frontend


docker rm -f jtb-finetune-frontend
docker build -f Dockerfile -t jtb-frontend-env .
docker run -d \
  --name jtb-finetune-frontend \
  --restart=always \
  -p 42040:3000 \
  jtb-frontend-env
```

</details>

---

## 📊 資料格式

### 輸入資料結構
```
source_root/
├── audio/          # .wav 音訊檔案
│   ├── sample_001.wav
│   ├── sample_002.wav
│   └── ...
└── label/          # 對應的 .txt 轉錄文字
    ├── sample_001.txt
    ├── sample_002.txt
    └── ...
```

### 處理後結構 (上傳至 MinIO)
```
bucket_name/
├── train/
│   └── metadata.csv      # 訓練集資訊
└── test/
    └── metadata.csv      # 測試集資訊
```

**metadata.csv 欄位**：
| 欄位 | 說明 |
|------|------|
| `audio` | S3 URI (s3://bucket/train/file.wav) |
| `transcription` | 轉錄文字 |
| `tags` | 標籤 (逗號分隔) |
| `description` | 描述 |

---

## 🎓 訓練流程

1. **準備資料** - 在 Web UI 的 Dataset 頁面選擇 Bucket
2. **設定訓練** - 在 Training 頁面選擇基底模型、設定參數
3. **開始訓練** - 點擊 Start Training，監控即時進度
4. **模型轉換** - 訓練完成後可轉換為 Merged 或 CT2 格式
5. **評估模型** - 在 Evaluate 頁面選擇模型進行推理測試

---

## 🛠️ 進階使用

### 啟動 JupyterLab (互動式開發)

**Linux / macOS**：
```bash
docker run --name finetune-whisper -d \
  --gpus all \
  -v $(pwd):/workspace \
  -p 28888:8888 \
  jtb-cuda-env \
  python -m jupyterlab --ip='0.0.0.0' --NotebookApp.token='' \
  --NotebookApp.password='' --allow-root --no-browser --port 8888
```

**Windows PowerShell**：
```powershell
docker run --name finetune-whisper -d `
  --gpus all `
  -v ${PWD}:/workspace `
  -p 28888:8888 `
  jtb-cuda-env `
  python -m jupyterlab --ip='0.0.0.0' --NotebookApp.token='' `
  --NotebookApp.password='' --allow-root --no-browser --port 8888
```

### 啟動 TensorBoard

```bash
docker run --rm \
  -v $(pwd):/workspace \
  -p 6006:6006 \
  jtb-cuda-env \
  python -m tensorboard.main --logdir="./model_output" --host "0.0.0.0" --port 6006
```

### 查看容器日誌

```bash
docker logs -f jtb-finetune-backend
```

---

## 🔌 API 端點

| 方法 | 端點 | 說明 |
|------|------|------|
| GET | `/api/buckets` | 取得所有 Bucket |
| GET | `/api/dataset/{bucket}/{split}` | 取得資料集 |
| POST | `/api/train/start` | 開始訓練 |
| GET | `/api/train/status` | 取得訓練狀態 |
| GET | `/api/evaluate/models` | 取得可用模型 |
| POST | `/api/evaluate/infer` | 執行推理 |
| GET | `/api/system/gpu-status` | GPU 狀態 |
| POST | `/api/system/release-gpu` | 釋放 GPU 記憶體 |

完整 API 文件請參考：http://localhost:42045/docs

---

## 📝 注意事項

- ⚠️ CUDA 版本需與 NVIDIA Driver 相容
- ⚠️ 訓練大型模型 (large-v2/v3) 建議 VRAM ≥ 16GB
- ⚠️ 使用 `--network host` 時部分 Port 參數會被忽略

---

## 👤 作者

**侯冠宇 (Guan Yu Hou)**

[![GitHub](https://img.shields.io/badge/GitHub-guanyuhoujeff-181717?style=flat&logo=github)](https://github.com/guanyuhoujeff)
[![GitLab](https://img.shields.io/badge/GitLab-jeff7522553-FC6D26?style=flat&logo=gitlab)](https://gitlab.com/jeff7522553)

---

## 📄 授權

MIT License

---

## 🙏 致謝

- [OpenAI Whisper](https://github.com/openai/whisper)
- [Hugging Face Transformers](https://github.com/huggingface/transformers)
- [PEFT](https://github.com/huggingface/peft)
- [CTranslate2 / faster-whisper](https://github.com/SYSTRAN/faster-whisper)