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

test("on desktop a long merge text scrolls inside the editor: the picks, Propose lock-in and the merge chat stay in reach", async ({
  browser,
}) => {
  // Four drafts, so round 1 isn't the final and the picks show.
  const { merge } = await setUpTournament({ names: ["Ada", "Brook", "Cyd", "Dee"], roundDurationS: 600 });
  const { a, url } = merge!;
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await page.goto(a.link);
  await openWorkspace(page, url);

  const propose = page.getByRole("button", { name: "Propose lock-in" });
  const picks = page.getByRole("group", { name: "Who goes into the next round?" });
  const chat = page.getByRole("button", { name: /^This merge's chat/ });
  // Short text: everything on screen, the merge chat included.
  for (const el of [propose, picks, chat]) await expect(el).toBeInViewport({ ratio: 1 });

  // 80 long lines, as in the playtest: the text scrolls inside the editor instead.
  await page.locator(".cm-content").click();
  await page.keyboard.insertText(
    Array.from({ length: 80 }, (_, i) => `${i + 1}. Clause ${i + 1}: the harbour council shall publish minutes within seven days.`).join("\n")
  );
  await expect(page.getByText(/^\d{3,} words$/)).toBeVisible();
  for (const size of [
    { width: 1280, height: 800 },
    { width: 1024, height: 768 },
  ]) {
    await page.setViewportSize(size);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(propose).toBeInViewport({ ratio: 1 });
    await expect(picks).toBeInViewport({ ratio: 1 });
    // The chat's header, at least, so its messages are a click or a short scroll away.
    await expect(chat).toBeInViewport({ ratio: 1 });
    // The editor is still a usable size.
    const editor = (await page.locator(".cm-editor").boundingBox())!;
    expect(editor.height).toBeGreaterThanOrEqual(160);
  }
});
