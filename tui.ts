#!/usr/bin/env bun
/**
 * agentic·PM — 终端版（中文 TUI）
 *
 * 与 server.ts 同源：复用 app/skills.ts 的 12 个工作流元数据 + 系统提示词，
 * 直接调用 Claude Agent SDK 的 query()，把 SSE 流改成终端流式渲染。
 * 零依赖、纯 ANSI、Bun 原生 stdin —— 与项目「editorial 报纸感」设计取向一致。
 *
 *   bun run tui.ts          交互模式
 *   bun run tui.ts --skill write-spec --prompt "..."   一次性（CI / 录屏脚本用）
 */
import { SKILLS, getSkill, skillsByLevel, type SkillMeta } from "./app/skills.ts";
import { runAgentTUI } from "./app/agent-runner.ts";
import {
  MENU_KEYS,
  RUN_KEYS,
  menuState,
  dispatchMenu,
  dispatchRun,
} from "./app/tui-keymap.ts";
import * as readline from "node:readline";

// ── ANSI ────────────────────────────────────────────────────────────────────
const E = "\x1b[";
const C = {
  reset: `${E}0m`,
  bold: `${E}1m`,
  dim: `${E}2m`,
  ital: `${E}3m`,
  // 暖橙 accent —— 对齐 web 版 #d24a18
  accent: `${E}38;2;210;74;24m`,
  accentBg: `${E}48;2;210;74;24m${E}38;2;255;248;240m`,
  faint: `${E}38;2;150;142;132m`,
  rule: `${E}38;2;90;84;78m`,
  ok: `${E}38;2;120;170;110m`,
};
const screen = {
  alt: () => process.stdout.write(`${E}?1049h`),
  normal: () => process.stdout.write(`${E}?1049l`),
  clear: () => process.stdout.write(`${E}2J${E}H`),
  home: () => process.stdout.write(`${E}H`),
  hideCur: () => process.stdout.write(`${E}?25l`),
  showCur: () => process.stdout.write(`${E}?25h`),
};
const cols = () => process.stdout.columns || 80;
const w = (s: string) => process.stdout.write(s);
const line = (ch = "─") => C.rule + ch.repeat(Math.min(cols(), 78)) + C.reset;

// ── 单键读取（raw 模式）─────────────────────────────────────────────────────
function readKey(): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    if (stdin.setRawMode) stdin.setRawMode(true);
    stdin.resume();
    const onData = (buf: Buffer) => {
      stdin.removeListener("data", onData);
      if (stdin.setRawMode) stdin.setRawMode(Boolean(wasRaw));
      resolve(buf.toString("utf8"));
    };
    stdin.on("data", onData);
  });
}

// ── 行输入（cooked，支持粘贴 / 编辑）────────────────────────────────────────
function askLine(promptStr: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    rl.question(promptStr, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// ── 横幅 ────────────────────────────────────────────────────────────────────
function banner() {
  w(
    `${C.accent}${C.bold}  agentic·PM${C.reset}` +
      `${C.faint}   ·   产品经理的终端工作台${C.reset}\n`,
  );
  w(`${C.faint}  Claude Agent SDK · product-management 插件 · 全程中文${C.reset}\n`);
  w(line() + "\n");
}

// ── 使用指南（How to Use）—— 由键位真相源 app/tui-keymap.ts 生成 ────────────
function renderMenuHelp() {
  screen.clear();
  banner();
  w(`${C.faint}  使用指南 · How to Use${C.reset}\n`);
  w(
    `${C.faint}  每个键都来自键位真相源，第三方 judge 已逐条验证「指南即真实行为」${C.reset}\n`,
  );
  const rows = [...MENU_KEYS, ...RUN_KEYS];
  let scope = "";
  for (const b of rows) {
    if (b.scope !== scope) {
      scope = b.scope;
      w(`\n${C.accent}▌${C.reset} ${C.bold}${scope}${C.reset}\n`);
    }
    const keyCol = b.glyphs.join(" / ").padEnd(14);
    w(`   ${C.accent}${keyCol}${C.reset}${C.faint}│${C.reset} ${b.label}\n`);
  }
  w("\n" + line() + "\n");
  w(`${C.faint}  按任意键返回    q / Ctrl+C 退出    指南与按键同源，不可漂移${C.reset}`);
}

// ── 菜单 ────────────────────────────────────────────────────────────────────
async function pickSkill(): Promise<SkillMeta | null> {
  const groups = skillsByLevel();
  let st = menuState({ n: SKILLS.length });
  for (;;) {
    if (st.help) {
      renderMenuHelp();
      const r = dispatchMenu(st, await readKey());
      st = r.state;
      if (r.effect === "quit") return null;
      continue;
    }
    screen.clear();
    banner();
    w(
      `${C.faint}  选择一个工作流  ·  任务 / 项目 两层视图${C.reset}\n`,
    );
    for (const { level, skills } of groups) {
      w(
        `\n${C.accent}▌${C.reset} ${C.bold}${level.label}${C.reset} ` +
          `${C.faint}${level.sub} · ${skills.length} 个视图${C.reset}\n`,
      );
      for (const s of skills) {
        const i = SKILLS.indexOf(s);
        const on = i === st.idx;
        const num = `${C.faint}${String(i + 1).padStart(2)}${C.reset}`;
        const glyph = on
          ? `${C.accentBg} ${s.glyph} ${C.reset}`
          : `${C.accent}▌${s.glyph}${C.reset}`;
        const title = on
          ? `${C.accent}${C.bold}${s.title}${C.reset}`
          : `${C.bold}${s.title}${C.reset}`;
        const mark = on ? `${C.accent}▸${C.reset}` : " ";
        w(`  ${mark} ${num}  ${glyph}  ${title}  ${C.faint}${s.subtitle}${C.reset}\n`);
      }
    }
    w("\n" + line() + "\n");
    w(
      `${C.faint}  ↑↓ / j k 选择    1-9 直达    ↵ 进入    ? 帮助    q 退出${C.reset}`,
    );

    const { state: next, effect } = dispatchMenu(st, await readKey());
    st = next;
    if (effect === "quit") return null;
    if (effect === "enter") return SKILLS[st.idx]!;
  }
}

// ── 一次 Agent 调用 —— 走共享运行层（与 tui-project.ts / server.ts 同源）────
function runAgent(
  skill: SkillMeta,
  prompt: string,
  resumeId: string | undefined,
): Promise<string | undefined> {
  return runAgentTUI(skill, prompt, resumeId, {
    w,
    line,
    c: {
      accent: C.accent,
      bold: C.bold,
      ital: C.ital,
      reset: C.reset,
      faint: C.faint,
      ok: C.ok,
    },
  });
}

// ── 主循环 ──────────────────────────────────────────────────────────────────
async function interactive() {
  screen.alt();
  process.on("exit", () => {
    screen.showCur();
    screen.normal();
  });
  process.on("SIGINT", () => process.exit(0));

  for (;;) {
    screen.hideCur();
    const skill = await pickSkill();
    if (!skill) break;

    let session: string | undefined;
    for (;;) {
      screen.clear();
      screen.showCur();
      banner();
      w(`${C.accent}▌${C.reset} ${C.bold}${skill.title}${C.reset}  ${C.faint}${skill.subtitle}${C.reset}\n\n`);
      w(`${C.bold}${skill.inputLabel}${C.reset}\n`);
      w(`${C.faint}${C.ital}${skill.inputPlaceholder}${C.reset}\n`);
      w(`${C.faint}示例： ${skill.examples.map((e) => "· " + e).join("   ")}${C.reset}\n\n`);

      const input = (await askLine(`${C.accent}› ${C.reset}`)).trim();
      if (!input) break; // 空输入 → 回菜单

      screen.hideCur();
      session = await runAgent(skill, input, session);

      screen.showCur();
      w(
        `\n${C.faint}  ↵ 在本工作流继续追问    n 换工作流    q 退出${C.reset}\n`,
      );
      const e = dispatchRun(await readKey());
      if (e === "quit") process.exit(0);
      if (e === "back") break;
      // continue：其它键（含 ↵）→ 留在本 skill，session 续接
    }
  }
  screen.showCur();
  screen.normal();
  w(`${C.faint}再见 —— agentic·PM${C.reset}\n`);
}

// ── 一次性模式（录屏 / CI 用）──────────────────────────────────────────────
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  if (
    process.argv.includes("--help") ||
    process.argv.includes("-h") ||
    process.argv.includes("--guide")
  ) {
    renderMenuHelp(); // 内部已 clear + banner
    w("\n");
    return;
  }
  const skillId = arg("skill");
  const prompt = arg("prompt");
  if (skillId && prompt) {
    const skill = getSkill(skillId);
    if (!skill) {
      console.error(`未知工作流：${skillId}`);
      process.exit(1);
    }
    banner();
    await runAgent(skill, prompt, undefined);
    w("\n");
    return;
  }
  await interactive();
}

main();
