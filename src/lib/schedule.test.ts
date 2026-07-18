import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  effectiveNow,
  globalRemainingS,
  projectedStarts,
  roundRemainingS,
  ScheduleConfig,
  scheduledStarts,
  totalDurationS,
  RoundProgress,
} from "./schedule";

const anyConfig = fc.record({
  numRounds: fc.integer({ min: 1, max: 12 }),
  roundDurationS: fc.integer({ min: 60, max: 7200 }),
  breakDurationS: fc.integer({ min: 0, max: 3600 }),
});

describe("scheduledStarts / totalDurationS", () => {
  it("spaces rounds by round + break duration", () => {
    fc.assert(
      fc.property(anyConfig, (config) => {
        const starts = scheduledStarts(config);
        expect(starts[0]).toBe(0);
        for (let r = 1; r < config.numRounds; r++) {
          expect(starts[r]).toBe(starts[r - 1] + config.roundDurationS + config.breakDurationS);
        }
      })
    );
  });

  it("total duration = R rounds + R-1 breaks, and equals the last round's scheduled end", () => {
    fc.assert(
      fc.property(anyConfig, (config) => {
        const total = totalDurationS(config);
        expect(total).toBe(
          config.numRounds * config.roundDurationS + (config.numRounds - 1) * config.breakDurationS
        );
        const starts = scheduledStarts(config);
        expect(starts[config.numRounds - 1] + config.roundDurationS).toBe(total);
      })
    );
  });
});

describe("early closes", () => {
  it("shifts the projected final end earlier by exactly the total time saved", () => {
    fc.assert(
      fc.property(
        anyConfig,
        fc.array(fc.integer({ min: 0, max: 59 }), { minLength: 12, maxLength: 12 }),
        (config, savings) => {
          // Simulate every round closing `savings[r]` seconds early, in order.
          const progress: RoundProgress[] = [];
          let start = 0;
          let saved = 0;
          for (let r = 0; r < config.numRounds; r++) {
            const close = start + config.roundDurationS - savings[r];
            progress.push({ actualStart: start, actualClose: close });
            saved += savings[r];
            start = close + config.breakDurationS;
          }
          const lastClose = progress[config.numRounds - 1].actualClose!;
          expect(lastClose).toBe(totalDurationS(config) - saved);
        }
      )
    );
  });

  it("propagates a single early close through all later projected starts", () => {
    fc.assert(
      fc.property(anyConfig, fc.integer({ min: 1, max: 59 }), (config, saving) => {
        fc.pre(config.numRounds >= 2);
        const baseline = scheduledStarts(config);
        const progress: RoundProgress[] = [
          { actualStart: 0, actualClose: config.roundDurationS - saving },
        ];
        const shifted = projectedStarts(config, progress);
        for (let r = 1; r < config.numRounds; r++) {
          expect(shifted[r]).toBe(baseline[r] - saving);
        }
      })
    );
  });
});

describe("globalRemainingS", () => {
  it("equals the full duration at Begin with no progress", () => {
    fc.assert(
      fc.property(anyConfig, (config) => {
        expect(globalRemainingS(config, [], 0)).toBe(totalDurationS(config));
      })
    );
  });

  it("never increases as time passes (fixed progress)", () => {
    fc.assert(
      fc.property(
        anyConfig,
        fc.integer({ min: 0, max: 100_000 }),
        fc.integer({ min: 0, max: 100_000 }),
        (config, t1, dt) => {
          const a = globalRemainingS(config, [], t1);
          const b = globalRemainingS(config, [], t1 + dt);
          expect(b).toBeLessThanOrEqual(a);
        }
      )
    );
  });

  it("is zero once the final round has closed, and never negative", () => {
    fc.assert(
      fc.property(anyConfig, fc.integer({ min: 0, max: 1_000_000 }), (config, now) => {
        const progress: RoundProgress[] = Array.from({ length: config.numRounds }, () => ({}));
        progress[config.numRounds - 1] = { actualStart: 0, actualClose: 1 };
        expect(globalRemainingS(config, progress, now)).toBe(0);
        expect(globalRemainingS(config, [], now)).toBeGreaterThanOrEqual(0);
      })
    );
  });

  it("drops by the time saved when a round closes early", () => {
    fc.assert(
      fc.property(anyConfig, fc.integer({ min: 1, max: 59 }), (config, saving) => {
        fc.pre(config.numRounds >= 2);
        const closeAt = config.roundDurationS - saving;
        const onTime = globalRemainingS(config, [{ actualStart: 0 }], closeAt);
        const early = globalRemainingS(
          config,
          [{ actualStart: 0, actualClose: closeAt }],
          closeAt
        );
        expect(onTime - early).toBe(saving);
      })
    );
  });
});

describe("roundRemainingS", () => {
  it("shows the full round duration at a round's start and zero once closed", () => {
    fc.assert(
      fc.property(anyConfig, (config) => {
        expect(roundRemainingS(config, [{ actualStart: 0 }], 1, 0)).toBe(config.roundDurationS);
        expect(
          roundRemainingS(config, [{ actualStart: 0, actualClose: 10 }], 1, 20)
        ).toBe(0);
      })
    );
  });

  it("rejects out-of-range rounds", () => {
    const config: ScheduleConfig = { numRounds: 3, roundDurationS: 600, breakDurationS: 300 };
    expect(() => roundRemainingS(config, [], 0, 0)).toThrow();
    expect(() => roundRemainingS(config, [], 4, 0)).toThrow();
  });
});

describe("effectiveNow", () => {
  it("subtracts pauses and freezes while paused", () => {
    const begunAt = 1_000_000;
    // 100s in, 30s of past pauses:
    expect(effectiveNow(begunAt + 100_000, begunAt, 30)).toBe(70);
    // Currently paused since t=+80s: effective clock stays frozen as wall time advances.
    const frozen = effectiveNow(begunAt + 200_000, begunAt, 30, begunAt + 80_000);
    expect(frozen).toBe(50);
    expect(effectiveNow(begunAt + 500_000, begunAt, 30, begunAt + 80_000)).toBe(frozen);
  });
});
