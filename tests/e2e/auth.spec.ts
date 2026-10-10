import { expect, test } from "@playwright/test";

import { anonymousMe, mockApi, pendingMe } from "./fixtures";

test("anonymous visitor can start Discord sign-in", async ({ page }) => {
  await mockApi(page, { me: anonymousMe });
  // A same-origin URL keeps the SPA on the page after the redirect.
  await page.route(
    (url) => url.pathname === "/api/auth/sign-in/social",
    (route) => route.fulfill({ json: { url: "/?signed-in-redirect=1" } }),
  );
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Sign in to LememCon" }),
  ).toBeVisible();

  const request = page.waitForRequest(
    (req) =>
      new URL(req.url()).pathname === "/api/auth/sign-in/social" &&
      req.method() === "POST",
  );
  await page.getByRole("button", { name: "Sign in with Discord" }).click();

  expect((await request).postDataJSON()).toMatchObject({
    provider: "discord",
  });
});

test("pending member sees the approval notice and can check again", async ({
  page,
}) => {
  await mockApi(page, { me: pendingMe });
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /waiting for approval/ }),
  ).toBeVisible();
  await expect(page.getByText("Hi Newcomer.")).toBeVisible();

  const meRequest = page.waitForRequest(
    (req) => new URL(req.url()).pathname === "/api/me",
  );
  await page.getByRole("button", { name: "Check again" }).click();
  await meRequest;
});
