1. 将服务端所有需要保存的数据统一保存在server\data 目录下
2. 前端使用的token存储键是'gsm3_token'
4. 需要安装的库直接写进package.json文件中
5. 切记所有涉及/api接口必须要加认证中间件import { authenticateToken } from '../middleware/auth.js'前端的6. 实例管理 API 调用都通过 `api.ts` 中的 ApiClient 类进行
7. 涉及实时通信相关需要使用websocket
8. 操作config.json可以使用ConfigManager
9. 改动目前已有的代码时要遵循当前设计逻辑，比如注释掉的代码非必要不要取消，部分功能没限制非必要不要限制
10. 所有涉及弹窗的需要加淡入淡出动画
11. 新增页面不要使用Ant Design 要确保于面板其它地方样式风格保持一致
12. 通知要使用面板的消息组件
13. 涉及路径需要使用多个路径尝试
```typescript
const baseDir = process.cwd()
const possiblePaths = [
    path.join(baseDir, 'data', 'games', 'installgame.json'),           // 打包后的路径
    path.join(baseDir, 'server', 'data', 'games', 'installgame.json'), // 开发环境路径
]
```
14. 涉及交互弹窗的，不要使用浏览器的对话框 使用符合面板风格的弹窗组件
15. 如果需要识别操作系统平台有专门的函数，你需要查找不需要单独写
16. 编写完毕后需要运行npx tsc --noEmit进行检测
17. 如果需要使用tar库进行解压缩操作，请务必使用 `server/src/utils/tarSecurityFilter.ts` 模块 安全拦截器，缓解路径穿越漏洞
18. 本项目编写测试代码后应当测试成功后删除
19. 升级依赖时要注意兼容问题，不要做大版本升级，尽量修复依赖漏洞。
20. 本项目没有测试代码，所以不需要运行和编写测试，直接交付即可。

## Cursor Cloud specific instructions

Full-stack app: a Node.js/TypeScript Express + Socket.IO backend (`server/`) and a React 18 + Vite frontend (`client/`). Standard commands live in the root/`server`/`client` `package.json` files; prefer those.

- Run dev (both services together): `npm run dev` from repo root — it uses `concurrently` to start the backend (`tsx watch`, port `3001`) and the Vite dev server (port `5173`). Open the app at `http://localhost:5173`; Vite proxies `/api` and `/socket.io` to the backend on `3001`, so use `5173` (not `3001`) in the browser.
- First-run account: despite the README mentioning `admin/admin123`, the backend no longer auto-creates a default admin. On a fresh `server/data` the UI shows a "创建管理员账户" (register first admin) screen. Register an admin yourself (username: alphanumeric, ≥3 chars; password ≥6 chars) via `/api/auth/register` or the UI, then log in. After any failed login attempt, subsequent logins require the on-screen CAPTCHA (`验证码`).
- Static check: this project has no automated tests (rule 20) and the root `npm run lint` script is currently broken (it runs ESLint but no ESLint config exists in `client/`). Use `npx tsc --noEmit` in both `server/` and `client/` as the type/correctness check (rule 16).
- On first backend start, the server downloads PTY / Zip-Tools / 7z binaries from GitHub into `server/data/lib/` (needs outbound network). Failures are non-fatal and only disable terminal/zip features.
- Runtime data (`server/data/*`, PTY binaries, logs) is git-ignored; deleting `server/data/users.json` resets to the first-run register screen.