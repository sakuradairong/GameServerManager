# GameServerManager 4 (GSM4)

GSM4 是 GameServerManager 的下一代实现线（orphan 分支 `gsm4/main`）。

当前版本已可作为一个**日常可用的管理面板**启动：登录、监控、终端、实例、部署、文件、设置。

## 快速启动（生产一体）

要求 Node.js ≥ 20。

```bash
npm install
npm run build
./start.sh
# 或: npm start
```

浏览器打开：`http://127.0.0.1:3001`

首次访问会要求注册管理员账号。

## 开发模式

```bash
npm install
npm run dev
```

- Web: http://localhost:5173（代理 `/api` 与 `/socket.io`）
- API: http://localhost:3001

## 已可用能力

| 模块 | 说明 |
|------|------|
| 首页 | CPU / 内存 / 磁盘 / Load 实时监控 |
| 终端 | 多会话 PTY |
| 实例 | CRUD、启停重启、操作锁 |
| 游戏部署 | DeploySession：SteamCMD / Minecraft / 归档 / 基岩版 / tModLoader（能力表驱动） |
| 文件 | 默认安装目录浏览、编辑、上传、删除 |
| 设置 | 默认安装路径、SteamCMD 一键安装/路径 |
| 关于 | 版本与启动说明 |

后续里程碑（定时任务、环境、插件等）仍为占位页。

## 数据目录

- `data/`：`config.json`、`users.json`、`instances.json`、`games/installgame.json`
- 默认游戏目录：`games/`（可在设置中修改）
- 环境变量：
  - `PORT`
  - `GSM4_DATA_DIR`
  - `GSM4_DEFAULT_INSTALL_PATH`

## Docker

```bash
docker build -t gsm4 .
docker run --rm -p 3001:3001 -v gsm4_data:/app/data -v gsm4_games:/app/games gsm4
```

## 文档

见 [docs/gsm4/README.md](docs/gsm4/README.md)。
