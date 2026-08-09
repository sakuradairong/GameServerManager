# GameServerManager 4 (GSM4)

GSM4 是 GameServerManager 的下一代实现线（orphan 分支 `gsm4/main`）。

- **GSM3**：仓库历史分支 `main`（遗产维护）
- **GSM4**：本分支，按 `docs/gsm4/` 方案里程碑推进

## 当前状态

M0 骨架建设中：monorepo（`apps/web`、`apps/server`、`packages/shared`）、认证与导航壳。

## 文档

见 [docs/gsm4/README.md](docs/gsm4/README.md)。

## 开发（M0 就绪后）

```bash
npm install
npm run dev
```

默认：Web `http://localhost:5173`，API `http://localhost:3001`。
