/**
 * agentic·PM — 共享 Agent SDK 运行层（终端流式渲染）
 *
 * 「融合」的第二根 DRY 骨干：把原本写死在 tui.ts 里的 MiniMax-ONLY 选项构造
 * 与终端流式渲染抽出来。现在三处共用同一条 Agent 路径：
 *   · tui.ts            —— 旧的纯任务级技能跑批（保持可用）
 *   · tui-project.ts    —— 融合后的项目中心控制台（在选中项目上跑工作流）
 *
 * cwd 可注入是融合的关键：控制台把它设成「被选中项目的真实路径」，
 * Agent 于是直接读到那个项目的真实文件，而非 agenticPM 自身。
 */
import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import type { SkillMeta } from "./skills.ts";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

const PLUGIN_PATH = join(
  homedir(),
  ".claude",
  "plugins",
  "marketplaces",
  "knowledge-work-plugins",
  "product-management",
);

/** agenticPM 项目根（app/ 的父目录），作为 Agent 默认 cwd */
export const PROJECT_ROOT = dirname(import.meta.dir);

const LANG_SUFFIX =
  "\n\n沟通语言：简体中文。除非用户明确要求英文输出，否则全程使用中文，且保持专业 PM 用语。";

/**
 * MiniMax-ONLY：硬钉模型，绝不剥离 MiniMax 路由 env，绝不回落 Claude OAuth
 * （与 server.ts / 旧 tui.ts 完全一致的口径）。
 */
export function buildAgentOptions(
  skill: SkillMeta,
  opts: { resumeId?: string; cwd?: string } = {},
): Options {
  const model = process.env.ANTHROPIC_MODEL?.startsWith("MiniMax")
    ? process.env.ANTHROPIC_MODEL
    : "MiniMax-M2.7-highspeed";
  const childEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) childEnv[k] = v;
  }
  childEnv.ANTHROPIC_MODEL = model;
  childEnv.ANTHROPIC_DEFAULT_HAIKU_MODEL = model;
  childEnv.ANTHROPIC_DEFAULT_SONNET_MODEL = model;
  childEnv.ANTHROPIC_DEFAULT_OPUS_MODEL = model;
  return {
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
      append: `${skill.systemPrompt}${LANG_SUFFIX}`,
    },
    allowedTools: ["Read", "Write", "Glob", "Grep", "WebSearch", "WebFetch"],
    permissionMode: "acceptEdits",
    plugins: [{ type: "local", path: PLUGIN_PATH }],
    settingSources: ["project"],
    cwd: opts.cwd ?? PROJECT_ROOT,
    maxTurns: 12,
    env: childEnv,
    model,
    ...(opts.resumeId ? { resume: opts.resumeId } : {}),
  };
}

/** 渲染宿主注入：写函数 + 发丝线 + 一小撮调色（兼容两套面板）。 */
export interface AgentSink {
  w: (s: string) => void;
  line: () => string;
  c: {
    accent: string;
    bold: string;
    ital: string;
    reset: string;
    faint: string;
    ok: string;
  };
}

const SPIN = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const STATUS_ZH: Record<string, string> = {
  hook_preroll: "插件初始化中",
  hook_postroll: "收尾中",
  compact_boundary: "压缩上下文",
};
const E = "\x1b[";

/**
 * 一次 Agent 调用，终端流式渲染。返回新的（或续接的）session id。
 * 逻辑忠实搬自旧 tui.ts 的 runAgent，仅把 write/调色参数化以便两套面板复用。
 */
export async function runAgentTUI(
  skill: SkillMeta,
  prompt: string,
  resumeId: string | undefined,
  sink: AgentSink,
  cwd?: string,
): Promise<string | undefined> {
  const { w, line, c } = sink;
  const options = buildAgentOptions(skill, { resumeId, cwd });
  let spinT: ReturnType<typeof setInterval> | null = null;
  let spinI = 0;
  let phase = "连接 Agent";
  let streaming = false;

  const startSpin = () => {
    if (spinT) return;
    spinT = setInterval(() => {
      w(
        `\r${E}2K  ${c.accent}${SPIN[spinI++ % SPIN.length]}${c.reset} ${c.faint}${phase}…${c.reset}`,
      );
    }, 90);
  };
  const stopSpin = () => {
    if (spinT) clearInterval(spinT);
    spinT = null;
    w(`\r${E}2K`);
  };

  w(
    `\n${c.accent}▌${c.reset} ${c.bold}${skill.title}${c.reset} ${c.faint}${skill.subtitle}${resumeId ? " · 续接会话" : ""}${c.reset}\n`,
  );
  w(line() + "\n\n");
  startSpin();

  let newSession: string | undefined;

  try {
    const q = query({ prompt, options });
    for await (const msg of q) {
      if (msg.type === "system" && msg.subtype !== "init") {
        phase =
          STATUS_ZH[(msg as { subtype: string }).subtype] ??
          (msg as { subtype: string }).subtype;
        continue;
      }
      if (msg.type === "system" && msg.subtype === "init") {
        newSession = msg.session_id;
        stopSpin();
        w(
          `${c.faint}  ⟢ 模型 ${c.reset}${(msg as any).model}${c.faint}  ·  工具 ${(msg as any).tools?.length ?? 0}  ·  会话 ${String(msg.session_id).slice(0, 8)}${c.reset}\n\n`,
        );
        phase = "思考中";
        startSpin();
        continue;
      }
      if (msg.type === "assistant") {
        if ((msg as any).error) {
          stopSpin();
          w(`\n${c.accent}✗ 助手错误：${(msg as any).error}${c.reset}\n`);
          continue;
        }
        for (const block of msg.message.content) {
          if (block.type === "text") {
            if (!streaming) {
              stopSpin();
              streaming = true;
            }
            w(block.text);
          } else if (block.type === "tool_use") {
            if (streaming) {
              w("\n");
              streaming = false;
            }
            stopSpin();
            const input = JSON.stringify((block as any).input ?? {});
            w(
              `${c.faint}  ⚙ 工具 ${c.reset}${c.accent}${(block as any).name}${c.reset}${c.faint}(${input.slice(0, 70)}${input.length > 70 ? "…" : ""})${c.reset}\n`,
            );
            phase = "执行工具";
            startSpin();
          }
        }
        continue;
      }
      if (msg.type === "user") {
        const content = (msg as any).message.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "tool_result") {
              const text = Array.isArray(block.content)
                ? block.content
                    .map((x: { type: string; text?: string }) =>
                      x.type === "text" ? x.text : "",
                    )
                    .join("")
                : typeof block.content === "string"
                  ? block.content
                  : "";
              const oneLine = text.replace(/\s+/g, " ").trim().slice(0, 100);
              if (oneLine)
                w(
                  `${c.faint}  ⟵ ${oneLine}${oneLine.length >= 100 ? "…" : ""}${c.reset}\n`,
                );
            }
          }
        }
        continue;
      }
      if (msg.type === "result") {
        if (streaming) w("\n");
        stopSpin();
        const ok = msg.subtype === "success";
        const secs = (((msg as any).duration_ms ?? 0) / 1000).toFixed(1);
        const cost = (msg as any).total_cost_usd;
        w(
          "\n" +
            line() +
            "\n" +
            `${ok ? c.ok + "✓ 完成" : c.accent + "✗ " + msg.subtype}${c.reset}` +
            `${c.faint}   ·   ${secs}s   ·   ${(msg as any).num_turns} 轮${cost != null ? `   ·   $${Number(cost).toFixed(4)}` : ""}${c.reset}\n`,
        );
        break;
      }
    }
  } catch (err) {
    stopSpin();
    w(
      `\n${c.accent}✗ 运行出错：${err instanceof Error ? err.message : String(err)}${c.reset}\n`,
    );
  } finally {
    stopSpin();
  }
  return newSession ?? resumeId;
}
