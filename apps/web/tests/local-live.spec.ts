import { test, expect } from "@playwright/test";

test("executes the real local backend and saves a reviewed failure", async ({
  page,
  request,
}) => {
  test.skip(
    test.info().project.name === "mobile",
    "One backend integration execution is sufficient",
  );
  await page.goto("/#reports");
  await page.getByRole("button", { name: "Connect local backend" }).click();
  await expect(
    page.getByText("Local backend connected. Live evaluations are available.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Run real evaluation" }).click();
  await expect(
    page.getByText(/Live evaluation complete: 31 scenarios/),
  ).toBeVisible();
  await page.goto("/#overview");
  await page.getByLabel("Search scenarios").fill("refund-A102");
  await page
    .getByRole("button", { name: "Refund eligibility A102", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Failure → reviewed regression test" }),
  ).toBeVisible();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Save approved regression test" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(/Saved reviewed-regressions-v/)).toBeVisible();
  const reviews = await (
    await request.get("http://127.0.0.1:8000/reviews")
  ).json();
  expect(reviews.length).toBeGreaterThan(0);
});
