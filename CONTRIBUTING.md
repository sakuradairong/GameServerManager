# 贡献指南

感谢你为 GameServerManager 提交改进。为了让变更便于复现、审查和维护，请遵循本指南。

## 开始之前

- 搜索现有 Issue 和 Pull Request，避免重复工作。
- 大型功能、数据格式变更或破坏性改动应先创建 Issue 讨论方案。
- 安全漏洞不要提交公开 Issue，请按照 [SECURITY.md](SECURITY.md) 私下报告。

## 开发环境

- Node.js `>=20.19.0`，推荐使用 `.nvmrc` 中的 `22.17.0`。
- npm `>=10.0.0`。
- Windows 或 Linux；平台相关改动需要在目标平台验证。

安装依赖：

```bash
npm ci
npm ci --prefix server
npm ci --prefix client
```

启动开发环境：

```bash
npm run dev
```

服务端运行数据统一写入 `server/data`。本地 `.env`、日志、用户配置和运行时数据不得提交；请从 `.env.example` 创建本地配置。

## 代码约定

- 遵循现有 TypeScript、React、Express 和目录结构，不做无关重构。
- 所有新增 `/api` 接口必须使用认证中间件。
- 前端实例管理 API 通过 `client/src/utils/api.ts` 中的 `ApiClient` 调用。
- 实时状态和长任务进度使用 WebSocket。
- 涉及路径时兼顾源码运行与打包后的多个候选路径。
- 不提交 Token、密码、私钥、真实公网地址、日志或用户数据。
- 提交信息使用 [Conventional Commits](https://www.conventionalcommits.org/) 格式。

## 提交前检查

```bash
npm run typecheck
npm run build
git diff --check
```

本仓库当前不把测试作为通用提交门禁。若改动已有测试覆盖的模块，请在 Pull Request 中说明执行结果，不要提交临时测试或调试文件。

## Pull Request

- 一个 Pull Request 只处理一个清晰主题。
- 说明问题、实现方式、兼容性风险和验证结果。
- UI 变更附截图；日志必须先脱敏。
- 依赖升级避免不必要的大版本变更，并说明兼容性和安全原因。
- 保持分支基于最新 `main`，解决所有审查对话后再合并。

提交即表示你有权贡献相关内容，并同意按项目的 [GPL-3.0-only](LICENSE) 许可证发布。
