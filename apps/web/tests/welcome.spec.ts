import { test, expect } from "@playwright/test";

test("homepage explains the product, compares a real example and answers questions", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Looks right. Sounds right. Still breaks.",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Refund eligible.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "v1.0 · Baseline", exact: true })
    .click();
  await expect(
    page.getByText("Not eligible under the refund policy.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Why did the candidate fail?", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "widens the refund window",
  );
  await page.getByLabel("Ask about AgentGuard").fill("Do I need an API key?");
  await page.getByRole("button", { name: "Ask the product guide" }).click();
  await expect(page.getByRole("status")).toContainText("No API key is needed");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  if (process.env.CAPTURE_SCREENSHOTS) {
    await page
      .getByRole("button", { name: "v1.1 · Changed agent", exact: true })
      .click();
    await page.screenshot({
      path: `../../assets/screenshots/home-${test.info().project.name}.png`,
      fullPage: true,
    });
  }
});

test("public playground honestly replays a stored execution", async ({
  page,
}) => {
  await page.route("http://127.0.0.1:8000/health", (route) => route.abort());
  await page.goto("/#playground");
  await page.getByRole("button", { name: "Replay selected example" }).click();
  await expect(
    page.getByText("Saved scenario replay — no fresh agent execution", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Refund eligible.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("lookup_order", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Support request")).toHaveAttribute(
    "readonly",
    "",
  );
});

test("local playground executes a newly typed request", async ({ page }) => {
  await page.goto("/#playground");
  await expect(
    page.getByRole("button", { name: "Run agent locally" }),
  ).toBeVisible();
  await page.getByLabel("Support request").fill("Where is A101?");
  await page.getByRole("button", { name: "Run agent locally" }).click();
  await expect(
    page.getByText("Order A101 is shipped.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Fresh local execution — real reference agent", {
      exact: true,
    }),
  ).toBeVisible();
});
