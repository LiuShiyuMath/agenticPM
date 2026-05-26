import { Hono } from "hono";
import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { SKILLS, getSkill } from "./app/skills.ts";
import {
  scanPortfolio,
  roster,
  recentLog,
  defaultBase,
} from "./app/portfolio.ts";
import { homedir } from "node:os";
import { join } from "node:path";

import home from "./app/index.html";
import portfolioPage from "./app/portfolio.html";
import writeSpec from "./app/write-spec.html";
import roadmapUpdate from "./app/roadmap-update.html";
import stakeholderUpdate from "./app/stakeholder-update.html";
import synthesizeResearch from "./app/synthesize-research.html";
import competitiveBrief from "./app/competitive-brief.html";
import metricsReview from "./app/metrics-review.html";
import productBrainstorming from "./app/product-brainstorming.html";
import sprintPlanning from "./app/sprint-planning.html";
// 项目级 / project
import projectCharter from "./app/project-charter.html";
import projectHealth from "./app/project-health.html";
import projectRaid from "./app/project-raid.html";
import projectRetro from "./app/project-retro.html";

const PLUGIN_PATH = join(
  homedir(),
  ".claude",
  "plugins",
  "marketplaces",
  "knowledge-work-plugins",
  "product-management",
);

// ── MiniMax-ONLY enforcement ────────────────────────────────────────────────
// This deployment is hard-pinned to MiniMax via the Anthropic-compatible
// endpoint. The previous `isClaudeModel` escape hatch (strip MiniMax env →
// fall back to Claude Code OAuth/Sonnet) is deliberately removed: the agent
// can NEVER silently run on Claude. Any non-MiniMax model request is coerced
// to MINIMAX_MODEL, and the MiniMax routing env is always passed through.
const MINIMAX_MODEL = process.env.ANTHROPIC_MODEL?.startsWith("MiniMax")
  ? process.env.ANTHROPIC_MODEL
  : "MiniMax-M2.7-highspeed";

function assertMiniMaxEnv(): void {
  const base = process.env.ANTHROPIC_BASE_URL ?? "";
  const key = process.env.ANTHROPIC_API_KEY ?? "";
  if (!/minimax/i.test(base) || !key) {
    throw new Error(
      "[MiniMax-only] ANTHROPIC_BASE_URL must point to the MiniMax " +
        "Anthropic-compatible endpoint and ANTHROPIC_API_KEY must be set. " +
        `Got base=${base || "(unset)"} key=${key ? "(set)" : "(unset)"}. ` +
        "Fix .env — Claude OAuth fallback is disabled by design.",
    );
  }
}
assertMiniMaxEnv();

const sessions = new Map<string, string>();

const api = new Hono();

api.get("/api/skills", (c) => c.json(SKILLS));

api.get("/api/health", (c) =>
  c.json({
    ok: true,
    pluginPath: PLUGIN_PATH,
    hasApiKey: Boolean(process.env.ANTHROPIC_API_KEY),
    minimaxOnly: true,
    endpoint: process.env.ANTHROPIC_BASE_URL ?? null,
    model: MINIMAX_MODEL,
    skills: SKILLS.map((s) => s.id),
  }),
);

// ── 真实 git 组合遥测（与融合 TUI 同一引擎 app/portfolio.ts，零 mock）──────
// 轻量缓存：git 扫描有成本，15s 内复用，避免刷新页面就重扫一遍。
const portfolioCache = new Map<string, { at: number; data: unknown }>();
api.get("/api/portfolio", (c) => {
  const all = c.req.query("all") === "1";
  const base = c.req.query("base") || defaultBase();
  const key = `${base}|${all}`;
  const hit = portfolioCache.get(key);
  if (hit && Date.now() - hit.at < 15_000) return c.json(hit.data);
  const scanned = scanPortfolio(base, all);
  const projects = scanned.map((p) => ({
    ...p,
    recent: p.isGit ? recentLog(p.path, 6) : [],
  }));
  const data = { base, all, projects, roster: roster(scanned) };
  portfolioCache.set(key, { at: Date.now(), data });
  return c.json(data);
});

interface AgentReq {
  skill: string;
  prompt: string;
  threadId?: string;
}

api.post("/api/agent", async (c) => {
  let body: AgentReq;
  try {
    body = await c.req.json<AgentReq>();
  } catch {
    return c.json({ error: "invalid json body" }, 400);
  }

  const skill = getSkill(body.skill);
  if (!skill) return c.json({ error: `unknown skill: ${body.skill}` }, 400);
  if (!body.prompt?.trim()) return c.json({ error: "prompt is required" }, 400);

  // ANTHROPIC_API_KEY is no longer strictly required — when absent the spawned
  // `claude` CLI subprocess falls back to the user's Claude Code OAuth.

  const threadId = body.threadId ?? crypto.randomUUID();
  const resumeId = sessions.get(threadId);

  // MiniMax-ONLY: accept an override only if it is itself a MiniMax model;
  // any claude-* / empty request is coerced to MINIMAX_MODEL. The MiniMax
  // routing env (key + base_url + default-model aliases) is passed through
  // untouched so the subprocess always talks to api.minimaxi.com.
  const url = new URL(c.req.url);
  const requested = c.req.header("x-model") ?? url.searchParams.get("model") ?? "";
  const model = requested.startsWith("MiniMax") ? requested : MINIMAX_MODEL;

  const childEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) childEnv[k] = v;
  }
  // Hard-pin the model alias env too, so the SDK preset cannot resolve a
  // claude-* default behind our back.
  childEnv.ANTHROPIC_MODEL = model;
  childEnv.ANTHROPIC_DEFAULT_HAIKU_MODEL = model;
  childEnv.ANTHROPIC_DEFAULT_SONNET_MODEL = model;
  childEnv.ANTHROPIC_DEFAULT_OPUS_MODEL = model;

  const options: Options = {
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
      append: `${skill.systemPrompt}\n\n沟通语言：简体中文。除非用户明确要求英文输出，否则全程使用中文，且保持专业 PM 用语。`,
    },
    allowedTools: ["Read", "Write", "Glob", "Grep", "WebSearch", "WebFetch"],
    permissionMode: "acceptEdits",
    plugins: [{ type: "local", path: PLUGIN_PATH }],
    settingSources: ["project"],
    cwd: import.meta.dir,
    maxTurns: 12,
    env: childEnv,
    model,
    ...(resumeId ? { resume: resumeId } : {}),
  };

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          closed = true;
        }
      };
      // Keepalive: every 3s emit an SSE comment line so the TCP/HTTP idle
      // timeout doesn't kill the connection during the SDK's hook preroll
      // (which can be 15-20s of silence before `system/init`).
      const keepalive = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: keepalive\n\n`));
        } catch {
          closed = true;
        }
      }, 3_000);

      try {
        send("open", { threadId, skill: skill.id, model });

        const q = query({ prompt: body.prompt, options });

        for await (const msg of q) {
          // Forward hook lifecycle as status events so the UI can show
          // "插件初始化中…" instead of dead air during preroll.
          if (msg.type === "system" && msg.subtype !== "init") {
            send("status", {
              subtype: (msg as { subtype: string }).subtype,
            });
            continue;
          }
          if (msg.type === "system" && msg.subtype === "init") {
            sessions.set(threadId, msg.session_id);
            send("init", {
              model: msg.model,
              tools: msg.tools,
              plugins: msg.plugins,
              session_id: msg.session_id,
            });
            continue;
          }

          if (msg.type === "assistant") {
            if (msg.error) {
              send("error", { message: `assistant: ${msg.error}` });
              continue;
            }
            for (const block of msg.message.content) {
              if (block.type === "text") {
                send("text", { text: block.text });
              } else if (block.type === "tool_use") {
                send("tool_use", { name: block.name, input: block.input });
              }
            }
            continue;
          }

          if (msg.type === "user") {
            const content = msg.message.content;
            if (Array.isArray(content)) {
              for (const block of content) {
                if (block.type === "tool_result") {
                  const text = Array.isArray(block.content)
                    ? block.content
                        .map((c: { type: string; text?: string }) =>
                          c.type === "text" ? c.text : "",
                        )
                        .join("")
                    : typeof block.content === "string"
                      ? block.content
                      : "";
                  send("tool_result", { text: text.slice(0, 600) });
                }
              }
            }
            continue;
          }

          if (msg.type === "result") {
            send("result", {
              subtype: msg.subtype,
              duration_ms: msg.duration_ms,
              num_turns: msg.num_turns,
              total_cost_usd: msg.total_cost_usd,
              ...(msg.subtype === "success" ? { text: msg.result } : {}),
            });
            send("done", { threadId });
            controller.close();
            return;
          }
        }

        send("done", { threadId });
        clearInterval(keepalive);
        closed = true;
        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        send("error", { message });
        clearInterval(keepalive);
        closed = true;
        try { controller.close(); } catch {}
      }
    },
    cancel() {
      // Client disconnected — stop keepalive.
      // (keepalive variable is in closure; clearInterval is idempotent.)
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
      "x-accel-buffering": "no",
    },
  });
});

const port = Number(process.env.PORT) || 4123;
const isDev = process.env.NODE_ENV !== "production" && !process.env.PLAYWRIGHT_TEST;

const server = Bun.serve({
  port,
  // Bun's default per-response idleTimeout is ~10s; raise to 5 min so the SSE
  // stream can survive long hook preroll and multi-minute agent runs.
  idleTimeout: 255,
  routes: {
    "/": home,
    "/portfolio": portfolioPage,
    "/write-spec": writeSpec,
    "/roadmap-update": roadmapUpdate,
    "/stakeholder-update": stakeholderUpdate,
    "/synthesize-research": synthesizeResearch,
    "/competitive-brief": competitiveBrief,
    "/metrics-review": metricsReview,
    "/product-brainstorming": productBrainstorming,
    "/sprint-planning": sprintPlanning,
    "/project-charter": projectCharter,
    "/project-health": projectHealth,
    "/project-raid": projectRaid,
    "/project-retro": projectRetro,
  },
  fetch: (req) => api.fetch(req),
  development: isDev ? { hmr: true, console: true } : false,
  error: (err) => {
    console.error(err);
    return new Response("internal error", { status: 500 });
  },
});

console.log(`▌ agenticPM running → http://localhost:${server.port}`);
console.log(`▌ plugin → ${PLUGIN_PATH}`);
console.log(`▌ mode → MiniMax-ONLY (Claude OAuth fallback disabled)`);
console.log(`▌ endpoint → ${process.env.ANTHROPIC_BASE_URL}`);
console.log(`▌ model → ${MINIMAX_MODEL} (forced)`);
console.log(
  `▌ auth → ${process.env.ANTHROPIC_API_KEY ? "ANTHROPIC_API_KEY loaded" : "MISSING — set in .env"}`,
);
