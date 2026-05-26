import { test, expect, type Route } from "@playwright/test";
// Single source of truth — tests import the same metadata the app renders,
// so adding/removing a view can never silently drift the test list.
import { SKILLS, LEVELS, skillsByLevel } from "../app/skills.ts";

const GROUPS = skillsByLevel();

test.describe("home", () => {
  test("loads with brand + hero + all skill cards", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/agentic.+PM/);
    await expect(page.locator(".brand")).toContainText("agentic");
    await expect(page.locator(".hero h1")).toContainText("PM");
    const cards = page.locator(".skill-card");
    await expect(cards).toHaveCount(SKILLS.length);
    for (const s of SKILLS) {
      await expect(cards.filter({ hasText: s.title })).toHaveCount(1);
    }
  });

  test("renders two level groups with correct per-level counts", async ({
    page,
  }) => {
    await page.goto("/");
    expect(GROUPS.map((g) => g.level.id)).toEqual(["task", "project"]);
    for (const { level, skills } of GROUPS) {
      const head = page.locator(`.grid-head[data-level="${level.id}"]`);
      await expect(head.locator("h2")).toContainText(level.label);
      await expect(head.locator("h2")).toContainText(level.sub);
      const grid = page.locator(`.skill-grid[data-grid="${level.id}"]`);
      await expect(grid.locator(".skill-card")).toHaveCount(skills.length);
    }
  });

  test("each skill card links to its own route", async ({ page }) => {
    await page.goto("/");
    for (const s of SKILLS) {
      const href = await page
        .locator(".skill-card", { hasText: s.title })
        .getAttribute("href");
      expect(href).toBe(`/${s.id}`);
    }
  });

  test("health endpoint reports plugin path + all skills", async ({
    request,
  }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.pluginPath).toContain("product-management");
    expect(body.skills).toHaveLength(SKILLS.length);
  });

  test("skills API returns every view id", async ({ request }) => {
    const res = await request.get("/api/skills");
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as Array<{ id: string; level: string }>;
    expect(body.map((s) => s.id).sort()).toEqual(
      SKILLS.map((s) => s.id).sort(),
    );
    // every view carries a valid level
    const levelIds = new Set<string>(LEVELS.map((l) => l.id));
    expect(body.every((s) => levelIds.has(s.level))).toBe(true);
  });
});

test.describe("skill pages", () => {
  for (const s of SKILLS) {
    test(`${s.id} (${s.level}): composer + side + level tag rendered`, async ({
      page,
    }) => {
      await page.goto(`/${s.id}`);
      await expect(page.locator(".skill-side h1")).toContainText(s.title);
      await expect(page.locator(".level-tag")).toBeVisible();
      await expect(page.locator(".composer textarea")).toBeVisible();
      await expect(page.locator(".btn", { hasText: "生成" })).toBeVisible();
      await expect(page.locator(".example").first()).toBeVisible();
    });
  }

  test("project views are reachable and distinct from task views", async ({
    page,
  }) => {
    for (const lvl of ["project"] as const) {
      const sample = SKILLS.find((s) => s.level === lvl)!;
      await page.goto(`/${sample.id}`);
      await expect(page.locator(".level-tag")).toContainText(
        LEVELS.find((l) => l.id === lvl)!.label,
      );
    }
  });

  test("write-spec: clicking example fills composer", async ({ page }) => {
    await page.goto("/write-spec");
    const firstExample = page.locator(".example").first();
    const txt = (await firstExample.textContent())?.trim();
    expect(txt).toBeTruthy();
    await firstExample.click();
    const value = await page.locator(".composer textarea").inputValue();
    expect(value).toBe(txt);
  });
});

test.describe("SSE streaming (mocked agent)", () => {
  async function mockAgent(route: Route) {
    const encoder = new TextEncoder();
    const chunks = [
      `event: open\ndata: {"threadId":"t-1","skill":"write-spec"}\n\n`,
      `event: init\ndata: {"model":"claude-opus-test","tools":["Read"],"plugins":[{"name":"product-management","path":"x"}],"session_id":"s-1"}\n\n`,
      `event: tool_use\ndata: {"name":"Read","input":{"file_path":"/tmp/x.md"}}\n\n`,
      `event: text\ndata: {"text":"## 背景\\n\\n这是一个"}\n\n`,
      `event: text\ndata: {"text":"模拟流式响应。"}\n\n`,
      `event: result\ndata: {"subtype":"success","duration_ms":1234,"num_turns":2,"total_cost_usd":0.0123,"text":"## 背景\\n\\n这是一个模拟流式响应。"}\n\n`,
      `event: done\ndata: {"threadId":"t-1"}\n\n`,
    ];
    const body = new ReadableStream({
      async start(controller) {
        for (const c of chunks) {
          controller.enqueue(encoder.encode(c));
          await new Promise((r) => setTimeout(r, 30));
        }
        controller.close();
      },
    });
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream; charset=utf-8" },
      body: await new Response(body).text(),
    });
  }

  test("submits prompt, renders user bubble, then streamed assistant", async ({ page }) => {
    await page.route("**/api/agent", mockAgent);
    await page.goto("/write-spec");
    await page.locator(".composer textarea").fill("测试一个新功能：批量导出。");
    await page.locator(".btn", { hasText: "生成" }).click();

    await expect(page.locator(".bubble.user .body")).toContainText("批量导出");
    await expect(page.locator(".bubble.assistant .body")).toBeVisible();
    await expect(page.locator(".tool-chip", { hasText: "Read" })).toBeVisible({ timeout: 5000 });
    await expect(page.locator(".bubble.assistant .body")).toContainText("背景", {
      timeout: 5000,
    });
    await expect(page.locator(".result-meta")).toContainText("耗时", { timeout: 5000 });
  });

  test("error response surfaces banner", async ({ page }) => {
    await page.route("**/api/agent", async (route) => {
      await route.fulfill({
        status: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "fake failure for test" }),
      });
    });
    await page.goto("/project-health");
    await page.locator(".composer textarea").fill("trigger error");
    await page.locator(".btn", { hasText: "生成" }).click();
    await expect(page.locator(".error-banner")).toBeVisible();
  });
});
