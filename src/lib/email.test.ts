import { describe, expect, it } from "vitest";
import { fmtEventLocal, inviteEmail, scheduleLine, tournamentCreatedEmail } from "./email";

const base = {
  submissionDeadline: null,
  publishAt: null,
  startAt: null,
  roundDurationS: 1800,
  breakDurationS: 600,
  tzOffsetMin: 0,
};

describe("fmtEventLocal", () => {
  it("formats in the event's timezone, not the server's", () => {
    const instant = new Date("2026-07-22T17:30:00Z");
    expect(fmtEventLocal(instant, 0)).toBe("Wed 22 Jul, 17:30");
    // London summer time: 60 minutes ahead of UTC -> offset -60.
    expect(fmtEventLocal(instant, -60)).toBe("Wed 22 Jul, 18:30");
    // New York: 240 behind.
    expect(fmtEventLocal(instant, 240)).toBe("Wed 22 Jul, 13:30");
  });
});

describe("scheduleLine", () => {
  it("says something sensible when nothing is scheduled", () => {
    const line = scheduleLine(base);
    expect(line).toContain("Timing is still being decided");
    expect(line).toContain("Rounds last 30 minutes, and the breaks between them 10 minutes");
  });

  it("gives exact durations instead of rounding to minutes (the 30 Sep playtest: 150 s rounds, 30 s breaks)", () => {
    const line = scheduleLine({ ...base, roundDurationS: 150, breakDurationS: 30 });
    expect(line).toContain("Rounds last 2 minutes 30 seconds, and the breaks between them 30 seconds");
    expect(line).toContain("gets 1 minute more");
    expect(line).not.toContain("3 minutes");
  });

  it("includes deadline and start when known, event-local", () => {
    const line = scheduleLine({
      ...base,
      submissionDeadline: new Date("2026-07-22T17:30:00Z"),
      startAt: new Date("2026-07-22T18:00:00Z"),
      tzOffsetMin: -60,
    });
    expect(line).toContain("Drafts are due Wed 22 Jul, 18:30.");
    expect(line).toContain("Round 1 starts Wed 22 Jul, 19:00.");
    expect(line).not.toContain("Timing is still being decided");
  });

  it("falls back to the tournament start when only publishAt is set", () => {
    const line = scheduleLine({ ...base, publishAt: new Date("2026-07-22T18:00:00Z") });
    expect(line).toContain("The tournament starts Wed 22 Jul, 18:00.");
  });
});

describe("inviteEmail", () => {
  it("leads with who invited you, then the intro, then the schedule, then the link", () => {
    const email = inviteEmail({
      to: "p@x.org",
      participantName: "Pat",
      tournamentName: "Club Constitution",
      adminName: "Ada",
      intro: "We are drafting our club's constitution.",
      schedule: "Drafts are due Wed 22 Jul, 18:30.",
      magicLink: "http://x/club/auth/tok123",
      baseUrl: "http://x",
    });
    const t = email.text;
    expect(t).toContain('Ada has invited you to "Club Constitution"');
    expect(t.indexOf("invited you")).toBeLessThan(t.indexOf("drafting our club"));
    expect(t.indexOf("drafting our club")).toBeLessThan(t.indexOf("Drafts are due"));
    expect(t.indexOf("Drafts are due")).toBeLessThan(t.indexOf("/auth/tok123"));
    // The magic link is the FIRST /auth/ URL (dev-link extraction depends on it).
    expect(t.match(/https?:\S+\/auth\/\S+/)?.[0]).toBe("http://x/club/auth/tok123");
    expect(t).toContain("New to merge tournaments?");
  });

  it("the operator notification names the creator and links pages, never tokens", () => {
    const email = tournamentCreatedEmail({
      to: "op@x.org",
      tournamentName: "Club Constitution",
      tournamentUrl: "http://x/club",
      creatorName: "Ada",
      creatorEmail: "ada@example.org",
      sysadminUrl: "http://x/sysadmin",
    });
    expect(email.subject).toBe("New tournament: Club Constitution");
    expect(email.text).toContain("Ada <ada@example.org>");
    expect(email.text).toContain("http://x/club");
    expect(email.text).toContain("http://x/sysadmin");
    // The operator auth link must never appear in email.
    expect(email.text).not.toMatch(/\/sysadmin\/auth/);
  });

  it("the admin's own invite has no invited-by line and empty parts collapse", () => {
    const email = inviteEmail({
      to: "a@x.org",
      participantName: "Ada",
      tournamentName: "Club Constitution",
      selfIsAdmin: true,
      intro: "  ",
      magicLink: "http://x/club/auth/tok456",
    });
    expect(email.text).toContain("You're the administrator");
    expect(email.text).not.toContain("has invited you");
    expect(email.text).not.toContain("New to merge tournaments?");
  });
});

describe("the admin's own invite", () => {
  it("doesn't tell the admin to write a draft", () => {
    const email = inviteEmail({
      to: "a@x.org",
      participantName: "Morgan",
      tournamentName: "Club Constitution",
      selfIsAdmin: true,
      magicLink: "http://x/club/auth/tok",
    });
    expect(email.text).toContain("You're the administrator");
    expect(email.text).not.toContain("write your draft");
    expect(email.text).toContain("run the tournament");
  });
});

describe("a participant's invite with no admin on record", () => {
  it("still gets the participant wording, not the admin's", () => {
    const email = inviteEmail({
      to: "p@x.org",
      participantName: "Pat",
      tournamentName: "Club Constitution",
      magicLink: "http://x/club/auth/tok",
    });
    expect(email.text).toContain(`You're invited to "Club Constitution"`);
    expect(email.text).toContain("write your draft");
    expect(email.text).not.toContain("administrator");
    expect(email.text).not.toContain("run the tournament");
  });
});
