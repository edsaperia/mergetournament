import { expect, test } from "@playwright/test";
import { openWorkspace, setUpTournament } from "./tournament";

test("the tabs read A · Merge · B, and at 1280 wide the merge editor sits beside an input", async ({ browser }) => {
  const { merge } = await setUpTournament({ names: ["Ada", "Brook"], roundDurationS: 600 });
  const { a, b, url } = merge!;
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await page.goto(a.link);
  await openWorkspace(page, url);

  await expect(page.getByRole("tab")).toHaveText([`Input A · ${a.name}`, "Merge candidate", `Input B · ${b.name}`], { useInnerText: true });
  const inputA = page.getByRole("heading", { name: `Input A · ${a.name}` });
  const inputB = page.getByRole("heading", { name: `Input B · ${b.name}` });
  // Opens on the merge, with Input A beside it.
  await expect(page.locator(".cm-content")).toBeVisible();
  await expect(inputA).toBeVisible();
  await expect(inputB).toBeHidden();
  // Choosing B swaps the input; the editor stays.
  await page.getByRole("tab", { name: `Input B · ${b.name}` }).click();
  await expect(inputB).toBeVisible();
  await expect(inputA).toBeHidden();
  await expect(page.locator(".cm-content")).toBeVisible();
  // Side by side, not stacked.
  const editorBox = (await page.locator(".cm-content").boundingBox())!;
  const inputBox = (await inputB.boundingBox())!;
  expect(inputBox.x).toBeGreaterThan(editorBox.x + editorBox.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
});

test("at phone width one pane shows at a time", async ({ browser }) => {
  const { merge } = await setUpTournament({ names: ["Ada", "Brook"], roundDurationS: 600 });
  const { a, b, url } = merge!;
  const page = await (await browser.newContext({ viewport: { width: 360, height: 640 } })).newPage();
  await page.goto(a.link);
  await openWorkspace(page, url);

  await expect(page.getByRole("tab")).toHaveText([`${a.name}'s input`, "Merge", `${b.name}'s input`], { useInnerText: true });
  await expect(page.locator(".cm-content")).toBeVisible();
  await expect(page.getByRole("heading", { name: `Input A · ${a.name}` })).toBeHidden();
  await page.getByRole("tab", { name: `${a.name}'s input` }).click();
  await expect(page.getByRole("heading", { name: `Input A · ${a.name}` })).toBeVisible();
  await expect(page.locator(".cm-content")).toBeHidden();
});
