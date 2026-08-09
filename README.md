# GameServerManager 4 (GSM4)

GSM4 是 GameServerManager 的下一代实现线（orphan 分支 `gsm4/main`）。

- **GSM3**：仓库历史分支 `main`（遗产维护）
- **GSM4**：本分支，按 [`docs/gsm4/`](docs/gsm4/README.md) 方案里程碑推进

## 当前里程碑：M1

在 M0 骨架之上：

- Home：主机信息 + CPU/内存/磁盘/Load 实时统计（Socket.IO）
- 终端：多会话 PTY（`node-pty`），创建 / 输入 / resize / 关闭 / 重连
- 实例：CRUD、启停重启、操作锁，启动时创建 PTY 并注入命令
- 共享契约：`packages/shared` 中的 Instance / System / RealtimeEvents

## 开发

要求 Node.js ≥ 20。

```bash
npm install
npm run dev
```

- Web: http://localhost:5173（代理 `/api` → 3001）
- API: http://localhost:3001

其它命令：

```bash
npm run typecheck
npm run build
npm run start   # 仅启动已构建的 server
```

数据目录：`./data`（`config.json` / `users.json` / `manifest.json`）。

## Docker（草稿）

```bash
docker build -t gsm4:m0 .
docker run --rm -p 3001:3001 -v gsm4_data:/app/data gsm4:m0
```

> M0 镜像默认只起 API；完整静态资源托管将在后续里程碑完善。

## 文档

见 [docs/gsm4/README.md](docs/gsm4/README.md)。
