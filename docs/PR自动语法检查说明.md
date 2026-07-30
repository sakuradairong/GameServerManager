# PR 自动检查说明

## 工作流

`.github/workflows/ci.yml` 使用只读权限，在以下场景运行：

- Pull Request 创建、更新或重新打开
- 提交推送到 `main`

工作流不会评论、修改或自动合并 Pull Request，也不会执行来自仓库密钥的写操作。

## 检查范围

1. 使用 Node.js 22.17.0。
2. 根据根目录、`server` 和 `client` 的 lockfile 分别执行 `npm ci`。
3. 通过各子项目本地 TypeScript 版本执行 `npm run typecheck`。
4. 执行 `npm run build` 验证服务端与前端构建。

本项目当前不把测试作为通用 PR 门禁。涉及已有测试覆盖的模块时，贡献者应在 PR 中说明额外验证结果。

## 分支保护建议

上游维护者应将 CI 设为 `main` 的 required check，并启用审查批准、解决对话和禁止强推。自动合并或发布流程应保持为独立工作流。
