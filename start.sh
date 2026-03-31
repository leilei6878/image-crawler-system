#!/bin/bash
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "======================================"
echo "  分布式图片采集与调度系统 - 启动中"
echo "======================================"

# Install server dependencies
echo "[1/5] 安装服务端依赖..."
cd "$ROOT/server" && npm install --silent 2>&1 | tail -3

# Install web dependencies
echo "[2/5] 安装前端依赖..."
cd "$ROOT/web" && npm install --silent 2>&1 | tail -3

# Initialize database schema
echo "[3/5] 初始化数据库..."
cd "$ROOT/server" && node -e "
const { Pool } = require('pg');
const fs = require('fs');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const schema = fs.readFileSync('../database/schema.sql', 'utf8');
pool.query(schema)
  .then(() => { console.log('[DB] Schema初始化成功'); pool.end(); })
  .catch(err => { console.log('[DB] 提示:', err.message.split('\\n')[0]); pool.end(); });
" 2>&1 || echo "[DB] 跳过"

# Start API server in background
echo "[4/5] 启动API服务器 (端口3000)..."
cd "$ROOT/server" && node src/index.js &

# Wait for server to start
sleep 2

# Start Vite frontend on port 5000
echo "[5/5] 启动前端服务 (端口5000)..."
cd "$ROOT/web" && npm run dev
