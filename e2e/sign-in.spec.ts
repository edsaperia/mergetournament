import { expect, test } from "@playwright/test";
import { setUpTournament } from "./tournament";

test("a participant signs in with the magic link from their invitation", async ({ page, context }) => {
  const { slug, people } = await setUpTournament({ names: ["Ada", "Brook"] });
  const [ada] = people;

  await page.goto(`/${slug}`);
  await expect(page.getByText("Accepting submissions")).toBeVisible();
  await expect(page.getByText("Ada", { exact: true })).toHaveCount(0);

  await page.goto(ada.link);
  await expect(page).toHaveURL(`/${slug}`);
  await expect(page.getByText("Ada", { exact: true })).toBeVisible();
  expect((await context.cookies()).map((c) => c.name)).toContain(`mt_s_${slug}`);

  // The session outlives the link: a fresh visit is still signed in.
  await page.goto(`/${slug}`);
  await expect(page.getByText("Ada", { exact: true })).toBeVisible();
});

test("a tampered magic link is refused", async ({ page }) => {
  const { people } = await setUpTournament({ names: ["Ada", "Brook"] });
  const response = await page.goto(`${people[0].link}x`);
  expect(response?.status()).toBe(401);
  await expect(page.getByText("This link is not valid")).toBeVisible();
});
