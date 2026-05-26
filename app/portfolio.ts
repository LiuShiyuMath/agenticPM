/**
 * agentic·PM — 共享真实 git 遥测引擎（零渲染，纯数据）
 *
 * 这是「融合」的 DRY 骨干：把原本写死在 tui-project.ts 里的扫描 / 健康分 /
 * 风险 / 动量 / 花名册逻辑抽出来，让 **融合后的 TUI** 与 **PM 可读的 web
 * 前端** 共用同一套口径——零 mock，全部由 `git` 实时算出（口径忠实移植自
 * program-manager-tui/pm_tui.py）。
 *
 * 设计原则：本模块不含任何 ANSI / DOM / HTTP——只产出可 JSON 序列化的数据。
 * 渲染（终端 ANSI / 网页 DOM）留给各自的消费者。
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync, readFileSync } from "node:fs";
import { dirname, join, basename } from "node:path";

export const SPARK = "▁▂▃▄▅▆▇█";
export type Rag = "G" | "A" | "R";
export const RAG_ZH: Record<Rag, string> = { G: "绿", A: "黄", R: "红" };

export interface Risk {
  sev: "HIGH" | "MED" | "OK";
  msg: string;
}

export interface Proj {
  name: string;
  path: string;
  isGit: boolean;
  branch: string;
  dirty: number;
  author: string;
  ageDays: number;
  lastRel: string;
  total: number;
  weeks: number[]; // 12 周，旧→新
  hasOrigin: boolean;
  blurb: string;
  files: number;
  score: number;
  rag: Rag;
  risks: Risk[];
}

export interface RosterRow {
  name: string;
  commits: number;
  repos: string[];
}

/** 真实 git 调用（零 mock）。失败返回空串而非抛出，让上层优雅降级。 */
export function git(path: string, ...args: string[]): string {
  try {
    const p = spawnSync("git", ["-C", path, ...args], {
      encoding: "utf8",
      timeout: 8000,
    });
    return (p.stdout ?? "").trim();
  } catch {
    return "";
  }
}

export function rel(d: number): string {
  if (d >= 9999) return "从未";
  if (d === 0) return "今天";
  if (d < 7) return `${d} 天前`;
  if (d < 56) return `${Math.floor(d / 7)} 周前`;
  if (d < 365) return `${Math.floor(d / 30)} 个月前`;
  return `${Math.floor(d / 365)} 年前`;
}

export function readBlurb(path: string): string {
  for (const f of ["README.md", "readme.md", "README"]) {
    const fp = join(path, f);
    if (!existsSync(fp)) continue;
    try {
      let inComment = false;
      for (const raw of readFileSync(fp, "utf8").split("\n")) {
        let t = raw;
        if (inComment) {
          if (t.includes("-->")) {
            inComment = false;
            t = t.slice(t.indexOf("-->") + 3);
          } else continue;
        }
        if (t.includes("<!--") && !t.includes("-->")) inComment = true;
        const l = t
          .replace(/<!--.*?-->/g, "")
          .replace(/^[#>\s*`\-|]+/, "")
          .trim();
        if (l && !l.startsWith("```") && !/^[┌│└├─=╔╚║]/.test(l) && l.length > 6)
          return l;
      }
    } catch {}
  }
  return "（无 README 描述）";
}

function countFiles(path: string): number {
  // 浅层估算，跳过 node_modules / .git，控制成本
  let n = 0;
  const walk = (d: string, depth: number) => {
    if (depth > 3) return;
    let ents: string[];
    try {
      ents = readdirSync(d);
    } catch {
      return;
    }
    for (const e of ents) {
      if (e === ".git" || e === "node_modules" || e === "__pycache__") continue;
      const fp = join(d, e);
      let st;
      try {
        st = statSync(fp);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(fp, depth + 1);
      else n++;
      if (n > 9000) return;
    }
  };
  walk(path, 0);
  return n;
}

/** 透明、可复算的健康分（最高 100）—— 口径同 pm_tui.py，外加 no-git 罚则 */
function derive(p: Proj): void {
  if (!p.isGit) {
    p.score = 0;
    p.rag = "R";
    p.risks = [
      { sev: "HIGH", msg: "未纳入版本控制（无 .git，改动不可追溯/回滚）" },
      { sev: "OK", msg: `磁盘上 ${p.files} 个文件，但无提交历史可审计` },
    ];
    return;
  }
  let s = 0;
  const a = p.ageDays;
  s += a <= 14 ? 40 : a <= 28 ? 30 : a <= 56 ? 18 : 6;
  const d = p.dirty;
  s += d === 0 ? 30 : d <= 5 ? 22 : d <= 20 ? 12 : d <= 50 ? 6 : 0;
  const m = p.weeks.reduce((x, y) => x + y, 0);
  s += m >= 20 ? 20 : m >= 8 ? 14 : m >= 3 ? 9 : m >= 1 ? 4 : 0;
  s += p.branch === "main" || p.branch === "master" ? 10 : 4;
  p.score = s;
  p.rag = s >= 70 ? "G" : s >= 45 ? "A" : "R";
  const risks: Risk[] = [];
  if (p.total === 0) risks.push({ sev: "HIGH", msg: "尚无任何提交（空仓）" });
  else if (a > 56) risks.push({ sev: "HIGH", msg: `停滞：${a} 天无提交` });
  if (d > 50) risks.push({ sev: "HIGH", msg: `未提交 ${d} 个文件（丢失风险）` });
  else if (d > 20) risks.push({ sev: "MED", msg: `重 WIP：${d} 个文件未提交` });
  if (p.branch !== "main" && p.branch !== "master" && p.branch !== "—")
    risks.push({ sev: "MED", msg: `不在默认分支：${p.branch}` });
  if (!p.hasOrigin) risks.push({ sev: "HIGH", msg: "无 origin 远端（未备份）" });
  if (!risks.length) risks.push({ sev: "OK", msg: "未检出自动风险" });
  p.risks = risks;
}

export function scan(path: string): Proj {
  const name = basename(path);
  const isGit = existsSync(join(path, ".git"));
  const p: Proj = {
    name,
    path,
    isGit,
    branch: "—",
    dirty: 0,
    author: "—",
    ageDays: 9999,
    lastRel: "从未",
    total: 0,
    weeks: new Array(12).fill(0),
    hasOrigin: false,
    blurb: readBlurb(path),
    files: 0,
    score: 0,
    rag: "R",
    risks: [],
  };
  if (isGit) {
    p.branch = git(path, "rev-parse", "--abbrev-ref", "HEAD") || "—";
    p.dirty = git(path, "status", "--porcelain")
      .split("\n")
      .filter((x) => x.trim()).length;
    p.author = git(path, "log", "-1", "--format=%an") || "—";
    const ts = git(path, "log", "-1", "--format=%ct");
    const now = Math.floor(Date.now() / 1000);
    if (/^\d+$/.test(ts)) {
      p.ageDays = Math.max(0, Math.floor((now - Number(ts)) / 86400));
      p.lastRel = rel(p.ageDays);
    }
    const cnt = git(path, "rev-list", "--count", "HEAD");
    p.total = /^\d+$/.test(cnt) ? Number(cnt) : 0;
    p.hasOrigin = !!git(path, "remote", "get-url", "origin");
    const raw = git(path, "log", "--since=84 days ago", "--format=%ct");
    for (const ln of raw.split("\n")) {
      if (!/^\d+$/.test(ln.trim())) continue;
      const wk = Math.floor((now - Number(ln)) / (7 * 86400));
      if (wk >= 0 && wk < 12) {
        const idx = 11 - wk;
        p.weeks[idx] = (p.weeks[idx] ?? 0) + 1;
      }
    }
  } else {
    p.files = countFiles(path);
  }
  derive(p);
  return p;
}

export function sparkline(weeks: number[]): string {
  const mx = Math.max(...weeks) || 1;
  return weeks
    .map((v) => SPARK[v === 0 ? 0 : Math.min(7, 1 + Math.floor((v / mx) * 6))])
    .join("");
}

/** 「人」视图引擎 —— 真实 git 作者跨仓聚合，真正盘点组织里的人 */
export function roster(ps: Proj[]): RosterRow[] {
  const map = new Map<string, RosterRow>();
  for (const p of ps) {
    if (!p.isGit) continue;
    const sl = git(p.path, "shortlog", "-sn", "--all");
    for (const ln of sl.split("\n")) {
      const m = ln.match(/^\s*(\d+)\s+(.+?)\s*$/);
      if (!m) continue;
      const n = m[2]!;
      const row = map.get(n) ?? { name: n, commits: 0, repos: [] };
      row.commits += Number(m[1]);
      if (!row.repos.includes(p.name)) row.repos.push(p.name);
      map.set(n, row);
    }
  }
  return [...map.values()].sort((x, y) => y.commits - x.commits);
}

/** 最近 N 条提交（h|cr|an|s），供详情视图 / 注入 prompt 用 */
export function recentLog(path: string, n = 6): string[] {
  const log = git(path, "log", `-${n}`, "--format=%h|%cr|%an|%s");
  return log.split("\n").filter(Boolean);
}

/** 用户点名的默认组合（避免把重点淹没在 ~/projects 全量里） */
export const LISTED = [
  "comp-voice",
  "metrix-plugin",
  "metrixMarkets",
  "love-lab",
  "program-manager-tui",
  "api-guard",
  "agenticPM",
];

export function defaultBase(): string {
  // 本文件在 ~/projects/agenticPM/app 下：app → agenticPM → projects（上两级）
  return dirname(dirname(import.meta.dir));
}

export function discover(base: string, all: boolean): string[] {
  if (!all)
    return LISTED.map((n) => join(base, n)).filter((p) => existsSync(p));
  let ents: string[];
  try {
    ents = readdirSync(base).sort();
  } catch {
    return [];
  }
  return ents
    .map((n) => join(base, n))
    .filter((p) => {
      try {
        return statSync(p).isDirectory() && !basename(p).startsWith(".");
      } catch {
        return false;
      }
    });
}

/** 一站式：发现 → 扫描 → 按健康分升序（最差优先，PM 分诊序） */
export function scanPortfolio(base = defaultBase(), all = false): Proj[] {
  return discover(base, all)
    .map(scan)
    .sort((a, b) => a.score - b.score);
}
