export function AboutPage() {
  return (
    <div className="page-card">
      <h2 className="page-title">关于 GSM4</h2>
      <p className="page-desc">
        GameServerManager 4 重写线：统一部署内核、实例、终端与文件管理。
      </p>
      <ul className="about-list">
        <li>当前可运行能力：登录、首页监控、终端、实例启停、Steam/MC/归档部署、文件、设置</li>
        <li>数据目录：`data/`（config / users / instances / games catalog）</li>
        <li>生产启动：`npm run build && npm start`，浏览器访问服务端口</li>
        <li>方案文档：`docs/gsm4/`</li>
      </ul>
    </div>
  )
}
