import { expect, test } from "@playwright/test";
import { editorText, openWorkspace, setUpTournament, typeAtEnd } from "./tournament";

test("two bearers see each other's typing live and end with identical text", async ({ browser }) => {
  const { merge } = await setUpTournament({ names: ["Ada", "Brook"], roundDurationS: 600 });
  const { a, b, url } = merge!;

  // Two browser contexts: two people, two separate sessions.
  const pageA = await (await browser.newContext()).newPage();
  const pageB = await (await browser.newContext()).newPage();
  await pageA.goto(a.link);
  await pageB.goto(b.link);
  await openWorkspace(pageA, url);
  await openWorkspace(pageB, url);

  await typeAtEnd(pageA, `${a.name} writes the first article.`);
  await expect.poll(() => editorText(pageB)).toContain(`${a.name} writes the first article.`);

  await typeAtEnd(pageB, `${b.name} adds a second.`);
  await expect.poll(() => editorText(pageA)).toContain(`${b.name} adds a second.`);

  const expected = `${a.name} writes the first article.\n${b.name} adds a second.`;
  await expect.poll(() => editorText(pageA)).toBe(expected);
  await expect.poll(() => editorText(pageB)).toBe(expected);
});

test("typing a numbered list gives each number once", async ({ browser }) => {
  const { merge } = await setUpTournament({ names: ["Ada", "Brook"], roundDurationS: 600 });
  const page = await (await browser.newContext()).newPage();
  await page.goto(merge!.a.link);
  await openWorkspace(page, merge!.url);
  await typeAtEnd(page, "1. Moorings by lottery.");
  await typeAtEnd(page, "2. No motorboats before 7am.");
  await typeAtEnd(page, "3. Review every two years.");
  await expect
    .poll(() => editorText(page))
    .toBe("1. Moorings by lottery.\n2. No motorboats before 7am.\n3. Review every two years.");
});
