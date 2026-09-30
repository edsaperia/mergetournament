import { expect, test, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { merges } from "../src/db/schema";
import { GRACE_S } from "../src/services/runtime-service";
import { openWorkspace, setUpTournament, typeAtEnd, withDb } from "./tournament";

/** Short enough to wait out, long enough to open both workspaces and type first. */
const ROUND_S = 20;

test("round-countdown expires unfinished: both bearers get the decision-modal, two accept-votes lock the merge", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  // Four drafts, so round 1 isn't the final and the modal offers the bearer choice.
  const { merge } = await setUpTournament({ names: ["Ada", "Brook", "Cyd", "Dee"], roundDurationS: ROUND_S });
  const { a, b, url, id } = merge!;

  const pageA = await (await browser.newContext()).newPage();
  const pageB = await (await browser.newContext()).newPage();
  await pageA.goto(a.link);
  await pageB.goto(b.link);
  await openWorkspace(pageA, url);
  await openWorkspace(pageB, url);

  const frozen = `${a.name} and ${b.name} ran out of time.`;
  await typeAtEnd(pageA, frozen);
  await expect(pageA.getByRole("button", { name: "Propose lock-in" })).toBeVisible();

  // The round-countdown runs out with no lock-in: each bearer gets the decision-modal.
  const modalA = pageA.getByRole("dialog", { name: "Time is up — decide on the merge" });
  const modalB = pageB.getByRole("dialog", { name: "Time is up — decide on the merge" });
  await expect(modalA).toBeVisible({ timeout: (ROUND_S + 15) * 1000 });
  await expect(modalB).toBeVisible();

  for (const modal of [modalA, modalB]) {
    // The confirmation-strip shows the frozen text, as typed before the deadline.
    await expect(modal.getByText(/7 words · 1 line$/)).toBeVisible();
    await expect(modal).toContainText(frozen);
    // Bearer buttons named for the two bearers, and the two votes.
    await expect(modal.getByRole("button", { name: a.name, exact: true })).toBeVisible();
    await expect(modal.getByRole("button", { name: b.name, exact: true })).toBeVisible();
    await expect(modal.getByRole("group", { name: "Who goes into the next round?" })).toBeVisible();
    await expect(modal.getByRole("button", { name: "Accept the Merge" })).toBeVisible();
    await expect(modal.getByRole("button", { name: "Reject the Merge" })).toBeVisible();
  }
  // The text is frozen: the editor no longer takes input.
  await expect(pageA.getByText("live · read-only")).toBeVisible();

  // Only A typed, so each footer has one short rule line; "what if…" opens the full rules in place.
  await expect(modalA).toContainText(`If ${b.name} stays silent, your Accept sends this merge into the next round.`);
  await expect(modalB).toContainText(`If you stay silent, ${a.name}'s Accept sends this merge into the next round.`);
  const whatIfA = modalA.getByRole("button", { name: "what if…" });
  await expect(whatIfA).toHaveAttribute("aria-expanded", "false");
  await expect(modalA).not.toContainText("anything else sends your own input instead");
  await whatIfA.focus();
  await pageA.keyboard.press("Enter");
  await expect(modalA).toContainText(
    `While ${b.name} stays silent, your Accept sends this merge into the next round and anything else sends your own input instead`
  );
  await expect(modalA.getByRole("button", { name: "less" })).toHaveAttribute("aria-expanded", "true");
  // On a 360×640 phone the full rules fit without scrolling, final words included, and "less" is on screen.
  await pageA.setViewportSize({ width: 360, height: 640 });
  const fullRulesA = modalA.getByText(/^Both accept: it locks in\. While /);
  await expect(fullRulesA).toHaveText(new RegExp(`once ${b.name} responds, it's both accepting or a coin flip between the input texts\\.$`));
  expect(await fullRulesA.evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true);
  await expect(modalA.getByRole("button", { name: "less" })).toBeInViewport({ ratio: 1 });
  await pageA.setViewportSize({ width: 1280, height: 720 });

  // Both choose who goes into the next round, so the merge locks as agreed rather than by coin flip.
  for (const modal of [modalA, modalB]) {
    await modal.getByRole("button", { name: a.name, exact: true }).click();
  }
  // B's press makes both active: A's footer switches to the both-active line and collapses.
  await expect(modalA).toContainText("Anything else: a coin flip between the input texts.");
  await expect(whatIfA).toHaveAttribute("aria-expanded", "false");

  // First accept-vote: A waits for B, and B's modal shows it without B pressing anything.
  await modalA.getByRole("button", { name: "Accept the Merge" }).click();
  await expect(modalA.getByText(`You accepted — waiting for ${b.name}.`)).toBeVisible();
  await expect(modalB.getByText(`${a.name} has accepted. Accept too and the merge locks in.`)).toBeVisible();

  // Second accept-vote locks the merge; both modals go and the result shows, on A's page without a reload.
  await modalB.getByRole("button", { name: "Accept the Merge" }).click();
  await expect(modalB).toBeHidden();
  await expect(pageB.getByText(`Agreed: ${a.name} goes into the next round with the merged text.`).first()).toBeVisible();
  await expect(modalA).toBeHidden();
  await expect(pageA.getByText(`Agreed: ${a.name} goes into the next round with the merged text.`).first()).toBeVisible();
  // The round is still in its decision-window, but this merge's is over: the header stops showing it.
  for (const page of [pageA, pageB]) {
    await expect(page.getByText("decision window")).toBeHidden();
  }

  const [row] = await withDb((db) => db.select().from(merges).where(eq(merges.id, id)));
  expect(row.state).toBe("resolved");
  expect(row.resolution).toBe("agreed");
  expect(row.workingText).toBe(frozen);
});

test("decision-window runs out with both bearers rejecting: both modals clear by themselves for the coin flip, and nothing names the winner while the coin is in the air, on the workspace or the event page", async ({
  browser,
}) => {
  // The whole 60-second window has to run out.
  test.setTimeout(ROUND_S * 1000 + (GRACE_S + 60) * 1000);
  const { merge, people, slug } = await setUpTournament({ names: ["Ada", "Brook", "Cyd", "Dee"], roundDurationS: ROUND_S });
  const { a, b, url, id } = merge!;
  // A player from the other merge, watching this one.
  const watcher = people.find((p) => p.name !== a.name && p.name !== b.name)!;

  const pageA = await (await browser.newContext()).newPage();
  const pageB = await (await browser.newContext()).newPage();
  // A phone as well: its tabs use the short labels.
  const pageW = await (await browser.newContext({ viewport: { width: 360, height: 640 } })).newPage();
  await pageA.goto(a.link);
  await pageB.goto(b.link);
  await pageW.goto(watcher.link);
  await openWorkspace(pageA, url);
  await openWorkspace(pageB, url);
  // A watcher's editor is read-only.
  await pageW.goto(url);
  await expect(pageW.getByText("live · read-only")).toBeVisible();
  // Both players' event pages too, in tabs of their own (each tab plays the flip once).
  // The other merge is abandoned, so whoever wins stands over into the final alone.
  const eventA = await pageA.context().newPage();
  const eventB = await pageB.context().newPage();
  for (const page of [eventA, eventB]) {
    await page.goto(`/${slug}`);
    await expect(page.getByRole("heading", { name: /^Round 2/ })).toBeVisible();
  }
  const round2 = (page: Page) => page.locator("section").filter({ has: page.getByRole("heading", { name: /^Round 2/ }) });

  const modalA = pageA.getByRole("dialog", { name: "Time is up — decide on the merge" });
  const modalB = pageB.getByRole("dialog", { name: "Time is up — decide on the merge" });
  await expect(modalA).toBeVisible({ timeout: (ROUND_S + 15) * 1000 });
  await expect(modalB).toBeVisible();

  // Both present, neither accepts: at the window's end a coin flip picks an input text.
  await modalA.getByRole("button", { name: "Reject the Merge" }).click();
  await modalB.getByRole("button", { name: "Reject the Merge" }).click();

  const unmarked = {
    wide: [`Input A · ${a.name}`, "Merge candidate", `Input B · ${b.name}`],
    phone: [`${a.name}'s input`, "Merge", `${b.name}'s input`],
  };
  const inAirOnWorkspace = async (page: Page, labels: readonly string[]) => {
    const flip = page.getByRole("dialog", { name: "Coin flip" });
    await expect(flip).toBeVisible({ timeout: (GRACE_S + 15) * 1000 });
    await expect(flip).toContainText("Time ran out — deciding which input text goes into the next round");
    await expect(flip).toContainText("the coin is in the air");
    // Nothing behind the coin names the winner: no result line, no ✓ or ✗ on a tab,
    // no "goes into the next round" tag, and the page stays on the merge candidate.
    await expect(page.getByText(/text goes into the next round unchanged/)).toBeHidden();
    const tabs = page.locator("[role=tab]");
    await expect(tabs).toHaveText(labels, { useInnerText: true });
    await expect(page.locator("[role=tab][aria-selected=true]")).toHaveText(labels[1], { useInnerText: true });
    await expect(page.getByText("goes into the next round", { exact: true })).toHaveCount(0);
    await expect(page.getByText("doesn't go into the next round", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "Time is up — decide on the merge" })).toBeHidden();
    // Still in the air after all that: the checks above ran while the coin was up.
    await expect(flip).toContainText("the coin is in the air");
  };
  const inAirOnEventPage = async (page: Page) => {
    const flip = page.getByRole("dialog", { name: "Coin flip" });
    await expect(flip).toBeVisible({ timeout: (GRACE_S + 15) * 1000 });
    await expect(flip).toContainText("the coin is in the air");
    // The final's card would name the winner's text (and mark it "yours"): held back.
    await expect(round2(page).getByRole("link", { name: /'s draft$/ })).toBeHidden();
    await expect(round2(page).getByText("yours", { exact: true })).toBeHidden();
    // So would the tournament chat's stand-over line and the what-now card (either player's).
    await expect(page.getByText(/no partner in the final/)).toHaveCount(0);
    await expect(page.getByText(/goes into the next round with this text/)).toHaveCount(0);
    await expect(flip).toContainText("the coin is in the air");
  };
  // All at once: each tab's coin is up for only six seconds.
  await Promise.all([
    inAirOnWorkspace(pageA, unmarked.wide),
    inAirOnWorkspace(pageB, unmarked.wide),
    inAirOnWorkspace(pageW, unmarked.phone),
    inAirOnEventPage(eventA),
    inAirOnEventPage(eventB),
  ]);

  // A message started while the coin is in the air (input A's chat, beside the merge at 1280).
  const draftBox = pageA.getByPlaceholder("Say something…").first();
  await draftBox.fill("typed during the flip");

  const [row] = await withDb((db) => db.select().from(merges).where(eq(merges.id, id)));
  expect(row.state).toBe("resolved");
  expect(row.resolution).toBe("backstop_flip");

  // Once the coin lands, the winning input is marked and opened.
  const winner = row.resultTextId === row.textAId ? 0 : 2;
  for (const page of [pageA, pageB, pageW]) {
    await expect(page.getByRole("dialog", { name: "Coin flip" }).getByRole("button", { name: "Close" })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("[role=tab]").nth(winner)).toContainText("✓");
    await expect(page.locator("[role=tab]").nth(1)).toContainText("✗");
    await expect(page.locator("[role=tab]").nth(winner)).toHaveAttribute("aria-selected", "true");
  }
  // The tabs moved to the winner in place: the unsent message is still there.
  await expect(draftBox).toHaveValue("typed during the flip");

  // On the event pages, once the coin lands: the final's card, the stand-over line, and each player's card.
  const winnerName = row.advancingBearerId === row.bearerAId ? a.name : b.name;
  const [winnerEvent, loserEvent] = winnerName === a.name ? [eventA, eventB] : [eventB, eventA];
  for (const page of [eventA, eventB]) {
    await expect(page.getByRole("dialog", { name: "Coin flip" }).getByRole("button", { name: "Close" })).toBeVisible({ timeout: 15_000 });
    await expect(round2(page).getByRole("link", { name: `${winnerName}'s draft` })).toBeVisible();
    await expect(page.getByText(`${winnerName}'s text has no partner in the final, so it becomes the final text.`)).toBeVisible();
  }
  await expect(round2(winnerEvent).getByText("yours", { exact: true })).toBeVisible();
  await expect(winnerEvent.getByText("Your text has no partner in the final, so it becomes the final text.")).toBeVisible();
  await expect(loserEvent.getByText(`${winnerName} goes into the next round with this text.`)).toBeVisible();
  // The flip sits in its bracket card, a link: closing it, by button or outside, stays on the event page.
  await winnerEvent.getByRole("dialog", { name: "Coin flip" }).getByRole("button", { name: "Close" }).click();
  await loserEvent.getByRole("dialog", { name: "Coin flip" }).click({ position: { x: 5, y: 5 } });
  for (const page of [winnerEvent, loserEvent]) {
    await expect(page.getByRole("dialog", { name: "Coin flip" })).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/${slug}$`));
  }
});
