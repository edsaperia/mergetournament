import { expect, test } from "@playwright/test";
import { setUpTournament } from "./tournament";

test("a tab opened during submission follows the admin closing submissions and starting, without a reload", async ({
  browser,
}) => {
  const { slug, admin, people } = await setUpTournament({ names: ["Ada", "Brook"] });
  const [ada] = people;

  const adaPage = await (await browser.newContext()).newPage();
  await adaPage.goto(ada.link);
  await expect(adaPage).toHaveURL(`/${slug}`);
  await expect(adaPage.getByText("Accepting submissions")).toBeVisible();
  // The draft editor is open and editable.
  await expect(adaPage.locator(".cm-content")).toHaveAttribute("contenteditable", "true");

  const adminPage = await (await browser.newContext()).newPage();
  adminPage.on("dialog", (dialog) => void dialog.accept());
  await adminPage.goto(admin.link);
  await adminPage.goto(`/${slug}/admin`);

  // Close now: Ada's tab says so and her draft turns read-only, with no reload.
  await adminPage.getByRole("button", { name: "Close now" }).click();
  await expect(adaPage.getByText("Submissions closed", { exact: true })).toBeVisible({ timeout: 5_000 });
  await expect(adaPage.locator(".cm-content")).toHaveCount(0);
  await expect(adaPage.getByText(/Your draft is in/)).toBeVisible();

  // Start Tournament: Ada's tab shows the bracket and "I'm ready", still with no reload.
  await adminPage.getByRole("button", { name: "Start Tournament" }).click();
  await expect(adaPage.getByText("Convening — the tournament has started")).toBeVisible({ timeout: 5_000 });
  await expect(adaPage.getByRole("button", { name: "I'm ready" })).toBeVisible();
  await expect(adaPage.getByRole("heading", { name: /^Round 1/ })).toBeVisible();
});
