import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, TestDb } from "../db/test-db";
import { ConsoleEmailer } from "../lib/email";
import {
  addParticipant,
  createTournament,
  participantForToken,
  reissueLink,
  removeParticipant,
  saveDraft,
  submissionStatus,
  updateParticipant,
} from "./tournament-service";

let db: TestDb;
const BASE = "https://mergetournament.org";

beforeAll(async () => {
  ({ db } = await createTestDb());
});

function extractToken(text: string): string {
  const m = text.match(/\/auth\/([A-Za-z0-9_-]+)/);
  if (!m) throw new Error("no magic link in email");
  return m[1];
}

describe("tournament + roster flow", () => {
  it("creates a tournament, invites a participant, authenticates their token", async () => {
    const emailer = new ConsoleEmailer();
    const t = await createTournament(db, {
      slug: "convention", name: "The Convention", roundDurationS: 1800, breakDurationS: 600,
    });
    expect(t.phase).toBe("submission");

    const p = await addParticipant(db, emailer, BASE, t.id, { name: "Ada", email: "Ada@Example.org " });
    expect(p.email).toBe("ada@example.org");
    expect(emailer.sent).toHaveLength(1);
    expect(emailer.sent[0].to).toBe("ada@example.org");

    const token = extractToken(emailer.sent[0].text);
    expect(p.tokenHash).not.toContain(token);

    const found = await participantForToken(db, "convention", token);
    expect(found?.id).toBe(p.id);
    expect(await participantForToken(db, "convention", "wrong-token")).toBeNull();
    expect(await participantForToken(db, "no-such-slug", token)).toBeNull();
  });

  it("re-issuing a link invalidates the old token", async () => {
    const emailer = new ConsoleEmailer();
    const t = await createTournament(db, { slug: "reissue", name: "R", roundDurationS: 600, breakDurationS: 60 });
    const p = await addParticipant(db, emailer, BASE, t.id, { name: "Bo", email: "bo@example.org" });
    const oldToken = extractToken(emailer.sent[0].text);

    await reissueLink(db, emailer, BASE, p.id);
    const newToken = extractToken(emailer.sent[1].text);
    expect(newToken).not.toBe(oldToken);
    expect(await participantForToken(db, "reissue", oldToken)).toBeNull();
    expect((await participantForToken(db, "reissue", newToken))?.id).toBe(p.id);
  });

  it("renames participants; email changes rotate the magic link to the new address", async () => {
    const emailer = new ConsoleEmailer();
    const t = await createTournament(db, { slug: "edit-p", name: "E", roundDurationS: 600, breakDurationS: 60 });
    const p = await addParticipant(db, emailer, BASE, t.id, { name: "Bob", email: "bob@example.org" });
    const other = await addParticipant(db, emailer, BASE, t.id, { name: "Zed", email: "zed@example.org" });
    void other;
    const oldToken = extractToken(emailer.sent[0].text);

    // Rename: no email sent, token untouched.
    const renamed = await updateParticipant(db, emailer, BASE, p.id, { name: "Robert" });
    expect(renamed.participant.name).toBe("Robert");
    expect(renamed.emailChanged).toBe(false);
    expect(emailer.sent).toHaveLength(2);
    expect((await participantForToken(db, "edit-p", oldToken))?.id).toBe(p.id);

    // Email change: invite goes to the new address, old link dies.
    const changed = await updateParticipant(db, emailer, BASE, p.id, { email: "Robert@New.org " });
    expect(changed.emailChanged).toBe(true);
    expect(changed.participant.email).toBe("robert@new.org");
    expect(emailer.sent).toHaveLength(3);
    expect(emailer.sent[2].to).toBe("robert@new.org");
    expect(await participantForToken(db, "edit-p", oldToken)).toBeNull();
    const newToken = extractToken(emailer.sent[2].text);
    expect((await participantForToken(db, "edit-p", newToken))?.id).toBe(p.id);

    // Guards: duplicate email, empty name, nonsense email.
    await expect(updateParticipant(db, emailer, BASE, p.id, { email: "zed@example.org" })).rejects.toThrow(/already uses/);
    await expect(updateParticipant(db, emailer, BASE, p.id, { name: "  " })).rejects.toThrow(/empty/);
    await expect(updateParticipant(db, emailer, BASE, p.id, { email: "not-an-email" })).rejects.toThrow(/email address/);
  });

  it("rejects bad slugs and durations", async () => {
    const base = { name: "X", roundDurationS: 600, breakDurationS: 60 };
    await expect(createTournament(db, { ...base, slug: "Bad Slug" })).rejects.toThrow();
    await expect(createTournament(db, { ...base, slug: "-leading" })).rejects.toThrow();
    await expect(createTournament(db, { ...base, slug: "ok-slug", roundDurationS: 0 })).rejects.toThrow();
  });
});

describe("drafts", () => {
  it("saves and revises one draft per participant, with word counts", async () => {
    const emailer = new ConsoleEmailer();
    const t = await createTournament(db, { slug: "drafts", name: "D", roundDurationS: 600, breakDurationS: 60 });
    const p = await addParticipant(db, emailer, BASE, t.id, { name: "Cy", email: "cy@example.org" });

    const v1 = await saveDraft(db, p.id, "# Title\n\nOne two three.");
    expect(v1.wordCount).toBe(4);
    const v2 = await saveDraft(db, p.id, "Rewritten entirely, five words now.");
    expect(v2.id).toBe(v1.id);
    expect(v2.wordCount).toBe(5);

    const status = await submissionStatus(db, t.id);
    expect(status).toHaveLength(1);
    expect(status[0].draft?.bodyMd).toBe("Rewritten entirely, five words now.");
  });

  it("enforces the submission deadline and lets the admin move or clear it until publication", async () => {
    const emailer = new ConsoleEmailer();
    const t = await createTournament(db, { slug: "deadline", name: "D", roundDurationS: 600, breakDurationS: 60 });
    const p = await addParticipant(db, emailer, BASE, t.id, { name: "Late", email: "late@example.org" });
    await saveDraft(db, p.id, "in time");

    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 60 * 60_000);
    const { updateSubmissionDeadline } = await import("./tournament-service");

    await updateSubmissionDeadline(db, t.id, past);
    await expect(saveDraft(db, p.id, "too late")).rejects.toThrow(/deadline has passed/);

    // Extending the deadline reopens submissions; clearing it does too.
    await updateSubmissionDeadline(db, t.id, future);
    await saveDraft(db, p.id, "revised in extra time");
    await updateSubmissionDeadline(db, t.id, null);
    await saveDraft(db, p.id, "revised with no deadline");

    // After publication the deadline is no longer editable.
    const p2 = await addParticipant(db, emailer, BASE, t.id, { name: "Two", email: "two@example.org" });
    await saveDraft(db, p2.id, "second draft");
    const { publishBracket } = await import("./runtime-service");
    await publishBracket(db, emailer, BASE, t.id, 9);
    await expect(updateSubmissionDeadline(db, t.id, future)).rejects.toThrow(/ended/);
  });

  it("roster freezes and submissions close outside the submission phase", async () => {
    const emailer = new ConsoleEmailer();
    const t = await createTournament(db, { slug: "frozen", name: "F", roundDurationS: 600, breakDurationS: 60 });
    const p = await addParticipant(db, emailer, BASE, t.id, { name: "Di", email: "di@example.org" });
    const { tournaments } = await import("../db/schema");
    const { eq } = await import("drizzle-orm");
    await db.update(tournaments).set({ phase: "convening" }).where(eq(tournaments.id, t.id));

    await expect(saveDraft(db, p.id, "too late")).rejects.toThrow(/closed/);
    await expect(addParticipant(db, emailer, BASE, t.id, { name: "E", email: "e@example.org" })).rejects.toThrow(/frozen/);
    await expect(removeParticipant(db, p.id)).rejects.toThrow(/frozen/);
  });
});
