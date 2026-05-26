# agentic·PM

> **Experimental Preview · 2026-05**  
> Code: <https://github.com/LiuShiyuMath/agenticPM> · Feedback: <https://github.com/LiuShiyuMath/agenticPM/issues>

> 给中国产品经理用的本地工作台。Claude Agent SDK + 官方 `product-management` 插件，跑在 `localhost:4123`。

十二个 PM 工作流，分两层视图（任务 / 项目），一个页面一个工作流。

它解决两件事：**追踪每个项目的状态**，以及**盘点整个组织里的人**（团队 / RACI / Owner / 资源）。
两件事都落在「项目级 · Project Views」里——不做围绕 PM 个人的自我追踪。

### 任务级 · Task Views（一次一个具体动作）

| 路由                       | 工作流              | 用途                                             |
| -------------------------- | ------------------- | ------------------------------------------------ |
| `/write-spec`              | 写需求文档          | 把一个想法落成可评审、可拆解的中文 PRD           |
| `/roadmap-update`          | 路线图规划          | 把杂乱需求池排成有优先级的季度路线图             |
| `/stakeholder-update`      | 利益相关者更新      | 分受众生成 CEO / 销售 / 客服都看得懂的状态周报   |
| `/synthesize-research`     | 用户研究综合        | 从访谈 / 问卷里抽洞察、量化频次、给出决定        |
| `/competitive-brief`       | 竞品分析简报        | 只写 diff + gap + 动作建议，禁完整 SWOT          |
| `/metrics-review`          | 指标复盘            | 把数字翻译成原因、假设、可立刻执行的实验         |
| `/product-brainstorming`   | 产品头脑风暴        | 先发散 10 个想法、再 ICE 聚焦 3 个 MVP           |
| `/sprint-planning`         | 冲刺规划            | 2 周 sprint backlog + 验收标准 + 风险依赖        |

### 项目级 · Project Views（把每个项目当整体追踪 + 盘点组织里的人）

把一个项目当整体来追踪状态，同时盘点组织里的人——团队、RACI、Owner、资源都在这一层。

| 路由                 | 工作流          | 用途                                               |
| -------------------- | --------------- | -------------------------------------------------- |
| `/project-charter`   | 项目立项书      | 一页纸：目标、范围、成功指标、里程碑、团队 RACI     |
| `/project-health`    | 项目健康看板    | 红黄绿健康卡：进度 / 范围 / 风险 / 资源 / 信心      |
| `/project-raid`      | 风险依赖台账    | Risks / Assumptions / Issues / Dependencies 四张表 |
| `/project-retro`     | 项目复盘        | 目标 vs 实际 + 继续/停止/开始 + 5 Why + action     |

## 跑起来

```bash
# 1. 安装依赖（已自动跑过，可跳过）
bun install

# 2. 准备 auth（三选一，详见 .env.example）
cp .env.example .env
#   A. 官方 Anthropic API：填 ANTHROPIC_API_KEY=sk-ant-...
#   B. MiniMax / 第三方兼容 endpoint：填 ANTHROPIC_API_KEY + ANTHROPIC_BASE_URL + ANTHROPIC_MODEL
#   C. 本地 claude.ai 订阅：先 `claude /login` 一次，.env 可为空

# 3. 启动开发服务器（带 HMR）
bun run dev

# 浏览器打开
open http://localhost:4123
```

### 走 MiniMax 走得通吗？

走通了。endpoint `https://api.minimaxi.com/anthropic`、model `MiniMax-M2.7-highspeed`，SDK 把请求按 Anthropic 协议转发过去，
plugin 的 47+ tool + 24 个 MCP 都正常注入。冷启 + 一个 `1+1=?` 请求实测 3.8s 完成。
启动日志会打出当前 endpoint / model / auth 状态，方便核对。

## 它怎么工作

```
你的浏览器
   │  POST /api/agent  { skill, prompt, threadId }
   ▼
Bun.serve  ──►  Hono /api/agent  ──►  query() (Agent SDK)
                                          │
                                          ├── plugins: [local path → product-management]
                                          ├── 自动加载 product-management 的 SKILL.md
                                          └── SSE 流回 text / tool_use / result
   ▲
   │  EventSource 风格 SSE 解析 → marked.js 渲染 → 边出字边显示
```

- **插件路径**：`~/.claude/plugins/marketplaces/knowledge-work-plugins/product-management`
  （来自之前 `/plugin` 加的 marketplace 缓存，零额外下载。）
- **会话续接**：服务器内存 `Map<threadId, sessionId>`，同一页连续对话自动 resume。
- **权限模式**：`bypassPermissions` 因为这是本地单用户工作台；生产环境请改成 `default` + canUseTool 回调。

## 文件结构

```
agenticPM/
├── server.ts              ← Bun.serve + Hono SSE
├── app/
│   ├── skills.ts          ← 12 个 skill 元数据 + LEVELS 两层定义 + 系统提示词
│   ├── main.ts            ← 客户端：路由感知 + 按层分组首页 + SSE 解析 + markdown
│   ├── styles.css         ← Editorial 风格设计系统
│   ├── index.html         ← 首页（按 任务/项目 分组的 grid）
│   └── <skill>.html × 12  ← 每个工作流一个页面（8 任务 + 4 项目）
├── tests/app.spec.ts      ← Playwright e2e
├── .claude/settings.json  ← 启用 product-management 插件
└── package.json
```

## 命令

| 命令                | 用途                                          |
| ------------------- | --------------------------------------------- |
| `bun run dev`       | 启动本地开发服务器，HMR + console 转发        |
| `bun run start`     | 生产模式启动                                  |
| `bun run typecheck` | `tsc --noEmit` 类型校验                       |
| `bun run test`      | 跑 Playwright e2e                             |
| `bun run test:install` | 安装 Playwright Chromium（首次跑测试前）    |

## 设计取向

- 字体：标题用 Noto Serif SC，正文 PingFang SC / 系统中文。
- 颜色：纸色背景 + 墨色文字 + 一抹暖橙（`#d24a18`）做唯一 accent。
- 形态：发丝级 hairline rules + 充裕留白 + 零阴影，editorial 报纸感。
- 中文版式：`line-height: 1.75-1.85`，标点 kerning，列表与表格紧凑但不挤。

## 下一步

- [ ] 接 MCP（plugin 自带 `.mcp.json` 还未启用，可挂 Linear / Notion / GitHub）
- [ ] 持久化会话（目前内存 map，重启就丢）
- [ ] 多用户隔离（目前单 process 单 key，本地用足够）
- [ ] 上线时把 `bypassPermissions` 改回 `default`

## 参考

- [Claude Agent SDK overview](https://docs.claude.com/en/agent-sdk/overview)
- [TypeScript SDK reference](https://docs.claude.com/en/agent-sdk/typescript)
- [knowledge-work-plugins / product-management](https://github.com/anthropics/knowledge-work-plugins/tree/main/product-management)
- [Bun.serve docs](https://bun.com/docs/api/http)
