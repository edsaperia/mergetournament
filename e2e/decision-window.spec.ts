import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { merges } from "../src/db/schema";
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
    await expect(modal.getByText("7 words · 1 lines")).toBeVisible();
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

  // First accept-vote: A waits for B.
  await modalA.getByRole("button", { name: "Accept the Merge" }).click();
  await expect(modalA.getByText(`You accepted — waiting for ${b.name}.`)).toBeVisible();

  // Second accept-vote locks the merge; B's modal goes and the result shows.
  await modalB.getByRole("button", { name: "Accept the Merge" }).click();
  await expect(modalB).toBeHidden();
  await expect(pageB.getByText(/^Resolved \(agreed\)/)).toBeVisible();

  const [row] = await withDb((db) => db.select().from(merges).where(eq(merges.id, id)));
  expect(row.state).toBe("resolved");
  expect(row.resolution).toBe("agreed");
  expect(row.workingText).toBe(frozen);

  // A's page doesn't refresh itself during the decision-window (nothing
  // pushes the partner's vote to it), so A sees the result on reload.
  await pageA.reload();
  await expect(modalA).toBeHidden();
  await expect(pageA.getByText(/^Resolved \(agreed\)/)).toBeVisible();
});
