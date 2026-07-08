# 使用说明 / Usage Guide

WhatsApp AI 智能客服系统 —— 启动、配置、监控与人工接管操作指南。

> 本系统由 **后端服务**（Node.js + Fastify，端口 `3000`）和 **管理后台前端**（React，`web/` 目录）组成，依赖 **PostgreSQL + pgvector** 和 **Redis**。

---

## 一、快速启动

### 方式 A：Docker 一键部署（推荐用于生产 / 演示）

会同时启动后端、PostgreSQL（pgvector）、Redis，并由后端在 `3000` 端口直接托管管理后台页面。

```bash
# 1. 准备环境变量
cp .env.example .env
#    然后编辑 .env，至少填好 WhatsApp、LLM、Admin 等必填项（见第二节）

# 2. 启动全部服务
docker-compose up -d

# 3. 查看日志
docker-compose logs -f app
```

启动后：
- 管理后台：**http://<服务器地址>:3000/**（Docker 中 `NODE_ENV=production`，前端由后端托管）
- 健康检查：`GET http://<服务器地址>:3000/health` → `{"status":"ok",...}`
- WhatsApp Webhook 回调地址：`https://<你的域名>/webhook`（需通过 HTTPS 暴露给 Meta）

停止 / 重启：
```bash
docker-compose down        # 停止
docker-compose up -d --build   # 改动代码后重新构建并启动
```

### 方式 B：本地开发模式

后端（`3000`）与前端（`5173`）分开运行，前端通过 Vite 代理把 `/admin`、`/ws` 转发到后端。

```bash
# 前置：本地需有 PostgreSQL(pgvector) 与 Redis，或先 docker-compose up -d postgres redis

# 1. 后端依赖与数据库迁移
npm install
npx prisma migrate dev      # 首次需初始化数据库表结构

# 2. 启动后端（热重载）
npm run dev                 # http://localhost:3000

# 3. 另开一个终端，启动前端
cd web
npm install
npm run dev                 # http://localhost:5173  ← 开发时访问这个地址
```

开发模式下访问管理后台请用 **http://localhost:5173**（而非 3000）。

### 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 后端开发模式（热重载） |
| `npm run build` / `npm start` | 后端编译 / 生产运行 |
| `npm test` | 后端测试（42 个） |
| `npx prisma migrate dev` | 创建/应用数据库迁移 |
| `cd web && npm run dev` | 前端开发服务器 |
| `cd web && npm run build` | 前端生产构建（产物在 `web/dist`） |
| `cd web && npm test` | 前端测试（13 个） |

---

## 二、配置说明（`.env`）

复制 `.env.example` 为 `.env` 并填写。关键项如下：

### WhatsApp Cloud API（必填）
```
WHATSAPP_API_TOKEN=          # Meta 应用的永久访问令牌
WHATSAPP_PHONE_NUMBER_ID=    # WhatsApp 商业号的 Phone Number ID
WHATSAPP_VERIFY_TOKEN=       # 自定义字符串，配置 Webhook 时在 Meta 后台填同一个值
WHATSAPP_APP_SECRET=         # 应用密钥，用于校验 Webhook 签名（HMAC）
```
> 在 Meta 开发者后台把 Webhook 回调 URL 设为 `https://<你的域名>/webhook`，Verify Token 填 `WHATSAPP_VERIFY_TOKEN` 的值，订阅 `messages` 事件。

### LLM 大模型（必填其一）
```
LLM_PROVIDER=openai          # 可选 claude | openai | deepseek，切换大模型只改这一行
CLAUDE_API_KEY=
OPENAI_API_KEY=
DEEPSEEK_API_KEY=
```
> 只需填写所选 `LLM_PROVIDER` 对应的那个 Key。

### 向量检索 / Embedding（知识库 RAG 必填）
```
EMBEDDING_API_KEY=
EMBEDDING_MODEL=text-embedding-3-small
```

### WooCommerce 商品同步（可选）
```
WOOCOMMERCE_URL=
WOOCOMMERCE_CONSUMER_KEY=
WOOCOMMERCE_CONSUMER_SECRET=
WOOCOMMERCE_SYNC_INTERVAL_HOURS=6   # 自动同步间隔（小时），默认 6
```

### 数据库与缓存
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/whatsapp_service
REDIS_URL=redis://localhost:6379
```

### 管理后台账号（必改）
```
ADMIN_JWT_SECRET=change_me_in_production   # 生产环境务必改成强随机串
ADMIN_DEFAULT_EMAIL=admin@example.com      # 首次启动自动创建的管理员账号
ADMIN_DEFAULT_PASSWORD=admin123            # 首次启动后请尽快修改/重置
PORT=3000
NODE_ENV=development                        # 生产部署设为 production
```
> **首次启动**会自动创建 `ADMIN_DEFAULT_EMAIL` / `ADMIN_DEFAULT_PASSWORD` 这个管理员账号，用它登录管理后台。

---

## 三、登录与界面总览

1. 打开管理后台（生产 `:3000`，开发 `:5173`）。
2. 用 `.env` 里配置的管理员邮箱 / 密码登录。
3. 左侧导航有三个模块：**Dashboard（仪表盘）**、**Conversations（会话）**、**Knowledge Base（知识库）**。

---

## 四、监控 AI 聊天情况

### 1. 仪表盘（Dashboard）
进入后即看到当日核心指标卡片：

| 指标 | 含义 |
|------|------|
| Today's Conversations | 今日新增会话数 |
| AI Resolution Rate | AI 解决率（未转人工的会话占比） |
| **Pending Handoffs** | **待人工接管数量（重点关注）** |
| Today's Messages | 今日消息总量 |
| Active AI / Active Human | 当前由 AI / 人工处理中的会话数 |
| Total Conversations | 累计会话总数 |

### 2. 会话列表（Conversations）
- 表格展示所有会话：客户名、电话、状态、负责坐席、最近更新时间。
- 顶部可按状态筛选：**All / AI / Human / Closed**。
- 状态徽章含义：
  - `ai`（蓝色）：AI 正在自动应答。
  - `human`（橙色）：已转人工，等待或正在由坐席处理。
  - `closed`（灰色）：会话已关闭。
- **实时刷新**：当某会话触发转人工时，前端通过 WebSocket 收到 `handoff` 事件，列表与仪表盘会自动刷新——无需手动刷新页面即可发现新的待接管会话。
- 点击任意一行进入该会话的「坐席工作台」查看完整对话。

### 3. 服务健康
- `GET /health` 返回服务存活状态。
- Docker 部署可用 `docker-compose logs -f app` 实时查看后端日志（消息处理、LLM 调用、错误等）。

---

## 五、人工接管（Agent Workspace）

### 转人工是如何触发的
系统默认全程由 AI 自动回复（`status = ai`）。出现以下任一情况会**自动**转人工（`status → human`）：

1. **AI 主动请求**：当 AI 判断无法处理（如投诉、退款、技术问题）时，会在回复中输出 `[HANDOFF]` 标记（由系统提示词约束）。
2. **客户主动要求人工**：客户消息命中以下意图（不区分大小写）会触发，例如：
   - "talk to a person / human / agent / representative"
   - "speak to someone / a human / an agent"
   - "connect me to a human / agent"
   - "transfer to agent / human / support"
   - "real person"、"human agent"
3. **LLM 调用失败兜底**：当大模型调用异常时，系统发送兜底话术并自动转人工。

转人工后：
- 该会话状态变为 `human`，`Pending Handoffs` 计数 +1，会话列表实时高亮。
- 系统已自动给客户发送一句过渡话术（"I'm connecting you with a team member…"）。

### 坐席接管并回复
1. 在 **Conversations** 中筛选 `Human`（或在 Dashboard 看到 Pending Handoffs 数量后进入），点击目标会话。
2. 进入 **坐席工作台**，可看到：
   - 完整对话气泡（`user` 客户 / `bot` AI / `agent` 人工 三种角色用颜色区分）。
   - 客户实时新消息会通过 WebSocket（`new_message` 事件）**自动追加**，无需刷新。
3. 在底部输入框输入回复，点击 **Send**：
   - 消息会通过 WhatsApp 发送给客户，并记录为 `agent` 角色。
   - **首次回复会自动把该会话指派给当前登录坐席**（之后 "负责坐席" 列显示你的名字）。
4. 处理完毕后点击 **Close** 关闭会话（状态变为 `closed`）。
   - 关闭后客户若再次发来消息，系统会新建一个会话并重新由 AI 接待。

### 重要提示：回复输入框的启用条件
- 回复输入框**仅在会话状态为 `human` 时可用**；当会话仍由 AI 处理（`ai`）或已关闭（`closed`）时，输入框为禁用状态。这是后端的强约束（非 human 状态调用回复接口会被拒绝），用于防止坐席与 AI 同时抢答。

### 当前限制（待后续迭代）
- **暂无「手动接管」按钮**：目前坐席无法主动把一个仍由 AI 处理的会话强制转为人工——只能等上述自动触发条件命中。若需要"坐席随时介入任意会话"的能力，需要新增一个后端接口（将状态置为 `human` 并指派坐席）。这是已记录的后续改进项。
- **WebSocket 未鉴权**：实时通道目前对任意连接开放，`new_message` 会广播客户消息内容。正式上线前建议为 WebSocket 增加 JWT 握手校验。

---

## 六、知识库管理（Knowledge Base）

AI 的回答基于知识库做 RAG 检索，维护好知识库直接决定 AI 回答质量。

- **查看 / 筛选**：按分类 All / Product / Faq / Policy 浏览文档，可看到来源（`woocommerce` 自动同步 / `manual` 手动录入）。
- **新增 / 编辑 / 删除**：点击 "Add Document" 录入标题、分类、内容；手动文档来源标记为 `manual`。
- **WooCommerce 同步**：点击 "Sync WooCommerce" 立即拉取商品数据并向量化入库（也会按 `WOOCOMMERCE_SYNC_INTERVAL_HOURS` 定时自动同步）。同步完成会以 Toast 提示数量。

---

## 七、会话上下文与自动关闭

- 系统在 Redis 中缓存每个会话最近 **20** 条消息用于多轮对话；更早的消息按需从 PostgreSQL 读取。
- 会话在长时间无活动后会按配置自动关闭（默认 24 小时）。

---

## 八、常见问题排查

| 现象 | 排查方向 |
|------|----------|
| 收不到客户消息 | 检查 Meta Webhook 是否指向 `https://域名/webhook`、Verify Token 是否一致、`WHATSAPP_APP_SECRET` 是否正确（签名校验失败会返回 401） |
| AI 不回复 | 检查 `LLM_PROVIDER` 与对应 API Key；查看 `docker-compose logs -f app` 中 LLM 调用错误 |
| AI 答非所问 | 完善知识库内容并触发同步；确认 Embedding Key 可用 |
| 登录失败 | 确认 `ADMIN_DEFAULT_EMAIL/PASSWORD`；首次启动后才会创建默认管理员 |
| 管理后台打不开 | 生产看 `:3000`（需 `NODE_ENV=production` 且已构建 `web/dist`）；开发看 `:5173` |
| 待接管会话不刷新 | 确认 WebSocket（`/ws`）连通；开发模式确认 Vite 代理生效 |
```
