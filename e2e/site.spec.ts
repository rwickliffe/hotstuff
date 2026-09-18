import { expect, test, type Locator } from "@playwright/test";

async function visible(locator: Locator): Promise<Locator[]> {
  const out: Locator[] = [];
  for (const el of await locator.all()) {
    if (await el.isVisible()) out.push(el);
  }
  return out;
}

test.describe("no JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("both pages render product cards", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("article.prod")).not.toHaveCount(0);

    await page.goto("/products");
    const cards = page.locator("article.prod");
    await expect(cards).not.toHaveCount(0);

    const card = cards.first();
    await expect(card.locator("h3")).not.toBeEmpty();
    await expect(card).toHaveAttribute("data-heat", /\d+/);
    await expect(
      card.locator(".heat-word, .price, button.ask").first(),
    ).toBeVisible();
  });

  test("heat legend captions are in the page", async ({ page }) => {
    await page.goto("/products");
    const key = page.locator(".scale-key");
    for (const word of ["Harmless", "Uneasy", "Regrettable", "No survivors"]) {
      await expect(key.locator("small", { hasText: word })).toBeVisible();
    }
  });

  test("?debug reports a real catalog source", async ({ page }) => {
    await page.goto("/products?debug");
    const diag = page.locator("#diag");
    await expect(diag).toContainText("data sources");
    await expect(diag).toContainText(
      /products\s+(live KV|snapshot) \(\d+ rows\)/,
    );
    await expect(diag).toContainText(/events\s+(live KV|snapshot|empty)/);
    await expect(diag).toContainText("fetchedAt");
    const products = (await diag.innerText()).match(
      /products\s+(?:live KV|snapshot) \((\d+) rows\)/,
    );
    expect(Number(products?.[1])).toBeGreaterThan(0);
  });
});

test("heat filter hides jars outside the selected band", async ({ page }) => {
  await page.goto("/products");
  const cards = page.locator('[data-grid="John"] .prod');
  const start = await visible(cards);
  expect(start.length).toBeGreaterThan(1);

  const band = page.locator(".filters button[data-band='beyond']");
  const range = (await band.getAttribute("data-range")) || "6,6";
  const [lo, hi] = range.split(",").map(Number);
  await band.click();
  await expect(band).toHaveAttribute("aria-pressed", "true");

  const shown = await visible(cards);
  expect(shown.length).toBeGreaterThan(0);
  expect(shown.length).toBeLessThan(start.length);
  for (const card of shown) {
    const heat = Number(await card.getAttribute("data-heat"));
    expect(heat).toBeGreaterThanOrEqual(lo);
    expect(heat).toBeLessThanOrEqual(hi);
  }

  await page.locator(".filters button[data-band='all']").click();
  expect((await visible(cards)).length).toBe(start.length);
});

test("ask from the catalog fills the home contact form", async ({ page }) => {
  await page.goto("/products");
  const btn = page.locator("button.ask[data-ask]").first();
  await expect(btn).toBeVisible();
  const name = await btn.getAttribute("data-ask");
  expect(name).toBeTruthy();
  await btn.click();
  await expect(page.locator("#contact-message")).toHaveValue(
    `Is "${name}" coming back? I would like some when it is.`,
  );
});

test("ask query on home fills the form and drops the param", async ({
  page,
}) => {
  const name = "Chow Chow";
  await page.goto(`/?ask=${encodeURIComponent(name)}#write`);
  await expect(page.locator("#contact-message")).toHaveValue(
    `Is "${name}" coming back? I would like some when it is.`,
  );
  await expect(page).not.toHaveURL(/ask=/);
});

test("mail and /data still answer under the Worker", async ({ request }) => {
  const data = await request.get("/data");
  expect(data.ok()).toBeTruthy();
  const body = await data.json();
  expect(Array.isArray(body.products)).toBeTruthy();

  const contact = await request.post("/contact", {
    headers: { "content-type": "text/plain" },
    data: "{}",
  });
  expect(contact.status()).toBe(400);
  expect(await contact.json()).toEqual({ ok: false, reason: "bad" });

  const cron = await request.get("/cdn-cgi/local/scheduled");
  expect(cron.ok()).toBeTruthy();
});

test("stylesheet keeps the shared CSP", async ({ request }) => {
  const css = await request.get("/styles.css");
  expect(css.ok()).toBeTruthy();
  expect(css.headers()["content-security-policy"]).toMatch(
    /default-src 'none'/,
  );
});
