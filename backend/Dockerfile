ARG CUDA_VER=12.8
ARG CUDNN_VER=9
FROM pytorch/pytorch:2.9.0-cuda${CUDA_VER}-cudnn${CUDNN_VER}-devel

# 設置工作目錄
WORKDIR /workspace
# COPY ./docker-activate-bin.sh ./
# COPY ./python-server/fei-requirements.txt ./
ENV DEBIAN_FRONTEND=noninteractive PYTHONUNBUFFERED=1
ENV PYTHONPATH=/workspace

# 固定 UID/GID，與你主機上的帳號相同（常見為 1000）
ARG USER=developer
ARG UID=1000
ARG GID=1000

# 建群組/使用者
RUN groupadd -g ${GID} ${USER} \
 && useradd -m -u ${UID} -g ${GID} -s /bin/bash ${USER}

# 必要系統工具 + FFmpeg runtime（讓 torchcodec 能連到 libav*）
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg git curl build-essential \
 && rm -rf /var/lib/apt/lists/*

RUN apt-get update -y && apt-get install -y python3 python3-pip libcudnn8 libcudnn8-dev

ENV HOME=/home/${USER} \
    XDG_CACHE_HOME=/home/${USER}/.cache \
    MODELSCOPE_CACHE=/home/${USER}/.cache/modelscope \
    HF_HOME=/home/${USER}/.cache/huggingface \
    TRANSFORMERS_CACHE=/home/${USER}/.cache/huggingface \
    TORCH_HOME=/home/${USER}/.cache/torch

RUN mkdir -p \
      ${MODELSCOPE_CACHE} \
      ${HF_HOME} \
      ${TORCH_HOME} \
      /workspace \
 && chown -R ${UID}:${GID} ${HOME} /workspace

USER ${USER}

# 複製 requirements 並先升級 pip
COPY ./requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -U pip setuptools wheel

RUN pip install --no-cache-dir "torchcodec[ffmpeg]"

# 你的其餘套件
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir zhpr noisereduce huggingface_hub torchcodec==0.9.* pytorch-lightning
RUN pip install -U --no-cache-dir pandas 
RUN pip install "numpy<2.4"

# 非 root 用戶（可留可不留；要用就確保 /workspace 權限）
# RUN useradd -m -s /bin/bash developer && chown -R developer:developer /workspace
USER developer

EXPOSE 8888 52045 8000

# 默認命令
CMD ["bash"]