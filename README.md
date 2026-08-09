# GameServerManager 4 (GSM4)

GSM4 是 GameServerManager 的下一代实现线（orphan 分支 `gsm4/main`）。

- **GSM3**：仓库历史分支 `main`（遗产维护）
- **GSM4**：本分支，按 [`docs/gsm4/`](docs/gsm4/README.md) 方案里程碑推进

## 当前里程碑：M2

在 M1 之上增加统一部署内核：

- `DeploySession`：校验 → 会话 → Executor → `deploy:*` 进度 → 实例提交/回滚
- 执行器：`steamcmd` / `minecraft` / `archive`
- Catalog：`installgame.json` 读写与远程同步
- Web：`features/deploy` 三子页（非单文件巨页）
- 验收说明：[`docs/gsm4/M2-验收说明.md`](docs/gsm4/M2-验收说明.md)

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
