export type SkillId =
  // 任务级 / task
  | "write-spec"
  | "roadmap-update"
  | "stakeholder-update"
  | "synthesize-research"
  | "competitive-brief"
  | "metrics-review"
  | "product-brainstorming"
  | "sprint-planning"
  // 项目级 / project
  | "project-charter"
  | "project-health"
  | "project-raid"
  | "project-retro";

export type SkillLevel = "task" | "project";

export interface LevelMeta {
  id: SkillLevel;
  /** 中文层级名，做分组标题 */
  label: string;
  /** mono 小标，对齐 editorial 视觉 */
  sub: string;
  /** 一句话说明这一层在解决 PM 的什么问题 */
  blurb: string;
}

export interface SkillMeta {
  id: SkillId;
  /** 这个视图属于哪一层：单个任务 / 整个项目 / PM 个人 */
  level: SkillLevel;
  title: string;
  subtitle: string;
  blurb: string;
  inputLabel: string;
  inputPlaceholder: string;
  systemPrompt: string;
  examples: string[];
  glyph: string;
}

/** 两层视图，渲染顺序即数组顺序：任务 → 项目 */
export const LEVELS: LevelMeta[] = [
  {
    id: "task",
    label: "任务级",
    sub: "Task Views",
    blurb: "一次一个具体动作：写一份文档、排一次优先级、复一次盘。",
  },
  {
    id: "project",
    label: "项目级",
    sub: "Project Views",
    blurb:
      "把每个项目当整体来追踪，并盘点组织里的人：立项与团队 RACI、健康度与资源、风险依赖 Owner、收尾复盘。",
  },
];

export const SKILLS: SkillMeta[] = [
  // ── 任务级 / Task ─────────────────────────────────────────────────────────
  {
    id: "write-spec",
    level: "task",
    title: "写需求文档",
    subtitle: "Write Spec",
    blurb: "把一个想法落成可评审、可拆解、可交付的产品需求文档。",
    inputLabel: "你要写的功能 / 想法",
    inputPlaceholder: "例如：为 B 端后台增加批量导出 Excel 功能，覆盖 5 张核心列表。",
    systemPrompt:
      "你是一位资深中文产品经理。使用 product-management 插件中的 write-spec 技能，撰写一份结构完整、面向中文读者的 PRD。包含：背景、目标、用户场景、功能详述、非功能需求、依赖与风险、验收标准、Open Questions。先用要点列纲要，再展开细节。",
    examples: [
      "为 To-C 应用增加深色模式偏好同步",
      "为内部 BI 平台增加权限分级",
      "新增 Webhook 通知能力",
    ],
    glyph: "PRD",
  },
  {
    id: "roadmap-update",
    level: "task",
    title: "路线图规划",
    subtitle: "Roadmap Update",
    blurb: "把杂乱的需求池排成优先级清晰、可对外沟通的季度路线图。",
    inputLabel: "当前的产品 / 需求池现状",
    inputPlaceholder: "例如：手上 17 个需求，下季度只能做 6 个。资源 3 个工程师 + 1 个设计。",
    systemPrompt:
      "你是一位资深中文产品经理。使用 product-management 插件中的 roadmap-update 技能，输出一份分主题、按优先级排序的季度路线图，附排序理由（用 RICE 或 Impact/Effort 简表）与不做的事的说明。",
    examples: [
      "下季度增长团队需要梳理 OKR",
      "用户反馈池有 40 条，需要排优先级",
      "需要做季度对外公告路线图",
    ],
    glyph: "MAP",
  },
  {
    id: "stakeholder-update",
    level: "task",
    title: "利益相关者更新",
    subtitle: "Stakeholder Update",
    blurb: "把研发进度翻译成 CEO / 销售 / 客服都能看懂的状态周报。",
    inputLabel: "本期进展 / 风险 / 数据",
    inputPlaceholder: "例如：本周完成支付重构 80%；客诉率下降 12%；预计周五上线，但有 2 个 P1 待修。",
    systemPrompt:
      "你是一位资深中文产品经理。使用 product-management 插件中的 stakeholder-update 技能，输出一份分受众（高管/销售/客服/工程）的状态更新。每个受众段不超过 6 行，先说决策点，再说事实，最后是接下来一周的承诺。",
    examples: [
      "向高管同步 Q3 进度",
      "给销售团队解释为什么延期",
      "给客服培训新功能要点",
    ],
    glyph: "MEM",
  },
  {
    id: "synthesize-research",
    level: "task",
    title: "用户研究综合",
    subtitle: "Synthesize Research",
    blurb: "把分散的访谈、问卷、日志归纳成可下决定的洞察。",
    inputLabel: "粘贴你的访谈摘要 / 调研数据",
    inputPlaceholder:
      "例如：访谈 8 位企业客户，3 位明确提出审批流程太慢；2 位反映权限粒度不够细；其他人主要关心导出格式。",
    systemPrompt:
      "你是一位资深中文用户研究 + 产品经理。使用 product-management 插件中的 synthesize-research 技能，从材料里抽出洞察主题、引用原文、量化频次，再给出 3 条可下手的产品决定。中文输出，避免空洞总结。",
    examples: [
      "8 份用户访谈摘要需要归纳",
      "NPS 调研开放题有 200 条",
      "客服工单按主题需要聚类",
    ],
    glyph: "RES",
  },
  {
    id: "competitive-brief",
    level: "task",
    title: "竞品分析简报",
    subtitle: "Competitive Brief",
    blurb: "对比 2-3 个竞品，给出 diff、空白与下一步动作。",
    inputLabel: "你要对比的竞品 / 对比维度",
    inputPlaceholder: "例如：对比 Notion / Linear / Asana 在 AI 写作能力上的差异。",
    systemPrompt:
      "你是一位资深中文产品经理。使用 product-management 插件中的 competitive-brief 技能，只写 diff + what we don't have yet，禁止做完整 SWOT。给出 ASCII 框图对比，列出我方独有的优势与必须补的 gap，每条都附一个动作建议。",
    examples: [
      "对比三家协作工具的 AI 能力",
      "我们 vs 主要竞品在企业版定价",
      "竞品近一年的发布节奏对比",
    ],
    glyph: "DIF",
  },
  {
    id: "metrics-review",
    level: "task",
    title: "指标复盘",
    subtitle: "Metrics Review",
    blurb: "把仪表盘数字翻译成原因、机会、要做的动作。",
    inputLabel: "粘贴本期关键指标 / 异常",
    inputPlaceholder: "例如：DAU 环比 -3.2%；7 日留存 41% → 38%；新用户激活时长从 38s 涨到 51s。",
    systemPrompt:
      "你是一位资深中文产品 / 数据分析师。使用 product-management 插件中的 metrics-review 技能，对每个异常指标做：可能原因 (3 条) → 可验证假设 (2 条) → 可立刻执行的实验 / 修复 (1 条)。最后给出本周必看的 1 个 north-star。",
    examples: [
      "周报数据需要解读",
      "上线后核心指标有异常",
      "OKR 中期复盘",
    ],
    glyph: "KPI",
  },
  {
    id: "product-brainstorming",
    level: "task",
    title: "产品头脑风暴",
    subtitle: "Brainstorm",
    blurb: "围绕一个问题快速发散，再收敛成可验证的 3 个方向。",
    inputLabel: "你要发散的问题 / 机会点",
    inputPlaceholder: "例如：新用户激活率太低，能否在 onboarding 第一屏做点什么？",
    systemPrompt:
      "你是一位资深中文产品经理。使用 product-management 插件中的 product-brainstorming 技能，先发散 10 个想法（数量优先于质量），然后用 ICE 评分聚焦 3 个可验证方向，每个方向给出 MVP 范围与一个度量指标。",
    examples: [
      "新用户激活如何提升",
      "怎么让付费转化更顺畅",
      "如何降低客服工单",
    ],
    glyph: "IDE",
  },
  {
    id: "sprint-planning",
    level: "task",
    title: "冲刺规划",
    subtitle: "Sprint Planning",
    blurb: "把路线图切成 2 周可交付、有验收标准的 sprint backlog。",
    inputLabel: "本 sprint 想达成的目标 / 资源",
    inputPlaceholder: "例如：2 周 sprint，团队 3 人，目标是让新用户激活率 +5%。",
    systemPrompt:
      "你是一位资深中文产品经理 + Scrum Master。使用 product-management 插件中的 sprint-planning 技能，输出本 sprint 的目标、Backlog (Must/Should/Could)、风险与依赖、每个任务的验收标准与负责人槽位。",
    examples: [
      "2 周 sprint 规划",
      "团队容量分配",
      "明确本周必交付的事",
    ],
    glyph: "SPT",
  },

  // ── 项目级 / Project ──────────────────────────────────────────────────────
  {
    id: "project-charter",
    level: "project",
    title: "项目立项书",
    subtitle: "Project Charter",
    blurb: "把一个机会压成一页纸：目标、范围、成功指标、里程碑、团队。",
    inputLabel: "这个项目的背景 / 想解决的问题",
    inputPlaceholder:
      "例如：客户多次要求自助开票，预计影响 30% 企业客户。想立项做「自助发票中心」，2 个工程师 + 1 设计，目标本季度上线。",
    systemPrompt:
      "你是一位资深中文产品负责人。使用 product-management 插件，产出一份一页纸的项目立项书（Project Charter）。结构固定：① 问题与机会（含量化依据）② 项目目标与北极星指标 ③ In-scope / Out-of-scope 明确边界 ④ 关键里程碑（时间轴）⑤ 团队与角色（RACI 简表）⑥ 主要风险与前置假设 ⑦ 立项需要的决策点。先给一句话电梯陈述，再展开。",
    examples: [
      "自助发票中心要立项",
      "把增长实验平台立成正式项目",
      "为出海做合规改造项目",
    ],
    glyph: "CHT",
  },
  {
    id: "project-health",
    level: "project",
    title: "项目健康看板",
    subtitle: "Project Health",
    blurb: "把项目当前状态压成红黄绿健康卡：进度、风险、阻塞、下一步。",
    inputLabel: "项目当前进展 / 阻塞 / 数据",
    inputPlaceholder:
      "例如：支付重构项目，4 个里程碑完成 2 个，第 3 个延期 1 周；有 1 个跨团队依赖未确认；预算用了 60%。",
    systemPrompt:
      "你是一位资深中文项目负责人。使用 product-management 插件，输出一张项目健康看板：① 总体 RAG（红/黄/绿）与一句话理由 ② 维度评分表（进度 / 范围 / 风险 / 资源 / 信心，各给 R/A/G + 理由）③ Top 3 阻塞与负责人槽位 ④ 本周必须推动的 3 件事 ⑤ 需要上级介入的决策。用 ASCII 表呈现看板，结论先行。",
    examples: [
      "周会前要一张健康看板",
      "项目延期，需要给老板讲清楚状态",
      "多项目并行，要统一健康度口径",
    ],
    glyph: "HLT",
  },
  {
    id: "project-raid",
    level: "project",
    title: "风险依赖台账",
    subtitle: "RAID Log",
    blurb: "把项目的风险 / 假设 / 问题 / 依赖整理成可跟踪的台账。",
    inputLabel: "已知的风险 / 假设 / 问题 / 依赖（随便贴）",
    inputPlaceholder:
      "例如：风控接口可能延期；假设大促前流量翻 3 倍；当前登录偶发 5xx；依赖数据团队的口径表。",
    systemPrompt:
      "你是一位资深中文项目负责人。使用 product-management 插件，把输入整理成 RAID 台账（Risks / Assumptions / Issues / Dependencies 四类）。每条字段固定：编号、描述、影响（高/中/低）、概率或状态、缓解 / 验证动作、Owner 槽位、复查时间。用四张紧凑表格分类输出，最后给出本周最该处理的 3 条并说明理由。",
    examples: [
      "立项后要建 RAID 台账",
      "把会议里冒出的风险归档",
      "梳理跨团队依赖清单",
    ],
    glyph: "RAD",
  },
  {
    id: "project-retro",
    level: "project",
    title: "项目复盘",
    subtitle: "Project Retro",
    blurb: "里程碑 / 项目收尾后做结构化复盘，产出可执行 action。",
    inputLabel: "这个项目 / 阶段发生了什么",
    inputPlaceholder:
      "例如：自助开票项目，比计划晚 2 周上线；上线后客诉降 18%；过程中需求改了 3 次；联调踩了鉴权的坑。",
    systemPrompt:
      "你是一位资深中文产品负责人 + 敏捷教练。使用 product-management 插件，输出结构化项目复盘：① 目标 vs 实际（量化对比）② 做得好的（继续做）③ 做得不好的（停止做）④ 下次要尝试的（开始做）⑤ 根因分析（对最关键的 1-2 个问题做 5 Why）⑥ Action items（每条带 Owner 槽位与时间）。对事不对人，结论可执行。",
    examples: [
      "项目上线后做复盘",
      "里程碑结束的阶段回顾",
      "事故后的根因复盘",
    ],
    glyph: "RTR",
  },
];

export function getSkill(id: string): SkillMeta | undefined {
  return SKILLS.find((s) => s.id === id);
}

export function getLevel(id: string): LevelMeta | undefined {
  return LEVELS.find((l) => l.id === id);
}

/** 按 LEVELS 顺序返回 [层, 该层的视图[]]，空层会被跳过 */
export function skillsByLevel(): Array<{ level: LevelMeta; skills: SkillMeta[] }> {
  return LEVELS.map((level) => ({
    level,
    skills: SKILLS.filter((s) => s.level === level.id),
  })).filter((g) => g.skills.length > 0);
}
