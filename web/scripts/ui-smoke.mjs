// UI smoke test: drives every page in a real browser, fails on console errors,
// failed requests or missing content, and saves screenshots.
// Usage: BASE_URL=http://localhost:3000 node scripts/ui-smoke.mjs [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.argv[2] ?? "screenshots";
mkdirSync(OUT, { recursive: true });

const problems = [];
const check = (cond, msg) => { if (!cond) problems.push(msg); };

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });

async function newPage(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("response", (r) => { if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url()}`); });
  return { ctx, page };
}

// ---- Ask page -------------------------------------------------------------
{
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/");
  await page.getByRole("heading", { name: "Which rule applies on that date?" }).waitFor();

  // client-side validation
  await page.getByRole("button", { name: "Ask" }).click();
  check(await page.getByText("Enter a question of at least 3 characters.").isVisible(), "ask: empty-question error missing");

  // each example renders a lifecycle answer and two comparisons
  const expectations = [
    ["B-10 scope, Sep 2023", "In force", "not yet effective"],
    ["Grandfathered mortgage", "Grandfathered", null],
    ["E-21 resilience, Mar 2025", "Not yet effective", "not yet effective"],
    ["Scenario testing, today", "Not yet effective", "not yet effective"],
  ];
  for (const [label, badge, staleWord] of expectations) {
    await page.getByRole("button", { name: label }).click();
    await page.getByRole("button", { name: "Ask" }).click();
    await page.locator("article.answer .badge").first().waitFor();
    await page.waitForFunction(() => !document.querySelector("button[type=submit]")?.disabled);
    const got = (await page.locator("article.answer .answer-head .badge").innerText()).trim();
    check(got === badge, `ask[${label}]: badge "${got}" != "${badge}"`);
    check(await page.locator(".compare").count() === 2, `ask[${label}]: comparison cards missing`);
    if (staleWord) {
      const verdicts = await page.locator(".verdict-bad").allInnerTexts();
      check(verdicts.some((v) => v.includes(staleWord)), `ask[${label}]: expected a stale verdict mentioning "${staleWord}"`);
    }
  }
  await page.getByRole("button", { name: "B-10 scope, Sep 2023" }).click();
  await page.getByRole("button", { name: "Ask" }).click();
  await page.locator("article.answer").waitFor();
  await page.locator("details.versions summary").click();
  await page.screenshot({ path: `${OUT}/ask-desktop.png`, fullPage: true });

  // commitment after as-of is rejected client side
  await page.fill("#commit", "2030-01-01");
  await page.fill("#asof", "2025-01-01");
  await page.getByRole("button", { name: "Ask" }).click();
  check(await page.getByText("Must be on or before the as-of date.").isVisible(), "ask: commitment-date error missing");
  await ctx.close();
}

// ---- Timeline page ------------------------------------------------------------
{
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/timeline");
  await page.locator(".timeline-figure svg").waitFor();
  for (const id of ["B-10", "E-21", "B-20"]) {
    await page.getByRole("tab", { name: id }).click();
    await page.waitForFunction((id) => document.querySelector("svg[aria-label]")?.getAttribute("aria-label")?.includes(id), id);
    const rows = await page.locator("tbody tr").count();
    check(rows >= 3, `timeline[${id}]: only ${rows} table rows`);
  }
  await page.getByRole("tab", { name: "E-21" }).click();
  await page.fill("#asof", "2025-03-01");
  await page.waitForFunction(() => document.body.innerText.includes("Versions on Mar 1, 2025"));
  const text = await page.locator("tbody").innerText();
  check(text.includes("Not yet effective"), "timeline: E-21 should show not-yet-effective sections on Mar 1, 2025");

  // watchlist add / remove round trip
  const watchBtn = page.getByRole("button", { name: /Watch E-21|Watching/ });
  const before = await watchBtn.innerText();
  await watchBtn.click();
  await page.waitForFunction((b) => {
    const btn = [...document.querySelectorAll(".toolbar button")].pop();
    return btn && btn.textContent !== b && !btn.disabled;
  }, before);
  const after = await page.getByRole("button", { name: /Watch E-21|Watching/ }).innerText();
  check(after !== before, "timeline: watch button did not toggle");
  await page.screenshot({ path: `${OUT}/timeline-desktop.png`, fullPage: true });
  await ctx.close();
}

// ---- Quality page -------------------------------------------------------------
{
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/quality");
  await page.getByRole("heading", { name: "Answer quality" }).waitFor();
  const metrics = await page.locator(".metric-value").allInnerTexts();
  check(metrics.length === 6, `quality: expected 6 metric values, got ${metrics.length}`);
  const all = await page.locator(".eval-table tbody tr").count();
  await page.getByLabel("Only questions some strategy gets wrong").check();
  const some = await page.locator(".eval-table tbody tr").count();
  check(some > 0 && some < all, `quality: failure filter did not reduce rows (${all} -> ${some})`);
  await page.screenshot({ path: `${OUT}/quality-desktop.png`, fullPage: true });
  await ctx.close();
}

// ---- Mobile and dark mode -------------------------------------------------------
for (const [name, opts] of [
  ["mobile", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
  ["dark", { colorScheme: "dark" }],
]) {
  for (const path of ["/", "/timeline", "/quality"]) {
    const { ctx, page } = await newPage(opts);
    await page.goto(BASE + path);
    await page.waitForLoadState("networkidle");
    if (path === "/") {
      await page.getByRole("button", { name: "Grandfathered mortgage" }).click();
      await page.getByRole("button", { name: "Ask" }).click();
      await page.locator("article.answer").waitFor();
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(overflow <= 1, `${name}${path}: horizontal overflow of ${overflow}px`);
    const slug = path === "/" ? "ask" : path.slice(1);
    await page.screenshot({ path: `${OUT}/${slug}-${name}.png`, fullPage: true });
    await ctx.close();
  }
}

// ---- Unknown route ----------------------------------------------------------------
{
  const { ctx, page } = await newPage();
  const res = await page.goto(BASE + "/nope");
  check(res.status() === 404, `404 page returned ${res.status()}`);
  await ctx.close();
}

await browser.close();
const real = problems.filter((p) => !p.includes("404 (Not Found)"));
if (real.length) {
  console.error("UI smoke test FAILED:\n- " + real.join("\n- "));
  process.exit(1);
}
console.log("UI smoke test passed. Screenshots in", OUT);
