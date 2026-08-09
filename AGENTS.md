# GSM4 Agent 约束

1. 服务端需要持久化的数据统一放在 `data/`（相对 `process.cwd()`）。
2. 前端 token 存储键为 `gsm4_token`（迁移期可读 `gsm3_token` 一次并写回新键）。
3. 依赖写入对应 `package.json`（workspaces）。
4. 所有 `/api/v1` 受保护路由必须走认证中间件；external API 使用独立 key 中间件。
5. 前端 API 一律通过 `ApiClient`，禁止页面内散落 `fetch` 调业务接口。
6. 实时通道使用 Socket.IO（部署进度等走统一 `deploy:*` 事件，自 M2 起）。
7. 配置读写只通过 Config 域，禁止业务代码 ad-hoc 写 `config.json`。
8. 弹窗需要淡入淡出；交互确认使用面板弹窗，不用浏览器 `alert/confirm`。
9. 新页面不使用 Ant Design，保持面板自有视觉风格。
10. 通知使用面板消息组件。
11. 路径解析需兼容打包/`data` 与开发多候选路径。
12. 解压必须走统一安全适配层（自文件/部署域落地起）。
13. 改动后运行 `npm run typecheck`。
14. 遵循 `docs/gsm4/` 里程碑；M2 前禁止平行复制多套部署管道。
15. 不把 GSM3 `client/` `server/` 上帝文件剪贴进本树。
