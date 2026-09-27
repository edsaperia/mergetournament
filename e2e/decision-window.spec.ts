import { expect, test } from "@playwright/test";
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
    await expect(modal.getByRole("button", { name: "Accept the Merge" })).toBeVisible();
    await expect(modal.getByRole("button", { name: "Reject the Merge" })).toBeVisible();
  }
  // The text is frozen: the editor no longer takes input.
  await expect(pageA.getByText("live · read-only")).toBeVisible();

  // Both choose who carries the result forward, so the merge locks as agreed rather than by coin flip.
  for (const modal of [modalA, modalB]) {
    await modal.getByRole("button", { name: a.name, exact: true }).click();
  }

  // First accept-vote: A waits for B, and B's modal shows it without B pressing anything.
  await modalA.getByRole("button", { name: "Accept the Merge" }).click();
  await expect(modalA.getByText(`You accepted — waiting for ${b.name}.`)).toBeVisible();
  await expect(modalB.getByText(`${a.name} has accepted. Accept too and the merge locks in.`)).toBeVisible();

  // Second accept-vote locks the merge; both modals go and the result shows, on A's page without a reload.
  await modalB.getByRole("button", { name: "Accept the Merge" }).click();
  await expect(modalB).toBeHidden();
  await expect(pageB.getByText(/^Resolved \(agreed\)/)).toBeVisible();
  await expect(modalA).toBeHidden();
  await expect(pageA.getByText(/^Resolved \(agreed\)/)).toBeVisible();
  // The round is still in its decision-window, but this merge's is over: the header stops showing it.
  for (const page of [pageA, pageB]) {
    await expect(page.getByText("decision window")).toBeHidden();
  }

  const [row] = await withDb((db) => db.select().from(merges).where(eq(merges.id, id)));
  expect(row.state).toBe("resolved");
  expect(row.resolution).toBe("agreed");
  expect(row.workingText).toBe(frozen);
});

test("decision-window runs out with both bearers rejecting: both modals clear by themselves for the coin flip", async ({
  browser,
}) => {
  // The whole 60-second window has to run out.
  test.setTimeout(ROUND_S * 1000 + (GRACE_S + 60) * 1000);
  const { merge } = await setUpTournament({ names: ["Ada", "Brook", "Cyd", "Dee"], roundDurationS: ROUND_S });
  const { a, b, url, id } = merge!;

  const pageA = await (await browser.newContext()).newPage();
  const pageB = await (await browser.newContext()).newPage();
  await pageA.goto(a.link);
  await pageB.goto(b.link);
  await openWorkspace(pageA, url);
  await openWorkspace(pageB, url);

  const modalA = pageA.getByRole("dialog", { name: "Time is up — decide on the merge" });
  const modalB = pageB.getByRole("dialog", { name: "Time is up — decide on the merge" });
  await expect(modalA).toBeVisible({ timeout: (ROUND_S + 15) * 1000 });
  await expect(modalB).toBeVisible();

  // Both present, neither accepts: at the window's end a coin flip picks an input text.
  await modalA.getByRole("button", { name: "Reject the Merge" }).click();
  await modalB.getByRole("button", { name: "Reject the Merge" }).click();

  for (const page of [pageA, pageB]) {
    const flip = page.getByRole("dialog", { name: "Coin flip" });
    await expect(flip).toBeVisible({ timeout: (GRACE_S + 15) * 1000 });
    await expect(flip).toContainText("Time ran out — deciding which input text advances");
    // Who carries the result isn't shown behind the overlay while the coin is in the air.
    await expect(flip).toContainText("the coin is in the air");
    await expect(page.getByText(/carried by/)).toBeHidden();
    await expect(page.getByRole("dialog", { name: "Time is up — decide on the merge" })).toBeHidden();
  }

  const [row] = await withDb((db) => db.select().from(merges).where(eq(merges.id, id)));
  expect(row.state).toBe("resolved");
  expect(row.resolution).toBe("backstop_flip");
});
