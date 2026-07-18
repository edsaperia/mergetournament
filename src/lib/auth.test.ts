import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { generateToken, hashToken, signSession, verifySession } from "./auth";

describe("tokens", () => {
  it("generates unique URL-safe tokens", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const t = generateToken();
      expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(seen.has(t)).toBe(false);
      seen.add(t);
    }
  });

  it("hashes deterministically and irreversibly-shaped", () => {
    const t = generateToken();
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).not.toContain(t);
  });
});

describe("sessions", () => {
  const secret = "test-secret";

  it("round-trips any payload", () => {
    fc.assert(
      fc.property(fc.uuid(), fc.uuid(), (participantId, tournamentId) => {
        const cookie = signSession({ participantId, tournamentId }, secret);
        expect(verifySession(cookie, secret)).toEqual({ participantId, tournamentId });
      })
    );
  });

  it("rejects tampering anywhere in the cookie", () => {
    const cookie = signSession({ participantId: "p1", tournamentId: "t1" }, secret);
    fc.assert(
      fc.property(fc.integer({ min: 0, max: cookie.length - 1 }), (i) => {
        const flipped = cookie[i] === "A" ? "B" : "A";
        const tampered = cookie.slice(0, i) + flipped + cookie.slice(i + 1);
        expect(verifySession(tampered, secret)).toBeNull();
      })
    );
  });

  it("rejects the wrong secret, garbage, and structurally-wrong payloads", () => {
    const cookie = signSession({ participantId: "p1", tournamentId: "t1" }, secret);
    expect(verifySession(cookie, "other-secret")).toBeNull();
    expect(verifySession("", secret)).toBeNull();
    expect(verifySession("no-dot-here", secret)).toBeNull();
    expect(verifySession("a.b.c", secret)).toBeNull();
    // Correctly signed but wrong shape:
    const body = Buffer.from(JSON.stringify({ nope: 1 })).toString("base64url");
    const forged = signSession({ participantId: "x", tournamentId: "y" }, secret).split(".")[1];
    void forged;
    expect(verifySession(`${body}.${forged}`, secret)).toBeNull();
  });

  it("refuses an empty secret outright", () => {
    expect(() => signSession({ participantId: "p", tournamentId: "t" }, "")).toThrow();
    expect(() => verifySession("x.y", "")).toThrow();
  });
});
