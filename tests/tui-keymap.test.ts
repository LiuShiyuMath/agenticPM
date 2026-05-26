/**
 * 第三方 judge —— 遍历「使用指南」每一行，证明它真的能用。
 *
 * 这不是「代码自己夸自己」：被测对象是 app/tui-keymap.ts 的纯 dispatch，
 * 测试只喂 probe（指南数据自带）、收效果、和指南声明逐条比对，再把每一条
 * 结果原样落进 .judge/<run>/keymap.json（固定 schema，大量 JSON）。
 * 最终结论由读这个 raw JSON 的人/LLM 下，不由测试措辞下。
 *
 *   bun test tests/tui-keymap.test.ts
 */
import { test, expect, afterAll } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONSOLE_KEYS,
  CONSOLE_RUN_PROBE,
  MENU_KEYS,
  RUN_KEYS,
  consoleState,
  menuState,
  dispatchConsole,
  dispatchMenu,
  dispatchRun,
  glyphOf,
  type KeyBinding,
  type RunEffect,
} from "../app/tui-keymap.ts";

interface JRec {
  table: string;
  scope: string;
  label: string;
  key: string;
  glyph: string;
  expectEffect: string;
  actualEffect: string;
  stateOk: boolean;
  pass: boolean;
}
const records: JRec[] = [];

function checkStateSubset(
  expected: Record<string, unknown> | undefined,
  actual: object,
): boolean {
  if (!expected) return true;
  const a = actual as Record<string, unknown>;
  for (const k of Object.keys(expected)) {
    if (a[k] !== expected[k]) return false;
  }
  return true;
}

function runConsole(b: KeyBinding, table: string) {
  for (const key of b.keys) {
    const { state, effect } = dispatchConsole(
      consoleState(b.probe.state),
      key,
    );
    const stateOk = checkStateSubset(b.probe.expectState, state);
    const pass = effect === b.probe.expectEffect && stateOk;
    records.push({
      table,
      scope: b.scope,
      label: b.label,
      key: JSON.stringify(key),
      glyph: glyphOf(key),
      expectEffect: String(b.probe.expectEffect),
      actualEffect: effect,
      stateOk,
      pass,
    });
    test(`[${table}] ${b.scope} · ${glyphOf(key)} → ${b.label}`, () => {
      expect(effect).toBe(b.probe.expectEffect as any);
      expect(stateOk).toBe(true);
    });
  }
}

// ── 控制台（tui-project.ts）：指南里每一行都跑一遍 ──────────────────────────
for (const b of CONSOLE_KEYS) runConsole(b, "console");
runConsole(CONSOLE_RUN_PROBE, "console"); // 工作流视图下 ↵ = 运行

// ── 旧任务台（tui.ts）菜单 ──────────────────────────────────────────────────
for (const b of MENU_KEYS) {
  for (const key of b.keys) {
    const { state, effect } = dispatchMenu(menuState(b.probe.state), key);
    const stateOk = checkStateSubset(b.probe.expectState, state);
    const pass = effect === b.probe.expectEffect && stateOk;
    records.push({
      table: "menu",
      scope: b.scope,
      label: b.label,
      key: JSON.stringify(key),
      glyph: glyphOf(key),
      expectEffect: String(b.probe.expectEffect),
      actualEffect: effect,
      stateOk,
      pass,
    });
    test(`[menu] ${b.scope} · ${glyphOf(key)} → ${b.label}`, () => {
      expect(effect).toBe(b.probe.expectEffect as any);
      expect(stateOk).toBe(true);
    });
  }
}

// ── 「运行结束后」页脚（两个 TUI 共用语义）──────────────────────────────────
for (const b of RUN_KEYS) {
  for (const key of b.keys) {
    const effect = dispatchRun(key);
    const pass = effect === b.probe.expectEffect;
    records.push({
      table: "run",
      scope: b.scope,
      label: b.label,
      key: JSON.stringify(key),
      glyph: glyphOf(key),
      expectEffect: String(b.probe.expectEffect),
      actualEffect: effect,
      stateOk: true,
      pass,
    });
    test(`[run] ${b.scope} · ${glyphOf(key)} → ${b.label}`, () => {
      expect(effect).toBe(b.probe.expectEffect as RunEffect);
    });
  }
}

// ── 数字直达落点：键 N → idx = N-1（专门断言，补通用 probe 的盲点）─────────
test("[menu] 数字 1-9 落点 = 序号-1，且 effect=enter", () => {
  for (let n = 1; n <= 9; n++) {
    const { state, effect } = dispatchMenu(menuState({ n: 12 }), String(n));
    records.push({
      table: "menu",
      scope: "选择工作流",
      label: `数字直达：键 ${n} → idx ${n - 1}`,
      key: JSON.stringify(String(n)),
      glyph: String(n),
      expectEffect: "enter",
      actualEffect: effect,
      stateOk: state.idx === n - 1,
      pass: effect === "enter" && state.idx === n - 1,
    });
    expect(effect).toBe("enter");
    expect(state.idx).toBe(n - 1);
  }
});

// ── 指南完整性：每行 schema 必须健全（防止写了人看不懂/测不到的行）──────────
test("guide schema: 每条 KeyBinding 都有 keys/glyphs/label/scope/probe", () => {
  for (const b of [...CONSOLE_KEYS, CONSOLE_RUN_PROBE, ...MENU_KEYS, ...RUN_KEYS]) {
    expect(b.keys.length).toBeGreaterThan(0);
    expect(b.glyphs.length).toBeGreaterThan(0);
    expect(b.label.trim().length).toBeGreaterThan(0);
    expect(b.scope.trim().length).toBeGreaterThan(0);
    expect(b.probe).toBeDefined();
    expect(typeof b.probe.expectEffect).toBe("string");
  }
});

// ── 落 raw JSON 证据（固定 schema · 大量记录 · 供 LLM 当裁判读）────────────
afterAll(() => {
  const runId =
    process.env.JUDGE_RUN_ID ||
    new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join(import.meta.dir, "..", ".judge", runId);
  mkdirSync(dir, { recursive: true });
  const total = records.length;
  const passed = records.filter((r) => r.pass).length;
  const payload = {
    harness: "tui-keymap-probe",
    run_id: runId,
    generated_at: new Date().toISOString(),
    summary: {
      total_assertions: total,
      passed,
      failed: total - passed,
      tables: {
        console: records.filter((r) => r.table === "console").length,
        menu: records.filter((r) => r.table === "menu").length,
        run: records.filter((r) => r.table === "run").length,
      },
      guide_rows: {
        console: CONSOLE_KEYS.length + 1,
        menu: MENU_KEYS.length,
        run: RUN_KEYS.length,
      },
    },
    records,
  };
  writeFileSync(
    join(dir, "keymap.json"),
    JSON.stringify(payload, null, 2),
  );
  writeFileSync(
    join(import.meta.dir, "..", ".judge", "latest-run-id.txt"),
    runId,
  );
});
