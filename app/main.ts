import { marked } from "marked";
import { SKILLS, getSkill, getLevel, skillsByLevel, type SkillMeta } from "./skills.ts";

marked.setOptions({ gfm: true, breaks: true });

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Partial<Record<string, string>> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === "class") node.className = v;
    else if (k.startsWith("on") && typeof v === "function") {
      (node as unknown as Record<string, unknown>)[k] = v;
    } else node.setAttribute(k, v);
  }
  for (const c of children) {
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

function renderMasthead(active: "home" | "portfolio" | SkillMeta["id"]) {
  const root = document.querySelector<HTMLElement>("[data-masthead]");
  if (!root) return;
  root.innerHTML = "";
  const brand = el("a", { href: "/", class: "brand" });
  brand.innerHTML = `agentic<span class="accent">·</span>PM`;
  const sub = el("span", { class: "brand-sub" }, "中国产品经理工作台 · powered by Claude Agent SDK");
  const left = el("div", {}, brand, sub);
  const nav = el(
    "nav",
    { class: "nav" },
    el("a", { href: "/", class: active === "home" ? "is-active" : "" }, "首页"),
    el(
      "a",
      { href: "/portfolio", class: active === "portfolio" ? "is-active" : "" },
      "项目中心",
    ),
    el("a", { href: "https://docs.claude.com/en/agent-sdk/overview", target: "_blank" }, "SDK 文档"),
    el(
      "a",
      {
        href: "https://github.com/anthropics/knowledge-work-plugins/tree/main/product-management",
        target: "_blank",
      },
      "插件源",
    ),
  );
  root.appendChild(left);
  root.appendChild(nav);
}

function renderHome() {
  renderMasthead("home");

  const heroRoot = document.querySelector<HTMLElement>("[data-hero]");
  if (heroRoot) {
    heroRoot.innerHTML = "";
    const left = el("div");
    left.appendChild(el("div", { class: "eyebrow" }, "Claude Agent SDK · 产品管理插件"));
    const h1 = el("h1");
    h1.innerHTML = `让一位资深 <em>PM</em> 永远在线<br/>陪你把想法落成产品。`;
    left.appendChild(h1);
    const right = el("div");
    right.appendChild(
      el(
        "p",
        {},
        "从单个任务到整个项目——十二个工作流分成任务 / 项目两层视图，帮你追踪每个项目的状态、盘点组织里的人，接入官方 product-management 插件，全部本地运行、流式响应、中文产出。",
      ),
    );
    right.appendChild(
      el(
        "div",
        { class: "meta" },
        `${SKILLS.length} 个工作流  ·  任务 / 项目 两层视图  ·  本地 :4123`,
      ),
    );
    heroRoot.appendChild(left);
    heroRoot.appendChild(right);
  }

  const levelsRoot = document.querySelector<HTMLElement>("[data-levels]");
  if (levelsRoot) {
    levelsRoot.innerHTML = "";

    // 融合入口：真实 git 组合控制台。不是 .skill-card，所以不影响卡片计数。
    const cta = el("a", { href: "/portfolio", class: "pf-cta" });
    cta.appendChild(el("span", { class: "pf-cta-kicker" }, "新 · 融合"));
    cta.appendChild(
      el(
        "span",
        { class: "pf-cta-title" },
        "项目中心 — 真实 git 组合，一键在某个项目上跑工作流",
      ),
    );
    cta.appendChild(
      el(
        "span",
        { class: "pf-cta-sub" },
        "健康分 / 动量 / 风险 / 花名册全部由 git 实时算出（零 mock）；选中一个项目，下面 12 个工作流就带着它的真实上下文跑。",
      ),
    );
    cta.appendChild(el("span", { class: "pf-cta-arrow" }, "进入控制台 →"));
    levelsRoot.appendChild(cta);

    for (const { level, skills } of skillsByLevel()) {
      const head = el("div", { class: "grid-head", "data-level": level.id });
      head.appendChild(el("h2", {}, `${level.label} · ${level.sub}`));
      head.appendChild(
        el("span", { class: "label" }, `${skills.length} 个视图 · ${level.blurb}`),
      );
      levelsRoot.appendChild(head);

      const grid = el("section", { class: "skill-grid", "data-grid": level.id });
      for (const skill of skills) {
        const card = el("a", { href: `/${skill.id}`, class: "skill-card" });
        card.appendChild(el("div", { class: "glyph" }, skill.glyph));
        card.appendChild(el("div", { class: "title" }, skill.title));
        card.appendChild(el("div", { class: "sub" }, skill.subtitle));
        card.appendChild(el("div", { class: "blurb" }, skill.blurb));
        card.appendChild(el("div", { class: "arrow" }, "→"));
        grid.appendChild(card);
      }
      levelsRoot.appendChild(grid);
    }
  }
}

interface PageState {
  threadId: string | null;
  busy: boolean;
}

function renderSkillPage(skill: SkillMeta) {
  renderMasthead(skill.id);

  const sideRoot = document.querySelector<HTMLElement>("[data-side]");
  if (sideRoot) {
    sideRoot.innerHTML = "";
    const lvl = getLevel(skill.level);
    if (lvl) {
      const tag = el("a", {
        href: "/",
        class: "level-tag",
        "data-level": lvl.id,
      });
      tag.textContent = `${lvl.label} · ${lvl.sub}`;
      sideRoot.appendChild(tag);
    }
    sideRoot.appendChild(el("div", { class: "sub" }, skill.subtitle));
    sideRoot.appendChild(el("h1", {}, skill.title));
    sideRoot.appendChild(el("div", { class: "blurb" }, skill.blurb));
    sideRoot.appendChild(el("div", { class: "examples-label" }, "试试这些场景"));
    for (const ex of skill.examples) {
      const btn = el("button", { class: "example", type: "button", "data-example": ex }, ex);
      sideRoot.appendChild(btn);
    }
  }

  const workRoot = document.querySelector<HTMLElement>("[data-work]");
  if (!workRoot) return;
  workRoot.innerHTML = "";

  const composer = el("div", { class: "composer" });
  composer.appendChild(el("label", { for: "prompt" }, skill.inputLabel));
  const ta = el("textarea", {
    id: "prompt",
    placeholder: skill.inputPlaceholder,
    rows: "5",
  }) as HTMLTextAreaElement;
  composer.appendChild(ta);
  const foot = el("div", { class: "composer-foot" });
  foot.appendChild(el("span", { class: "hint" }, "⌘ + Enter 发送 · ESC 清空"));
  const btn = el("button", { class: "btn", type: "button", "data-send": "" }) as HTMLButtonElement;
  btn.innerHTML = `生成 <span class="arrow">→</span>`;
  foot.appendChild(btn);
  composer.appendChild(foot);
  workRoot.appendChild(composer);

  // 融合落点：从「项目中心」带着某项目过来时，把它的真实 git 上下文注入 composer。
  const projParam = new URLSearchParams(location.search).get("project");
  if (projParam) {
    let ctx = "";
    try {
      ctx = sessionStorage.getItem(`agpm:proj:${projParam}`) ?? "";
    } catch {}
    if (ctx) {
      const note = el(
        "div",
        { class: "pf-injected" },
        `已注入「${projParam}」的真实 git 上下文 — 直接补一句你的诉求即可（留空也能跑）`,
      );
      composer.insertBefore(note, composer.firstChild);
      ta.value = `${ctx}\n\n`;
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      });
    }
  }

  const transcript = el("div", { class: "transcript", "data-transcript": "" });
  const empty = el("div", { class: "empty-state" }, "等待输入 ·  ASYNC STREAMING ENABLED");
  transcript.appendChild(empty);
  workRoot.appendChild(transcript);

  const state: PageState = { threadId: null, busy: false };

  document.querySelectorAll<HTMLButtonElement>("[data-example]").forEach((btn) => {
    btn.addEventListener("click", () => {
      ta.value = btn.dataset.example ?? "";
      ta.focus();
    });
  });

  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      send();
    } else if (e.key === "Escape") {
      ta.value = "";
    }
  });

  btn.addEventListener("click", () => {
    void send();
  });

  async function send() {
    const prompt = ta.value.trim();
    if (!prompt || state.busy) return;
    state.busy = true;
    btn.disabled = true;
    btn.innerHTML = `生成中 <span class="arrow">…</span>`;

    if (transcript.querySelector(".empty-state")) transcript.innerHTML = "";

    const userBubble = renderBubble(transcript, "user", "你");
    userBubble.body.textContent = prompt;
    ta.value = "";

    const aiBubble = renderBubble(transcript, "assistant", skill.title);
    const thinking = el("div", { class: "thinking" });
    thinking.innerHTML = `STREAMING <span class="dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span>`;
    aiBubble.body.appendChild(thinking);

    let textBuf = "";
    let textNode: HTMLElement | null = null;
    const tools: HTMLElement[] = [];

    const finish = (meta?: Record<string, unknown>) => {
      thinking.remove();
      state.busy = false;
      btn.disabled = false;
      btn.innerHTML = `生成 <span class="arrow">→</span>`;
      if (meta) {
        const m = el("div", { class: "result-meta" });
        const entries: string[] = [];
        if (typeof meta.duration_ms === "number")
          entries.push(`耗时 <strong>${(meta.duration_ms / 1000).toFixed(1)}s</strong>`);
        if (typeof meta.num_turns === "number")
          entries.push(`轮次 <strong>${meta.num_turns}</strong>`);
        if (typeof meta.total_cost_usd === "number")
          entries.push(`花费 <strong>$${meta.total_cost_usd.toFixed(4)}</strong>`);
        m.innerHTML = entries.join(" · ");
        aiBubble.body.appendChild(m);
      }
    };

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ skill: skill.id, prompt, threadId: state.threadId }),
      });

      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => "");
        renderError(aiBubble.body, txt || `HTTP ${res.status}`);
        finish();
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const events = buf.split("\n\n");
        buf = events.pop() ?? "";

        for (const chunk of events) {
          if (!chunk.trim()) continue;
          const lines = chunk.split("\n");
          let event = "message";
          const dataLines: string[] = [];
          for (const line of lines) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
          }
          if (!dataLines.length) continue;
          let payload: unknown;
          try {
            payload = JSON.parse(dataLines.join("\n"));
          } catch {
            continue;
          }

          if (event === "open") {
            const p = payload as { threadId: string; model?: string | null };
            state.threadId = p.threadId;
            if (p.model) {
              thinking.querySelector(".dots")?.insertAdjacentHTML(
                "afterend",
                ` · <span style="color:var(--ink-mute)">${escapeHtml(p.model)}</span>`,
              );
            }
          } else if (event === "status") {
            const p = payload as { subtype: string };
            // Surface hook lifecycle as a single status line so users see
            // forward progress during preroll instead of a frozen UI.
            const label = p.subtype.startsWith("hook_") ? "插件预热中" : p.subtype;
            thinking.querySelector(".status-line")?.remove();
            const line = el("span", {
              class: "status-line",
              style: "color:var(--ink-mute);font-size:0.85em;margin-left:.5em;",
            }, `· ${label}`);
            thinking.appendChild(line);
          } else if (event === "init") {
            const p = payload as { model: string };
            thinking.querySelector(".status-line")?.remove();
            thinking.querySelector(".dots")?.insertAdjacentHTML(
              "afterend",
              ` · <span style="color:var(--ink-mute)">${escapeHtml(p.model ?? "")}</span>`,
            );
          } else if (event === "text") {
            const p = payload as { text: string };
            textBuf += p.text;
            if (!textNode) {
              textNode = el("div");
              aiBubble.body.insertBefore(textNode, thinking);
            }
            textNode.innerHTML = await marked.parse(textBuf);
          } else if (event === "tool_use") {
            const p = payload as { name: string };
            const chip = el("span", { class: "tool-chip" }, p.name);
            if (!tools.length) {
              const wrap = el("div", { class: "tools-wrap" });
              aiBubble.body.insertBefore(wrap, thinking);
            }
            const wrap = aiBubble.body.querySelector(".tools-wrap");
            wrap?.appendChild(chip);
            tools.push(chip);
          } else if (event === "result") {
            const p = payload as {
              subtype: string;
              text?: string;
              duration_ms?: number;
              num_turns?: number;
              total_cost_usd?: number;
            };
            if (p.subtype !== "success") {
              renderError(aiBubble.body, `agent finished with ${p.subtype}`);
            } else if (p.text && !textNode) {
              textNode = el("div");
              aiBubble.body.insertBefore(textNode, thinking);
              textNode.innerHTML = await marked.parse(p.text);
            }
            finish(p);
          } else if (event === "error") {
            const p = payload as { message: string };
            renderError(aiBubble.body, p.message);
            finish();
          } else if (event === "done") {
            // ensure cleanup
          }
        }
      }
      finish();
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      // Bare `TypeError: network error` / `ERR_INCOMPLETE_CHUNKED_ENCODING`
      // surfaces when the SSE stream is killed mid-flight (idle timeout,
      // server crash). Give the user something actionable instead of the
      // raw fetch exception text.
      const friendly = /network error|Failed to fetch|INCOMPLETE_CHUNKED/i.test(raw)
        ? `连接被中断（agent 流提前结束）— 检查服务端 stderr / hooks / idleTimeout · 原文: ${raw}`
        : raw;
      renderError(aiBubble.body, friendly);
      finish();
    }
  }
}

function renderBubble(parent: HTMLElement, role: "user" | "assistant", label: string) {
  const wrap = el("div", { class: `bubble ${role}` });
  wrap.appendChild(el("div", { class: "role" }, label));
  const body = el("div", { class: "body" });
  wrap.appendChild(body);
  parent.appendChild(wrap);
  wrap.scrollIntoView({ behavior: "smooth", block: "end" });
  return { wrap, body };
}

function renderError(parent: HTMLElement, message: string) {
  const banner = el("div", { class: "error-banner" }, `× ${message}`);
  parent.appendChild(banner);
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

// ---------- Portfolio console (融合：真实 git 组合 + 在项目上跑工作流) ----------

interface PfProj {
  name: string;
  path: string;
  isGit: boolean;
  branch: string;
  dirty: number;
  author: string;
  lastRel: string;
  total: number;
  weeks: number[];
  hasOrigin: boolean;
  blurb: string;
  files: number;
  score: number;
  rag: "G" | "A" | "R";
  risks: { sev: "HIGH" | "MED" | "OK"; msg: string }[];
  recent: string[];
}
interface PfRoster {
  name: string;
  commits: number;
  repos: string[];
}
interface PfData {
  base: string;
  projects: PfProj[];
  roster: PfRoster[];
}

const RAG_ZH = { G: "绿", A: "黄", R: "红" } as const;
const SPARK = "▁▂▃▄▅▆▇█";
function sparkText(weeks: number[]): string {
  const mx = Math.max(...weeks) || 1;
  return weeks
    .map((v) => SPARK[v === 0 ? 0 : Math.min(7, 1 + Math.floor((v / mx) * 6))])
    .join("");
}

/**
 * 融合的核心（web 侧）：把项目真实 git 上下文拼成注入 prompt 的前缀。
 * 口径与融合 TUI 的 projectContext() 对齐——同一份真实遥测，喂给同一批工作流。
 */
function buildProjectContext(p: PfProj, roster: PfRoster[]): string {
  const L: string[] = [];
  L.push("【真实项目上下文 · 由 agentic·PM 控制台从 git 实时算出，零编造】");
  L.push(`项目：${p.name}（${p.path}）`);
  L.push(`README 首句：${p.blurb}`);
  if (p.isGit) {
    L.push(
      `健康分：${p.score}/100 ${RAG_ZH[p.rag]}（新近+干净树+动量+分支卫生，口径同 pm_tui.py，可复算）`,
    );
    const m90 = p.weeks.reduce((x, y) => x + y, 0);
    L.push(
      `分支 ${p.branch} · 未提交 ${p.dirty} 个文件 · 提交总数 ${p.total} · 最近 ${p.lastRel} · 远端 ${p.hasOrigin ? "有" : "缺失"} · 90 天提交 ${m90}`,
    );
    if (p.recent.length) {
      L.push("最近提交：");
      for (const ln of p.recent) {
        const [h, when, who, ...rest] = ln.split("|");
        L.push(`  ${h} · ${when} · ${who} · ${rest.join("|")}`);
      }
    }
    const mine = roster
      .filter((r) => r.repos.includes(p.name))
      .slice(0, 5)
      .map((r) => `${r.name}(${r.commits})`);
    if (mine.length) L.push(`贡献者（本仓 git shortlog）：${mine.join(" · ")}`);
  } else {
    L.push(`版本控制：未纳入 git —— 无提交历史可审计，磁盘文件约 ${p.files}`);
  }
  if (p.risks.length) {
    L.push("控制台自动推导的风险：");
    for (const rk of p.risks) L.push(`  [${rk.sev}] ${rk.msg}`);
  }
  L.push(
    "—— 以上为真实遥测。请基于它执行下面的 PM 工作流；信息不足时用 Read/Grep 读这个项目的真实文件补全，不要编造。",
  );
  return L.join("\n");
}

const PF_VIEWS = ["组合", "项目", "人", "风险"] as const;
type PfView = (typeof PF_VIEWS)[number];

async function renderPortfolio() {
  renderMasthead("portfolio");
  const root = document.querySelector<HTMLElement>("[data-portfolio]");
  if (!root) return;

  let data: PfData;
  try {
    const res = await fetch("/api/portfolio");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = (await res.json()) as PfData;
  } catch (err) {
    root.innerHTML = "";
    root.appendChild(
      el(
        "div",
        { class: "error-banner" },
        `× 读取真实 git 组合失败：${err instanceof Error ? err.message : String(err)}`,
      ),
    );
    return;
  }

  const ps = data.projects;
  let view: PfView = "组合";
  let sel = 0;

  function ragDot(p: PfProj) {
    const cls = p.isGit ? `pf-dot pf-${p.rag}` : "pf-dot pf-none";
    return el("span", { class: cls });
  }
  function gaugeBar(p: PfProj) {
    const wrap = el("span", { class: "pf-gauge" });
    const fill = el("span", { class: `pf-gauge-fill pf-gf-${p.rag}` });
    fill.style.width = `${p.score}%`;
    wrap.appendChild(fill);
    return wrap;
  }

  function header() {
    const g = ps.filter((p) => p.rag === "G").length;
    const a = ps.filter((p) => p.rag === "A").length;
    const r = ps.filter((p) => p.rag === "R").length;
    const wip = ps.reduce((x, p) => x + p.dirty, 0);
    const h = el("div", { class: "pf-head" });
    h.appendChild(
      el("div", { class: "pf-head-title" }, "项目中心 · 融合控制台"),
    );
    h.appendChild(
      el(
        "div",
        { class: "pf-head-meta" },
        `${ps.length} 个项目 · 绿 ${g} / 黄 ${a} / 红 ${r} · 未提交 ${wip} 文件 · ${data.base} · 真实 git，零 mock`,
      ),
    );
    const tabs = el("div", { class: "pf-tabs" });
    for (const v of PF_VIEWS) {
      const t = el(
        "button",
        {
          class: `pf-tab${v === view ? " is-active" : ""}`,
          type: "button",
          "data-pf-tab": v,
        },
        v,
      );
      t.addEventListener("click", () => {
        view = v;
        sel = 0;
        paint();
      });
      tabs.appendChild(t);
    }
    h.appendChild(tabs);
    return h;
  }

  function projectRow(p: PfProj, i: number) {
    const row = el("button", {
      class: `pf-row${i === sel && view === "组合" ? " is-sel" : ""}`,
      type: "button",
    });
    const top = el("span", { class: "pf-row-top" });
    top.appendChild(ragDot(p));
    top.appendChild(el("span", { class: "pf-name" }, p.name));
    top.appendChild(gaugeBar(p));
    top.appendChild(
      el("span", { class: "pf-score" }, p.isGit ? String(p.score) : "—"),
    );
    top.appendChild(
      el(
        "span",
        { class: "pf-col pf-branch" },
        p.isGit ? p.branch : "无 git",
      ),
    );
    top.appendChild(el("span", { class: "pf-col pf-wip" }, `W${p.dirty}`));
    top.appendChild(el("span", { class: "pf-col pf-when" }, p.lastRel));
    top.appendChild(
      el(
        "span",
        { class: "pf-spark" },
        p.isGit ? sparkText(p.weeks) : "············",
      ),
    );
    top.appendChild(
      el("span", { class: "pf-col pf-auth" }, p.isGit ? p.author : ""),
    );
    row.appendChild(top);
    row.appendChild(el("span", { class: "pf-blurb" }, p.blurb));
    row.addEventListener("click", () => {
      sel = i;
      view = "项目";
      paint();
    });
    return row;
  }

  function workflowLauncher(p: PfProj) {
    const box = el("div", { class: "pf-launch" });
    box.appendChild(
      el(
        "div",
        { class: "pf-launch-head" },
        `在「${p.name}」上跑 PM 工作流 — 它的真实 git 上下文会自动注入 prompt`,
      ),
    );
    const grid = el("div", { class: "pf-launch-grid" });
    for (const s of SKILLS) {
      const chip = el(
        "button",
        { class: "pf-skill", type: "button" },
        `${s.glyph} · ${s.title}`,
      );
      chip.addEventListener("click", () => {
        try {
          sessionStorage.setItem(
            `agpm:proj:${p.name}`,
            buildProjectContext(p, data.roster),
          );
        } catch {}
        location.href = `/${s.id}?project=${encodeURIComponent(p.name)}`;
      });
      grid.appendChild(chip);
    }
    box.appendChild(grid);
    return box;
  }

  function detail(p: PfProj) {
    const d = el("div", { class: "pf-detail" });
    const h = el("div", { class: "pf-detail-h" });
    h.appendChild(ragDot(p));
    h.appendChild(el("span", { class: "pf-detail-name" }, p.name));
    h.appendChild(el("span", { class: "pf-detail-path" }, p.path));
    d.appendChild(h);
    d.appendChild(el("div", { class: "pf-detail-blurb" }, p.blurb));
    if (p.isGit) {
      const kv = el("div", { class: "pf-kv" });
      const pair = (k: string, v: string) => {
        kv.appendChild(el("span", { class: "pf-k" }, k));
        kv.appendChild(el("span", { class: "pf-v" }, v));
      };
      pair("健康", `${p.score}/100 ${RAG_ZH[p.rag]}`);
      pair("分支", p.branch);
      pair("提交", String(p.total));
      pair("最近", p.lastRel);
      pair("未提交", `${p.dirty} 文件`);
      pair("远端", p.hasOrigin ? "有" : "缺失");
      pair("90 天提交", String(p.weeks.reduce((x, y) => x + y, 0)));
      d.appendChild(kv);
      const spark = el("div", { class: "pf-momentum" });
      spark.appendChild(el("div", { class: "pf-sub" }, "12 周提交动量"));
      spark.appendChild(
        el("div", { class: "pf-spark-big" }, sparkText(p.weeks)),
      );
      d.appendChild(spark);
      if (p.recent.length) {
        const log = el("div", { class: "pf-log" });
        log.appendChild(el("div", { class: "pf-sub" }, "最近提交"));
        for (const ln of p.recent) {
          const [hsh, when, who, ...rest] = ln.split("|");
          const r = el("div", { class: "pf-log-row" });
          r.appendChild(el("span", { class: "pf-log-h" }, hsh ?? ""));
          r.appendChild(el("span", { class: "pf-log-when" }, when ?? ""));
          r.appendChild(el("span", { class: "pf-log-who" }, who ?? ""));
          r.appendChild(
            el("span", { class: "pf-log-subj" }, rest.join("|")),
          );
          log.appendChild(r);
        }
        d.appendChild(log);
      }
    } else {
      d.appendChild(
        el(
          "div",
          { class: "pf-nogit" },
          `未纳入版本控制 — 无 git 历史可审计 · 磁盘文件约 ${p.files}`,
        ),
      );
    }
    if (p.risks.length) {
      const rk = el("div", { class: "pf-risks" });
      rk.appendChild(el("div", { class: "pf-sub" }, "自动风险（来自真实 git 状态）"));
      for (const x of p.risks) {
        const sevZh = x.sev === "HIGH" ? "高" : x.sev === "MED" ? "中" : "净";
        const r = el("div", { class: `pf-risk pf-sev-${x.sev}` });
        r.appendChild(el("span", { class: "pf-risk-sev" }, sevZh));
        r.appendChild(el("span", { class: "pf-risk-msg" }, x.msg));
        rk.appendChild(r);
      }
      d.appendChild(rk);
    }
    d.appendChild(workflowLauncher(p));
    return d;
  }

  function rosterView() {
    const r = el("div", { class: "pf-roster" });
    const mx = data.roster[0]?.commits || 1;
    r.appendChild(
      el(
        "div",
        { class: "pf-sub" },
        `${data.roster.length} 位贡献者在册 · 跨 ${ps.filter((p) => p.isGit).length} 个 git 仓 · 按真实提交数聚合`,
      ),
    );
    for (const row of data.roster) {
      const line = el("div", { class: "pf-rrow" });
      line.appendChild(el("span", { class: "pf-rname" }, row.name));
      const bar = el("span", { class: "pf-rbar" });
      const fill = el("span", { class: "pf-rbar-fill" });
      fill.style.width = `${Math.max(4, Math.round((row.commits / mx) * 100))}%`;
      bar.appendChild(fill);
      line.appendChild(bar);
      line.appendChild(
        el(
          "span",
          { class: "pf-rmeta" },
          `${row.commits} commits${row.repos.length >= 4 ? ` · ⚠ ${row.repos.length} 仓` : ""}`,
        ),
      );
      r.appendChild(line);
      r.appendChild(
        el("div", { class: "pf-rrepos" }, `参与：${row.repos.join(" · ")}`),
      );
    }
    r.appendChild(
      el(
        "div",
        { class: "pf-foot-note" },
        "单人霸榜 = 巴士因子 1 风险；跨 ≥4 仓 = 注意力被摊薄",
      ),
    );
    return r;
  }

  function risksView() {
    const flat: { sev: string; name: string; msg: string }[] = [];
    for (const p of ps)
      for (const rk of p.risks)
        flat.push({ sev: rk.sev, name: p.name, msg: rk.msg });
    const ord: Record<string, number> = { HIGH: 0, MED: 1, OK: 2 };
    flat.sort((x, y) => (ord[x.sev] ?? 3) - (ord[y.sev] ?? 3));
    const hi = flat.filter((f) => f.sev === "HIGH").length;
    const md = flat.filter((f) => f.sev === "MED").length;
    const ok = flat.filter((f) => f.sev === "OK").length;
    const r = el("div", { class: "pf-risks" });
    r.appendChild(
      el(
        "div",
        { class: "pf-sub" },
        `自动风险台账 · 高 ${hi} / 中 ${md} / 净 ${ok} · 信号全部来自真实 git 状态`,
      ),
    );
    for (const f of flat) {
      const sevZh = f.sev === "HIGH" ? "高" : f.sev === "MED" ? "中" : "净";
      const row = el("div", { class: `pf-risk pf-sev-${f.sev}` });
      row.appendChild(el("span", { class: "pf-risk-sev" }, sevZh));
      row.appendChild(el("span", { class: "pf-risk-name" }, f.name));
      row.appendChild(el("span", { class: "pf-risk-msg" }, f.msg));
      r.appendChild(row);
    }
    return r;
  }

  function paint() {
    root!.innerHTML = "";
    root!.appendChild(header());
    const body = el("div", { class: "pf-body" });
    if (!ps.length) {
      body.appendChild(el("div", { class: "empty-state" }, "base 下没有项目"));
    } else if (view === "组合") {
      const list = el("div", { class: "pf-list" });
      ps.forEach((p, i) => list.appendChild(projectRow(p, i)));
      body.appendChild(list);
      body.appendChild(
        el(
          "div",
          { class: "pf-foot-note" },
          "按健康分升序 · 最差优先（PM 分诊序） · 点项目进详情，再在它上面跑工作流",
        ),
      );
    } else if (view === "项目") {
      body.appendChild(detail(ps[Math.min(sel, ps.length - 1)]!));
    } else if (view === "人") {
      body.appendChild(rosterView());
    } else {
      body.appendChild(risksView());
    }
    root!.appendChild(body);
  }

  paint();
}

// ---------- Boot ----------

function boot() {
  const page = document
    .querySelector<HTMLMetaElement>('meta[name="x-page"]')?.content;
  if (page === "portfolio") {
    void renderPortfolio();
    return;
  }
  const skillMeta = document
    .querySelector<HTMLMetaElement>('meta[name="x-skill"]')?.content;
  if (skillMeta) {
    const skill = getSkill(skillMeta);
    if (skill) renderSkillPage(skill);
    else document.body.innerHTML = `<pre>unknown skill: ${skillMeta}</pre>`;
  } else {
    renderHome();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
