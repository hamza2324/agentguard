import { test, expect } from "@playwright/test";

test("assets, generated data and hash links work under repository subpath", async ({
  page,
}) => {
  test.skip(
    test.info().project.name === "mobile",
    "One subpath integration is sufficient",
  );
  const failed: string[] = [];
  page.on("response", (response) => {
    if (
      response.url().startsWith("http://127.0.0.1:4174") &&
      response.status() >= 400
    )
      failed.push(response.url());
  });
  await page.goto("http://127.0.0.1:4174/agentguard/#datasets");
  await expect(
    page.getByRole("heading", { name: "Every expectation, versioned." }),
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(31);
  await page.getByRole("link", { name: "Version comparison" }).click();
  await expect(page).toHaveURL(/\/agentguard\/#comparison$/);
  await expect(
    page.getByRole("heading", { name: "Published comparison", exact: true }),
  ).toBeVisible();
  expect(failed).toEqual([]);
});
