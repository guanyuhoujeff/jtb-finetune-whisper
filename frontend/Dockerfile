# 多階段構建
FROM node:20.12.1-alpine3.19 AS build

# 設定工作目錄
WORKDIR /app

# 複製 package 檔案
COPY package*.json ./

# 安裝依賴
RUN npm ci

# 複製源碼
COPY . .

# 構建應用
RUN npm run build

# 暴露 3000 端口
EXPOSE 3000

# 啟動 nginx
CMD ["npm", "run", "preview", "--", "--host", "--port", "3000"]