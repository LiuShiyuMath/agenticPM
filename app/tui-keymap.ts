/**
 * agentic·PM — 键位单一真相源（Single Source of Truth for shortcuts）
 *
 * 这个文件是「使用指南」与「真实行为」之间唯一的桥：
 *   · 终端里的「使用指南」面板由 *这里的数组* 渲染，不手写。
 *   · 真实按键由 *这里的纯函数 dispatch* 路由，TUI 主循环只是宿主。
 *   · 第三方 judge（tests/tui-keymap.test.ts）遍历 *这里每一条 KeyBinding 的
 *     probe*，证明「指南里写的每个键 = 真的能用」。
 *
 * 于是三者不可能漂移：改了行为忘了改指南 → 测试红；指南写了不存在的键 →
 * 测试红。这正是「verify each is adjustable based on how-to-use guide」。
 *
 * 零依赖、零副作用：dispatch 只读入 state + 原始按键串，返回新 state + 效果。
 */

// ── 原始按键常量（终端发来的字节串）────────────────────────────────────────
export const KEY = {
  up: "\x1b[A",
  down: "\x1b[B",
  enter1: "\r",
  enter2: "\n",
  ctrlC: "\x03",
  esc: "\x1b",
} as const;

/** 把原始串转成给指南看的可读符号 */
export function glyphOf(raw: string): string {
  switch (raw) {
    case KEY.up:
      return "↑";
    case KEY.down:
      return "↓";
    case KEY.enter1:
    case KEY.enter2:
      return "↵";
    case KEY.ctrlC:
      return "Ctrl+C";
    case KEY.esc:
      return "Esc";
    case " ":
      return "␣";
    default:
      return raw;
  }
}

// ── 效果类型 ────────────────────────────────────────────────────────────────
export type ConsoleEffect =
  | "none"
  | "quit"
  | "rescan"
  | "runWorkflow"
  | "toDetail"
  | "openHelp"
  | "closeHelp";

export type MenuEffect = "none" | "quit" | "enter" | "openHelp" | "closeHelp";

/** 工作流运行结束后的页脚（tui-project 的 launchWorkflow / 旧 tui 的续接） */
export type RunEffect = "quit" | "back" | "continue";

// ── 控制台（tui-project.ts）状态 ────────────────────────────────────────────
export interface ConsoleState {
  /** 当前视图下标：0组合 1项目 2人 3风险 4工作流 */
  vi: number;
  /** 组合/人/风险 列表光标 */
  sel: number;
  /** 工作流菜单光标 */
  skillSel: number;
  /** 项目数（夹紧用） */
  psLen: number;
  /** 工作流条目数（夹紧用） */
  skillsLen: number;
  /** 使用指南是否覆盖在最上层 */
  help: boolean;
}

export function consoleState(p: Partial<ConsoleState> = {}): ConsoleState {
  return {
    vi: 0,
    sel: 0,
    skillSel: 0,
    psLen: 7,
    skillsLen: 12,
    help: false,
    ...p,
  };
}

// ── 旧任务台（tui.ts）的菜单状态 ────────────────────────────────────────────
export interface MenuState {
  idx: number;
  n: number;
  help: boolean;
}

export function menuState(p: Partial<MenuState> = {}): MenuState {
  return { idx: 0, n: 12, help: false, ...p };
}

// ── 一条键位绑定 = 指南里的一行 + 它的自检 probe ────────────────────────────
export interface KeyBinding {
  /** 指南分组标题 */
  scope: string;
  /** 真实按键串（可有别名，如 ↑ 和 k）*/
  keys: string[];
  /** 给指南看的可读符号（与 keys 同序）*/
  glyphs: string[];
  /** 这个键干什么（中文，给人看）*/
  label: string;
  /**
   * judge probe：放进 dispatch 前的初始 state（部分）+ 期望效果 + 期望 state 子集。
   * 测试会对 keys 里每一个键都跑一遍，全部命中才算「这一行可用」。
   */
  probe: {
    state: Partial<ConsoleState & MenuState>;
    expectEffect: ConsoleEffect | MenuEffect | RunEffect;
    expectState?: Partial<ConsoleState & MenuState>;
  };
}

// ════════════════════════════════════════════════════════════════════════════
//  控制台键位表（tui-project.ts —— `bun run tui`，主产品）
// ════════════════════════════════════════════════════════════════════════════
export const CONSOLE_KEYS: KeyBinding[] = [
  {
    scope: "全局",
    keys: ["?", "h"],
    glyphs: ["?", "h"],
    label: "打开 / 关闭这份使用指南",
    probe: {
      state: { help: false },
      expectEffect: "openHelp",
      expectState: { help: true },
    },
  },
  {
    scope: "全局",
    keys: ["r"],
    glyphs: ["r"],
    label: "重新扫描真实 git 遥测（重算健康分 / 风险）",
    probe: { state: {}, expectEffect: "rescan" },
  },
  {
    scope: "全局",
    keys: [KEY.ctrlC, "q"],
    glyphs: ["Ctrl+C", "q"],
    label: "退出 agentic·PM 控制台",
    probe: { state: {}, expectEffect: "quit" },
  },
  {
    scope: "切视图",
    keys: ["1"],
    glyphs: ["1"],
    label: "组合 —— 全部项目按健康分升序（最差优先）",
    probe: {
      state: { vi: 4 },
      expectEffect: "none",
      expectState: { vi: 0, skillSel: 0 },
    },
  },
  {
    scope: "切视图",
    keys: ["2"],
    glyphs: ["2"],
    label: "项目 —— 选中项目的 git 详情（提交动量 / 最近提交）",
    probe: { state: { vi: 0 }, expectEffect: "none", expectState: { vi: 1 } },
  },
  {
    scope: "切视图",
    keys: ["3"],
    glyphs: ["3"],
    label: "人 —— 跨仓真实作者聚合（巴士因子 / 注意力摊薄）",
    probe: { state: { vi: 0 }, expectEffect: "none", expectState: { vi: 2 } },
  },
  {
    scope: "切视图",
    keys: ["4"],
    glyphs: ["4"],
    label: "风险 —— 全自动风险台账（信号来自真实 git）",
    probe: { state: { vi: 0 }, expectEffect: "none", expectState: { vi: 3 } },
  },
  {
    scope: "切视图",
    keys: ["5"],
    glyphs: ["5"],
    label: "工作流 —— 在选中项目上跑 12 个 PM 工作流之一",
    probe: { state: { vi: 0 }, expectEffect: "none", expectState: { vi: 4 } },
  },
  {
    scope: "导航",
    keys: [KEY.up, "k"],
    glyphs: ["↑", "k"],
    label: "上移光标（工作流视图里是上一个工作流）",
    probe: {
      state: { vi: 0, sel: 3 },
      expectEffect: "none",
      expectState: { sel: 2 },
    },
  },
  {
    scope: "导航",
    keys: [KEY.down, "j"],
    glyphs: ["↓", "j"],
    label: "下移光标（工作流视图里是下一个工作流）",
    probe: {
      state: { vi: 0, sel: 1, psLen: 7 },
      expectEffect: "none",
      expectState: { sel: 2 },
    },
  },
  {
    scope: "导航",
    keys: [KEY.enter1, KEY.enter2],
    glyphs: ["↵", "↵"],
    label: "组合/人/风险 = 看项目详情；工作流 = 在选中项目上运行",
    probe: {
      state: { vi: 0 },
      expectEffect: "toDetail",
      expectState: { vi: 1 },
    },
  },
];

// 工作流视图下 ↵ 的另一面（运行）—— 单独探针，挂同一指南行的语义，独立测。
export const CONSOLE_RUN_PROBE: KeyBinding = {
  scope: "导航",
  keys: [KEY.enter1, KEY.enter2],
  glyphs: ["↵", "↵"],
  label: "工作流视图：在选中项目的真实 cwd 下运行该工作流",
  probe: { state: { vi: 4 }, expectEffect: "runWorkflow" },
};

// ════════════════════════════════════════════════════════════════════════════
//  旧任务台键位表（tui.ts —— `bun run tui:legacy`）
// ════════════════════════════════════════════════════════════════════════════
export const MENU_KEYS: KeyBinding[] = [
  {
    scope: "选择工作流",
    keys: [KEY.up, "k"],
    glyphs: ["↑", "k"],
    label: "上一个工作流（顶部回环到底部）",
    probe: {
      state: { idx: 0, n: 12 },
      expectEffect: "none",
      expectState: { idx: 11 },
    },
  },
  {
    scope: "选择工作流",
    keys: [KEY.down, "j"],
    glyphs: ["↓", "j"],
    label: "下一个工作流（底部回环到顶部）",
    probe: {
      state: { idx: 11, n: 12 },
      expectEffect: "none",
      expectState: { idx: 0 },
    },
  },
  {
    scope: "选择工作流",
    keys: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
    glyphs: ["1", "…", "9"],
    label: "数字直达对应序号的工作流",
    // 每个数字落点不同（idx = N-1），故只在通用 probe 校验效果，
    // 落点正确性由 judge 里专门一条 per-digit 断言覆盖。
    probe: { state: { idx: 0, n: 12 }, expectEffect: "enter" },
  },
  {
    scope: "选择工作流",
    keys: [KEY.enter1, KEY.enter2],
    glyphs: ["↵", "↵"],
    label: "进入高亮的工作流",
    probe: { state: { idx: 3, n: 12 }, expectEffect: "enter" },
  },
  {
    scope: "全局",
    keys: ["?", "h"],
    glyphs: ["?", "h"],
    label: "打开 / 关闭使用指南",
    probe: {
      state: { help: false },
      expectEffect: "openHelp",
      expectState: { help: true },
    },
  },
  {
    scope: "全局",
    keys: [KEY.ctrlC, "q"],
    glyphs: ["Ctrl+C", "q"],
    label: "退出",
    probe: { state: {}, expectEffect: "quit" },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  「工作流运行结束」页脚键位表（tui-project 与旧 tui 共用同一语义）
// ════════════════════════════════════════════════════════════════════════════
export const RUN_KEYS: KeyBinding[] = [
  {
    scope: "运行结束后",
    keys: [KEY.enter1, KEY.enter2],
    glyphs: ["↵", "↵"],
    label: "在同一工作流里继续追问（会话续接）",
    probe: { state: {}, expectEffect: "continue" },
  },
  {
    scope: "运行结束后",
    keys: ["n"],
    glyphs: ["n"],
    label: "返回控制台 / 换一个工作流",
    probe: { state: {}, expectEffect: "back" },
  },
  {
    scope: "运行结束后",
    keys: [KEY.ctrlC, "q"],
    glyphs: ["Ctrl+C", "q"],
    label: "直接退出程序",
    probe: { state: {}, expectEffect: "quit" },
  },
];

// ── 纯 dispatch：控制台（与旧 tui-project 主循环 1:1，仅新增 ?/h 与 j/k）────
export function dispatchConsole(
  s: ConsoleState,
  key: string,
): { state: ConsoleState; effect: ConsoleEffect } {
  const st = { ...s };

  // 指南覆盖层优先：任意键关闭，q / Ctrl+C 仍直接退出。
  if (st.help) {
    if (key === "q" || key === KEY.ctrlC) return { state: st, effect: "quit" };
    st.help = false;
    return { state: st, effect: "closeHelp" };
  }

  if (key === "q" || key === KEY.ctrlC) return { state: st, effect: "quit" };
  if (key === "?" || key === "h") {
    st.help = true;
    return { state: st, effect: "openHelp" };
  }
  if (key >= "1" && key <= "5") {
    st.vi = Number(key) - 1;
    if (st.vi !== 4) st.skillSel = 0;
    return { state: st, effect: "none" };
  }
  if (key === "r") return { state: st, effect: "rescan" };

  const inWorkflow = st.vi === 4;
  if (key === KEY.up || key === "k") {
    if (inWorkflow) st.skillSel = Math.max(0, st.skillSel - 1);
    else st.sel = Math.max(0, st.sel - 1);
    return { state: st, effect: "none" };
  }
  if (key === KEY.down || key === "j") {
    if (inWorkflow)
      st.skillSel = Math.min(Math.max(0, st.skillsLen - 1), st.skillSel + 1);
    else st.sel = st.sel + 1;
    return { state: st, effect: "none" };
  }
  if (key === KEY.enter1 || key === KEY.enter2) {
    if (inWorkflow) return { state: st, effect: "runWorkflow" };
    st.vi = 1;
    return { state: st, effect: "toDetail" };
  }
  return { state: st, effect: "none" };
}

// ── 纯 dispatch：旧任务台菜单（与旧 tui.ts pickSkill 1:1，新增 ?/h）─────────
export function dispatchMenu(
  s: MenuState,
  key: string,
): { state: MenuState; effect: MenuEffect } {
  const st = { ...s };

  if (st.help) {
    if (key === "q" || key === KEY.ctrlC) return { state: st, effect: "quit" };
    st.help = false;
    return { state: st, effect: "closeHelp" };
  }

  if (key === "q" || key === KEY.ctrlC) return { state: st, effect: "quit" };
  if (key === "?" || key === "h") {
    st.help = true;
    return { state: st, effect: "openHelp" };
  }
  if (key === KEY.enter1 || key === KEY.enter2)
    return { state: st, effect: "enter" };
  if (key === KEY.up || key === "k") {
    st.idx = (st.idx + st.n - 1) % st.n;
    return { state: st, effect: "none" };
  }
  if (key === KEY.down || key === "j") {
    st.idx = (st.idx + 1) % st.n;
    return { state: st, effect: "none" };
  }
  if (/^[1-9]$/.test(key)) {
    const nIdx = Number(key) - 1;
    if (nIdx < st.n) {
      st.idx = nIdx;
      return { state: st, effect: "enter" };
    }
  }
  return { state: st, effect: "none" };
}

// ── 纯 dispatch：运行结束页脚（q/Ctrl+C 退出，n 返回，其它续接）────────────
export function dispatchRun(key: string): RunEffect {
  if (key === "q" || key === KEY.ctrlC) return "quit";
  if (key === "n") return "back";
  return "continue";
}
