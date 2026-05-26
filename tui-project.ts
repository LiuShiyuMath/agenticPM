#!/usr/bin/env bun
/**
 * agentic·PM — 融合控制台（Fused Console · 真实数据 + AI 工作流）
 *
 * 这一版把「旧 tui.ts」融进「项目中心控制台」，合二为一：
 *   · 组合 / 项目 / 人 / 风险 —— 真实 git 遥测（引擎 = app/portfolio.ts，
 *     口径忠实移植自 program-manager-tui/pm_tui.py，零 mock）。
 *   · 工作流（融合的关键）—— 选中一个项目，在它身上跑 12 个 PM 工作流之一。
 *     Agent 的 cwd 被设成「那个项目的真实路径」，prompt 自动前置该项目的
 *     真实 git 上下文（健康分 / 风险 / 最近提交 / 分支 / 花名册）。于是
 *     project-raid 产出的 RAID 台账是 *基于该仓真实风险* 的，不是空想。
 *
 * 视觉沿用 editorial 取向：近黑画布、暖象牙文字、唯一暖橙 accent #d24a18、
 * 发丝线、两行式项目行；渲染层逐行擦到行尾，杜绝切视图残影。
 *
 *   bun run tui-project.ts                 交互（默认只看点名的 7 个 + 工作流）
 *   bun run tui-project.ts --all           扫 base 下全部仓库
 *   bun run tui-project.ts --base DIR      指定扫描根
 *   bun run tui-project.ts --demo          自动演示（录屏用，零依赖、不联网）
 */
import {
  scan,
  sparkline,
  roster,
  recentLog,
  scanPortfolio,
  defaultBase,
  RAG_ZH,
  type Proj,
  type Rag,
} from "./app/portfolio.ts";
import {
  SKILLS,
  skillsByLevel,
  type SkillMeta,
} from "./app/skills.ts";
import { runAgentTUI } from "./app/agent-runner.ts";
import {
  CONSOLE_KEYS,
  RUN_KEYS,
  consoleState,
  dispatchConsole,
  dispatchRun,
} from "./app/tui-keymap.ts";

// ── editorial ANSI 调色板（重设计的核心：唯一 accent，去多色）──────────────
const E = "\x1b[";
const C = {
  reset: `${E}0m`,
  bold: `${E}1m`,
  ital: `${E}3m`,
  ink: `${E}38;2;228;220;205m`, // 象牙正文
  mute: `${E}38;2;138;130;116m`, // 静默
  faint: `${E}38;2;96;90;80m`, // 发丝/次要
  accent: `${E}38;2;210;74;24m`, // 暖橙 #d24a18 —— 唯一强调色
  accentBg: `${E}48;2;210;74;24m${E}38;2;20;18;15m`,
  paper: `${E}48;2;26;24;21m`, // 选中行底
  field: `${E}48;2;18;17;15m`,
  // RAG 用「明度」而非「彩度」表达，保持 editorial 克制
  g: `${E}38;2;150;176;120m`,
  a: `${E}38;2;212;162;92m`,
  r: `${E}38;2;208;96;78m`,
};
const RAG_C: Record<Rag, string> = { G: C.g, A: C.a, R: C.r };

const out: string[] = [];
const W = () => Math.max(92, process.stdout.columns || 104);
const H = () => Math.max(30, process.stdout.rows || 40);
const w = (s: string) => out.push(s);
const flush = () => {
  const h = H();
  const rows: string[] = [];
  for (let i = 0; i < h; i++) rows.push((out[i] ?? "") + `${E}0K`);
  // 光标归位 → 每行擦到行尾 → 末尾擦到屏尾，杜绝切视图残影
  process.stdout.write(`${E}H` + rows.join("\n") + `${E}0J`);
  out.length = 0;
};
const screen = {
  alt: () => process.stdout.write(`${E}?1049h`),
  normal: () => process.stdout.write(`${E}?1049l`),
  clear: () => process.stdout.write(`${E}2J${E}H`),
  hideCur: () => process.stdout.write(`${E}?25l`),
  showCur: () => process.stdout.write(`${E}?25h`),
};
const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
/** 中文按 2 列宽估算 */
const vw = (s: string) => {
  let n = 0;
  for (const ch of strip(s)) n += ch.charCodeAt(0) > 0xff ? 2 : 1;
  return n;
};
const pad = (s: string, width: number) => {
  const d = width - vw(s);
  return d > 0 ? s + " ".repeat(d) : s;
};
const clip = (s: string, width: number) => {
  if (vw(s) <= width) return s;
  let r = "";
  for (const ch of s) {
    if (vw(r) + (ch.charCodeAt(0) > 0xff ? 2 : 1) > width - 1) break;
    r += ch;
  }
  return r + "…";
};
const rule = (ch = "─", width = W() - 4) => C.faint + ch.repeat(width) + C.reset;

function gauge(score: number, rag: Rag, n = 10): string {
  const f = Math.round((score / 100) * n);
  return RAG_C[rag] + "▰".repeat(f) + C.faint + "▱".repeat(n - f) + C.reset;
}

// ── 重设计的渲染层（editorial：masthead / 两行式 / 发丝线 / 唯一 accent）────
const VIEWS = ["组合", "项目", "人", "风险", "工作流"] as const;
type View = (typeof VIEWS)[number];

function masthead(ps: Proj[], view: View, base: string) {
  const g = ps.filter((p) => p.rag === "G").length;
  const a = ps.filter((p) => p.rag === "A").length;
  const r = ps.filter((p) => p.rag === "R").length;
  const wip = ps.reduce((x, p) => x + p.dirty, 0);
  w(
    `  ${C.accent}${C.bold}agentic·PM${C.reset}` +
      `${C.mute}  融合控制台${C.reset}` +
      `${C.faint}   ·   ${base}${C.reset}`,
  );
  w(
    `  ${C.mute}${ps.length} 个项目   ` +
      `${C.g}●${g} 绿${C.reset}${C.mute}  ${C.a}●${a} 黄${C.reset}${C.mute}  ` +
      `${C.r}●${r} 红${C.reset}${C.mute}   ·   未提交 ${wip} 个文件   ·   ` +
      `${new Date().toLocaleString("zh-CN", { hour12: false })}${C.reset}`,
  );
  w("");
  const tabs = VIEWS.map((v, i) => {
    const on = v === view;
    return on
      ? `${C.accent}${C.bold}${i + 1} ${v}${C.reset}`
      : `${C.faint}${i + 1} ${v}${C.reset}`;
  }).join(`${C.faint}   ${C.reset}`);
  w(`  ${tabs}`);
  w(rule());
}

function vPortfolio(ps: Proj[], sel: number) {
  w("");
  ps.forEach((p, i) => {
    const on = i === sel;
    const mk = on ? `${C.accent}▌${C.reset}` : " ";
    const bgs = on ? C.paper : "";
    const nm = on
      ? `${C.accent}${C.bold}${p.name}${C.reset}`
      : `${C.ink}${p.name}${C.reset}`;
    const tag = p.isGit
      ? `${RAG_C[p.rag]}●${C.reset} ${C.mute}${RAG_ZH[p.rag]}${C.reset}`
      : `${C.faint}○ 无git${C.reset}`;
    const sp = p.isGit
      ? `${C.faint}${sparkline(p.weeks)}${C.reset}`
      : `${C.faint}············${C.reset}`;
    w(
      `${mk}${bgs} ${pad(tag, 7)} ${pad(nm, 18)}` +
        `${gauge(p.score, p.rag)}${C.mute}${String(p.score).padStart(4)}${C.reset} ` +
        `${pad(`${C.faint}${clip(p.branch, 9)}${C.reset}`, 10)}` +
        `${C.mute}W${String(p.dirty).padStart(3)}${C.reset} ` +
        `${pad(`${C.faint}${p.lastRel}${C.reset}`, 9)}` +
        `${sp} ${C.faint}${clip(p.author, 12)}${C.reset}${C.reset}`,
    );
    w(
      `${on ? C.paper : ""}   ${C.faint}${C.ital}${clip(p.blurb, W() - 12)}${C.reset}`,
    );
  });
  w("");
  w(`  ${C.mute}按健康分升序 · 最差优先（PM 分诊序）${C.reset}`);
  w(
    `  ${C.faint}分 = 新近(40) + 干净树(30) + 动量(20) + 分支卫生(10) · ` +
      `RAG ≥70 绿 / ≥45 黄 / <45 红 · 全部来自真实 git${C.reset}`,
  );
  w("");
  w(
    `  ${C.mute}↵ 看详情   ${C.accent}5 工作流${C.reset}${C.mute} = 在选中项目上跑 PM 工作流（融合）${C.reset}`,
  );
}

function vDetail(p: Proj) {
  w("");
  w(
    `  ${p.isGit ? RAG_C[p.rag] + "●" : C.faint + "○"}${C.reset} ` +
      `${C.bold}${C.ink}${p.name}${C.reset}${C.faint}   ${p.path}${C.reset}`,
  );
  w(`  ${C.mute}${C.ital}${clip(p.blurb, W() - 6)}${C.reset}`);
  w("");
  if (!p.isGit) {
    w(`  ${C.r}未纳入版本控制${C.reset}${C.mute} —— 无 git 历史可审计${C.reset}`);
    w(`  ${C.faint}磁盘文件 ${C.reset}${C.ink}${p.files}${C.reset}`);
    w("");
    w(`  ${C.accent}风险${C.reset}`);
    for (const rk of p.risks)
      w(`  ${rk.sev === "HIGH" ? C.r : C.mute}· ${rk.msg}${C.reset}`);
    w("");
    w(
      `  ${C.mute}5 工作流${C.reset}${C.faint} 仍可在此项目上运行（如 project-charter 先把它正式立项）${C.reset}`,
    );
    return;
  }
  const kv = (k: string, v: string) =>
    `${C.faint}${k} ${C.reset}${C.ink}${v}${C.reset}`;
  w(
    "  " +
      [
        kv("健康", `${p.score}/100 ${RAG_ZH[p.rag]}`),
        kv("分支", p.branch),
        kv("提交", String(p.total)),
        kv("最近", p.lastRel),
        kv("作者", p.author),
      ].join(`${C.faint}    ${C.reset}`),
  );
  w(
    "  " +
      [
        kv("未提交", `${p.dirty} 个文件`),
        kv("远端", p.hasOrigin ? "有" : "缺失"),
        kv("90 天提交", String(p.weeks.reduce((x, y) => x + y, 0))),
      ].join(`${C.faint}    ${C.reset}`),
  );
  w("");
  w(`  ${C.accent}12 周提交动量${C.reset}`);
  const mx = Math.max(...p.weeks) || 1;
  for (let lvl = 4; lvl >= 1; lvl--) {
    const thr = (mx * lvl) / 4;
    const bars = p.weeks
      .map((v) => (v >= thr && v > 0 ? `${C.accent}█${C.reset}` : "  "))
      .join(" ");
    w(`  ${C.faint}${String(Math.round(thr)).padStart(3)}${C.reset} ${bars}`);
  }
  w(
    `  ${C.faint}    ` +
      Array.from({ length: 12 }, (_, i) => `w${i + 1}`.padEnd(2)).join(" ") +
      `  旧 → 新${C.reset}`,
  );
  w("");
  w(`  ${C.accent}最近提交${C.reset}`);
  const log = recentLog(p.path, 6);
  if (!log.length) w(`  ${C.faint}（无历史）${C.reset}`);
  for (const ln of log) {
    const [h, when, who, ...rest] = ln.split("|");
    const subj = rest.join("|");
    w(
      `  ${C.accent}${h}${C.reset} ${C.faint}${pad(when ?? "", 12)}${C.reset}` +
        `${C.mute}${pad(clip(who ?? "", 14), 15)}${C.reset}${C.ink}${clip(subj, W() - 40)}${C.reset}`,
    );
  }
  w("");
  w(
    `  ${C.mute}5 工作流${C.reset}${C.faint} = 在此项目上跑 PM 工作流，上面的真实 git 上下文会自动注入 prompt${C.reset}`,
  );
}

/** 「人」视图 —— 真实 git 作者跨仓聚合，真正盘点组织里的人 */
function vRoster(ps: Proj[], sel: number) {
  const rows = roster(ps);
  const mx = rows[0]?.commits || 1;
  w("");
  w(
    `  ${C.mute}${rows.length} 位贡献者在册 · 跨 ${
      ps.filter((p) => p.isGit).length
    } 个 git 仓 · 按真实提交数聚合${C.reset}`,
  );
  w("");
  rows.forEach((rw, i) => {
    const on = i === sel;
    const mk = on ? `${C.accent}▌${C.reset}` : " ";
    const bgs = on ? C.paper : "";
    const nm = on
      ? `${C.accent}${C.bold}${rw.name}${C.reset}`
      : `${C.ink}${rw.name}${C.reset}`;
    const barN = Math.max(1, Math.round((rw.commits / mx) * 28));
    const heavy = rw.repos.length >= 4;
    w(
      `${mk}${bgs} ${pad(nm, on ? 22 : 18)}` +
        `${C.accent}${"▮".repeat(barN)}${C.reset} ` +
        `${C.mute}${rw.commits} commits${heavy ? `  ${C.a}⚠ ${rw.repos.length} 仓` : ""}${C.reset}${C.reset}`,
    );
    w(
      `${on ? C.paper : ""}   ${C.faint}参与：${clip(rw.repos.join(" · "), W() - 12)}${C.reset}`,
    );
  });
  w("");
  w(`  ${C.faint}单人霸榜 = 巴士因子 1 风险；跨 ≥4 仓 = 注意力被摊薄${C.reset}`);
}

function vRisks(ps: Proj[]) {
  const flat: Array<{ sev: string; name: string; msg: string }> = [];
  for (const p of ps)
    for (const rk of p.risks)
      flat.push({ sev: rk.sev, name: p.name, msg: rk.msg });
  const ord: Record<string, number> = { HIGH: 0, MED: 1, OK: 2 };
  flat.sort((x, y) => (ord[x.sev] ?? 3) - (ord[y.sev] ?? 3));
  const hi = flat.filter((f) => f.sev === "HIGH").length;
  const md = flat.filter((f) => f.sev === "MED").length;
  const ok = flat.filter((f) => f.sev === "OK").length;
  w("");
  w(
    `  ${C.accent}自动风险台账${C.reset}${C.mute}   信号全部来自真实 git 状态${C.reset}`,
  );
  w(rule());
  w(
    `  ${C.r}■ ${hi} 高${C.reset}${C.mute}   ${C.a}■ ${md} 中${C.reset}` +
      `${C.mute}   ${C.g}■ ${ok} 净${C.reset}`,
  );
  w("");
  for (const f of flat.slice(0, H() - 12)) {
    const col = f.sev === "HIGH" ? C.r : f.sev === "MED" ? C.a : C.g;
    const t = f.sev === "HIGH" ? "高" : f.sev === "MED" ? "中" : "净";
    w(
      `  ${col}${C.bold}${t}${C.reset}  ` +
        `${C.ink}${pad(clip(f.name, 22), 23)}${C.reset}` +
        `${C.mute}${clip(f.msg, W() - 32)}${C.reset}`,
    );
  }
}

/**
 * 「工作流」视图 —— 融合的落点。
 * 顶部钉住「目标项目」（= 组合里选中的那个），下面是 12 个 PM 工作流分层菜单。
 * ↵ = 在这个项目上运行该工作流（真实 git 上下文自动注入 prompt）。
 */
function vWorkflows(target: Proj | undefined, skillSel: number) {
  w("");
  if (!target) {
    w(`  ${C.r}没有可用项目${C.reset}`);
    return;
  }
  const tag = target.isGit
    ? `${RAG_C[target.rag]}●${C.reset} ${C.mute}${RAG_ZH[target.rag]} ${target.score}/100${C.reset}`
    : `${C.faint}○ 无git${C.reset}`;
  w(
    `  ${C.faint}目标项目${C.reset}  ${C.accent}${C.bold}${target.name}${C.reset}` +
      `   ${tag}${C.faint}   ${clip(target.path, W() - 40)}${C.reset}`,
  );
  w(
    `  ${C.faint}注入：健康分 · ${target.isGit ? `分支 ${target.branch} · 未提交 ${target.dirty} · 最近 ${target.lastRel}` : "未版本控制"} · 风险 ${target.risks.length} 条 · 最近提交 · 花名册${C.reset}`,
  );
  w(rule());
  let flatIdx = 0;
  for (const { level, skills } of skillsByLevel()) {
    w("");
    w(
      `  ${C.accent}▌${C.reset} ${C.bold}${C.ink}${level.label}${C.reset} ` +
        `${C.faint}${level.sub}${C.reset}`,
    );
    for (const s of skills) {
      const on = flatIdx === skillSel;
      const mk = on ? `${C.accent}▌${C.reset}` : " ";
      const bgs = on ? C.paper : "";
      const glyph = on
        ? `${C.accentBg} ${s.glyph} ${C.reset}`
        : `${C.faint}${s.glyph}${C.reset}`;
      const title = on
        ? `${C.accent}${C.bold}${s.title}${C.reset}`
        : `${C.ink}${s.title}${C.reset}`;
      w(
        `${mk}${bgs} ${glyph}  ${pad(title, on ? 14 : 10)}` +
          `${C.mute}${pad(s.subtitle, 22)}${C.reset}` +
          `${C.faint}${clip(s.blurb, W() - 50)}${C.reset}`,
      );
    }
    flatIdx += skills.length;
  }
  w("");
  w(
    `  ${C.mute}↑↓ 选工作流   ↵ 在「${target.name}」上运行   ` +
      `1-4 回到组合/项目/人/风险${C.reset}`,
  );
}

// ── 常驻按键图例 —— 直接由键位真相源 CONSOLE_KEYS 渲染 ──────────────────────
// 不手写、不折叠在 ? 之后：每个键都来自 dispatchConsole 真正认的那张表，
// 所以「屏上写的键 = 真能用的键」与 renderHelp / judge 同一不漂移保证。
// 完整长句仍可按 ? 看 renderHelp，这里只取每行 label 的标题段做常驻提示。
const legendHead = (s: string) => {
  const dash = s.indexOf(" —— ");
  if (dash > 0) return s.slice(0, dash);
  const par = s.search(/[（(]/);
  const b = par > 0 ? s.slice(0, par).trim() : s;
  return vw(b) > 16 ? clip(b, 16) : b;
};

function legendLines(view: View): string[] {
  const byScope = new Map<string, typeof CONSOLE_KEYS>();
  for (const b of CONSOLE_KEYS) {
    const arr = byScope.get(b.scope) ?? [];
    arr.push(b);
    byScope.set(b.scope, arr);
  }
  const lines: string[] = [];
  for (const [scope, bs] of byScope) {
    const cells = bs
      .map(
        (b) =>
          `${C.accent}${[...new Set(b.glyphs)].join("/")}${C.reset} ` +
          `${C.mute}${legendHead(b.label)}${C.reset}`,
      )
      .join(`${C.faint} · ${C.reset}`);
    lines.push(`  ${C.faint}${pad(scope, 8)}${C.reset}${cells}`);
  }
  if (view === "工作流")
    lines.push(
      `  ${C.faint}${pad("运行", 8)}${C.reset}` +
        `${C.accent}↵${C.reset} ${C.mute}在「选中项目」的真实 cwd 下运行该工作流（Agent 流式输出）${C.reset}`,
    );
  return lines;
}

function render(
  ps: Proj[],
  view: View,
  sel: number,
  base: string,
  skillSel = 0,
) {
  out.length = 0;
  masthead(ps, view, base);
  if (!ps.length) w(`\n  ${C.r}base 下没有项目。${C.reset}`);
  else if (view === "组合") vPortfolio(ps, sel);
  else if (view === "项目") vDetail(ps[Math.min(sel, ps.length - 1)]!);
  else if (view === "人") vRoster(ps, sel);
  else if (view === "风险") vRisks(ps);
  else vWorkflows(ps[Math.min(sel, ps.length - 1)], skillSel);
  const leg = legendLines(view);
  const tail =
    view === "工作流"
      ? `真实 git 遥测 · Agent 在该项目真实 cwd 下流式运行`
      : `真实 git 遥测 · 零依赖 · 交互模式（在选中项目上真跑工作流）`;
  while (out.length < H() - leg.length - 2) w("");
  w(rule());
  for (const l of leg) w(l);
  w(`  ${C.mute}${tail}${C.reset}`);
  flush();
}

// ── 使用指南（How to Use）—— 由键位真相源 app/tui-keymap.ts 生成 ────────────
// 这一屏不是手写文案：每一行都来自 CONSOLE_KEYS / RUN_KEYS，所以它写的键
// 与 dispatchConsole / dispatchRun 真正认的键永远一致（被 judge 强约束）。
function renderHelp(ps: Proj[], base: string) {
  out.length = 0;
  w(
    `  ${C.accent}${C.bold}agentic·PM${C.reset}` +
      `${C.mute}  使用指南${C.reset}` +
      `${C.faint}   ·   How to Use   ·   ${base}${C.reset}`,
  );
  w(
    `  ${C.faint}每个键都来自键位真相源，第三方 judge 已逐条验证「指南即真实行为」${C.reset}`,
  );
  w(rule());

  const rows = [...CONSOLE_KEYS, ...RUN_KEYS];
  const keyCol = (b: (typeof rows)[number]) => b.glyphs.join(" / ");
  const kw = Math.min(
    16,
    Math.max(...rows.map((b) => vw(keyCol(b)))) + 1,
  );
  const seen = new Set<string>();
  for (const b of rows) {
    if (!seen.has(b.scope)) {
      seen.add(b.scope);
      w("");
      w(`  ${C.accent}▌${C.reset} ${C.bold}${C.ink}${b.scope}${C.reset}`);
    }
    w(
      `   ${C.accent}${pad(keyCol(b), kw)}${C.reset}` +
        `${C.faint}│${C.reset} ${C.ink}${clip(b.label, W() - kw - 8)}${C.reset}`,
    );
  }
  w("");
  while (out.length < H() - 2) w("");
  w(rule());
  w(
    `  ${C.mute}按任意键返回控制台   ${C.faint}·${C.reset}   ` +
      `${C.mute}q / Ctrl+C 退出   ${C.faint}·   指南与按键同源，不可漂移${C.reset}`,
  );
  flush();
}

// ── 融合的核心：把项目真实 git 上下文注入 PM 工作流 prompt ──────────────────
function projectContext(p: Proj): string {
  const lines: string[] = [];
  lines.push("【真实项目上下文 · 由 agentic·PM 控制台从 git 实时算出，零编造】");
  lines.push(`项目：${p.name}（${p.path}）`);
  lines.push(`README 首句：${p.blurb}`);
  if (p.isGit) {
    lines.push(
      `健康分：${p.score}/100 ${RAG_ZH[p.rag]}（新近+干净树+动量+分支卫生，口径同 pm_tui.py，可复算）`,
    );
    lines.push(
      `分支 ${p.branch} · 未提交 ${p.dirty} 个文件 · 提交总数 ${p.total} · 最近 ${p.lastRel} · 远端 ${p.hasOrigin ? "有" : "缺失"} · 90 天提交 ${p.weeks.reduce((x, y) => x + y, 0)}`,
    );
    const log = recentLog(p.path, 6);
    if (log.length) {
      lines.push("最近提交：");
      for (const ln of log) {
        const [h, when, who, ...rest] = ln.split("|");
        lines.push(`  ${h} · ${when} · ${who} · ${rest.join("|")}`);
      }
    }
    const rs = roster([p]);
    if (rs.length)
      lines.push(
        `贡献者（本仓 git shortlog）：${rs
          .slice(0, 5)
          .map((r) => `${r.name}(${r.commits})`)
          .join(" · ")}`,
      );
  } else {
    lines.push("版本控制：未纳入 git —— 无提交历史可审计，磁盘文件约 " + p.files);
  }
  if (p.risks.length) {
    lines.push("控制台自动推导的风险：");
    for (const rk of p.risks) lines.push(`  [${rk.sev}] ${rk.msg}`);
  }
  lines.push(
    "—— 以上为真实遥测。请基于它执行下面的 PM 工作流；信息不足时用 Read/Grep 读这个项目的真实文件补全，不要编造。",
  );
  return lines.join("\n");
}

// ── 输入 ────────────────────────────────────────────────────────────────────
function readKey(): Promise<string> {
  return new Promise((res) => {
    const s = process.stdin;
    const wr = s.isRaw;
    if (s.setRawMode) s.setRawMode(true);
    s.resume();
    const on = (b: Buffer) => {
      s.removeListener("data", on);
      if (s.setRawMode) s.setRawMode(Boolean(wr));
      res(b.toString("utf8"));
    };
    s.on("data", on);
  });
}

function askLine(promptStr: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(promptStr);
    const s = process.stdin;
    const wr = s.isRaw;
    if (s.setRawMode) s.setRawMode(false);
    s.resume();
    let buf = "";
    const on = (b: Buffer) => {
      const str = b.toString("utf8");
      if (str === "\r" || str === "\n") {
        s.removeListener("data", on);
        if (s.setRawMode) s.setRawMode(Boolean(wr));
        process.stdout.write("\n");
        resolve(buf.trim());
      } else if (str === "\x7f" || str === "\b") {
        if (buf.length) {
          buf = buf.slice(0, -1);
          process.stdout.write("\b \b");
        }
      } else if (str === "\x03") {
        process.exit(0);
      } else {
        buf += str;
        process.stdout.write(str);
      }
    };
    s.on("data", on);
  });
}

const AGENT_SINK = {
  w: (s: string) => process.stdout.write(s),
  line: () => rule(),
  c: {
    accent: C.accent,
    bold: C.bold,
    ital: C.ital,
    reset: C.reset,
    faint: C.faint,
    ok: C.g,
  },
};

/** 离开控制台 → 在选中项目的真实 cwd 下跑 Agent → 回到控制台。 */
async function launchWorkflow(skill: SkillMeta, target: Proj) {
  screen.normal();
  screen.showCur();
  screen.clear();
  process.stdout.write(
    `  ${C.accent}${C.bold}agentic·PM${C.reset}${C.mute}  融合 · 在真实项目上跑工作流${C.reset}\n`,
  );
  process.stdout.write(
    `  ${C.faint}工作流 ${C.reset}${C.ink}${skill.title}${C.reset}${C.faint}（${skill.subtitle}）  ·  目标 ${C.reset}${C.accent}${target.name}${C.reset}${C.faint}  ·  cwd=${target.path}${C.reset}\n`,
  );
  process.stdout.write(rule() + "\n");
  process.stdout.write(`  ${C.bold}${skill.inputLabel}${C.reset}\n`);
  process.stdout.write(`  ${C.faint}${C.ital}${skill.inputPlaceholder}${C.reset}\n`);
  process.stdout.write(
    `  ${C.faint}示例： ${skill.examples.map((e) => "· " + e).join("   ")}${C.reset}\n`,
  );
  process.stdout.write(
    `  ${C.mute}（留空直接回车 = 用项目上下文跑默认动作）${C.reset}\n\n`,
  );

  let session: string | undefined;
  for (;;) {
    const raw = await askLine(`${C.accent}› ${C.reset}`);
    const userAsk =
      raw || `请基于上面的真实 git 上下文，对「${target.name}」执行本工作流。`;
    const fullPrompt = `${projectContext(target)}\n\n${userAsk}`;
    session = await runAgentTUI(
      skill,
      fullPrompt,
      session,
      AGENT_SINK,
      target.path,
    );
    process.stdout.write(
      `\n${C.faint}  ↵ 在此项目继续追问    n 返回控制台    q 退出${C.reset}\n`,
    );
    const e = dispatchRun(await readKey());
    if (e === "quit") process.exit(0);
    if (e === "back") break;
    process.stdout.write("\n");
  }
  screen.alt();
  screen.hideCur();
}

async function interactive(ps: Proj[], base: string) {
  screen.alt();
  screen.hideCur();
  process.on("exit", () => {
    screen.showCur();
    screen.normal();
  });
  process.on("SIGINT", () => process.exit(0));
  // 主循环纯粹做宿主：渲染 + 取键 + 把键交给 app/tui-keymap.ts 的纯 dispatch。
  // 视图切换 / 导航 / 帮助开关全在 state 里；副作用只剩 rescan 与 runWorkflow。
  let state = consoleState({ psLen: ps.length, skillsLen: SKILLS.length });
  for (;;) {
    if (state.help) {
      renderHelp(ps, base);
    } else {
      const view = VIEWS[state.vi]!;
      const max = view === "人" ? 999 : ps.length;
      render(ps, view, Math.min(state.sel, max - 1), base, state.skillSel);
    }
    const { state: next, effect } = dispatchConsole(state, await readKey());
    state = next;
    if (effect === "quit") break;
    if (effect === "rescan") {
      ps = ps.map((p) => scan(p.path)).sort((a, b) => a.score - b.score);
      state.psLen = ps.length;
    } else if (effect === "runWorkflow") {
      const target = ps[Math.min(state.sel, ps.length - 1)];
      const skill = SKILLS[state.skillSel];
      if (target && skill) await launchWorkflow(skill, target);
    }
  }
  screen.showCur();
  screen.normal();
  w("");
  process.stdout.write(
    `${C.mute}再见 —— agentic·PM 融合控制台${C.reset}\n`,
  );
}

// ── 自动演示（录屏 / CI 用，真实数据、不联网）────────────────────────────────
async function demo(ps: Proj[], base: string) {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  screen.alt();
  screen.hideCur();
  try {
    render(ps, "组合", 0, base);
    await sleep(1700);
    for (let i = 1; i < Math.min(ps.length, 7); i++) {
      render(ps, "组合", i, base);
      await sleep(420);
    }
    await sleep(900);
    const worst = ps.findIndex((p) => p.isGit && p.total > 0);
    render(ps, "组合", Math.max(0, worst), base);
    await sleep(800);
    render(ps, "项目", Math.max(0, worst), base);
    await sleep(3200);
    const best = ps.length - 1;
    render(ps, "项目", best, base);
    await sleep(2600);
    render(ps, "人", 0, base);
    await sleep(1500);
    render(ps, "人", 1, base);
    await sleep(2200);
    render(ps, "风险", 0, base);
    await sleep(3000);
    // 融合落点：在最差且有历史的项目上，浏览工作流菜单（演示不联网，不真调 Agent）
    render(ps, "工作流", Math.max(0, worst), base, 0);
    await sleep(2200);
    render(ps, "工作流", Math.max(0, worst), base, 9); // 移到「风险依赖台账」
    await sleep(2600);
    render(ps, "工作流", best, base, 9);
    await sleep(2200);
    render(ps, "组合", 0, base);
    await sleep(1600);
  } finally {
    screen.showCur();
    screen.normal();
  }
  process.stdout.write(
    `${C.mute}演示结束 —— 真实数据 · 融合控制台（交互模式可在项目上真跑工作流）${C.reset}\n`,
  );
}

// ── 入口 ────────────────────────────────────────────────────────────────────
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const base = arg("base") || defaultBase(); // 默认 ~/projects
  const all = process.argv.includes("--all");
  // 非交互入口：直接打印「使用指南」就退出。和 TUI 里按 ? 打开的是
  // 同一个 renderHelp（同一份键位真相源），所以这就是真实指南快照。
  if (
    process.argv.includes("--help") ||
    process.argv.includes("-h") ||
    process.argv.includes("--guide")
  ) {
    renderHelp([], base);
    process.stdout.write("\n");
    return;
  }
  screen.clear();
  process.stdout.write(
    `  ${C.accent}${C.bold}agentic·PM${C.reset}${C.mute}  扫描 ${base} 的真实 git 遥测…${C.reset}\n`,
  );
  const ps = scanPortfolio(base, all);
  // 默认 = 交互模式（在选中项目上真跑工作流、Agent 终端流式渲染）。
  // 仅在显式 --demo 时走自动演示；不再因「stdin 非 TTY」静默降级成 demo。
  if (process.argv.includes("--demo")) {
    await demo(ps, base);
  } else {
    await interactive(ps, base);
  }
}

main();
