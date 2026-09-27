# 团团云端存档

网页在 `pet/`，云端接口为 `/api/pet`。GitHub Pages 只托管前端，数据库不会写入 GitHub 仓库。生产云端由 ChatGPT Sites 的 Cloudflare Worker + D1 提供，`worker.mjs` 为可迁移的核心接口。

同一家庭链接的 URL fragment 中携带 192 位随机钥匙；服务端只存钥匙的 SHA-256，不提供枚举小窝的接口。钥匙通过 Authorization 请求头传输，不放进请求 URL。知道家庭链接的人可以读写这个小窝，请只发给家人。丢失链接且所有设备都清除了网站数据后，无法找回原小窝；页面提供复制链接功能。

接口使用 revision 条件更新防止两台设备互相覆盖；requestId 处理最后一笔请求的重复提交。网络错误时客户端不宣称保存成功，不静默新建小窝，不把本地快照覆盖到云端。离线会停用修改，连接恢复后重新读取。每 15 秒、切回前台和操作前的版本冲突都会同步。

迁移到自有 Cloudflare Worker：绑定 D1 为 `DB`，按 `schema.sql` 创建表，把 `state.mjs` 与 Worker 一同部署，修改 Worker 允许的来源域名及前端 `API_URL`。不需要也不应向前端填入 GitHub token、数据库密钥或 Cloudflare 管理凭据。
