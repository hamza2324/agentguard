import { test, expect } from "@playwright/test";
test("explores actual results, failed trace, comparison and themes", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#overview");
  await expect(
    page.getByRole("heading", { name: "Catch regressions before they ship." }),
  ).toBeVisible();
  await expect(page.getByText("64.5%", { exact: true }).first()).toBeVisible();
  if (process.env.CAPTURE_SCREENSHOTS)
    await page.screenshot({
      path: `../../assets/screenshots/overview-${test.info().project.name}.png`,
      fullPage: true,
    });
  await page.getByLabel("Search scenarios").fill("refund-A102");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Refund eligibility A102", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Observed state" }),
  ).toBeVisible();
  await expect(page.getByText("lookup_order", { exact: true })).toBeVisible();
  if (
    process.env.CAPTURE_SCREENSHOTS &&
    test.info().project.name === "chromium"
  )
    await page.screenshot({ path: "../../assets/screenshots/trace.png" });
  await page.getByRole("button", { name: "Close trace inspector" }).click();
  await page.goto("/#comparison");
  await expect(
    page.getByRole("heading", { name: "Published comparison", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".changes>button")).toHaveCount(31);
  if (
    process.env.CAPTURE_SCREENSHOTS &&
    test.info().project.name === "chromium"
  )
    await page.screenshot({
      path: "../../assets/screenshots/comparison.png",
      fullPage: true,
    });
  await page.goto("/#reports");
  await expect(
    page.getByRole("heading", { name: "Reproduce this benchmark" }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download full evidence" }).click();
  expect((await download).suggestedFilename()).toBe("agentguard-report.json");
  if (test.info().project.name !== "mobile") {
    await page.getByRole("button", { name: "Switch to dark theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("filters outcomes and switches versions", async ({ page }) => {
  await page.goto("/#overview");
  await page.getByLabel("Filter outcomes").selectOption("fail");
  await expect(page.locator("tbody tr")).toHaveCount(11);
  await page.getByRole("button", { name: "v1.0 Baseline" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(0);
  await page.getByLabel("Filter outcomes").selectOption("all");
  await expect(page.locator("tbody tr")).toHaveCount(31);
});
test("data failure is visible and offers retry", async ({ page }) => {
  await page.route("**/data/report.json", (route) =>
    route.fulfill({ status: 500, body: "error" }),
  );
  await page.goto("/#overview");
  await expect(
    page.getByRole("heading", { name: "Snapshot could not be loaded" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
});
