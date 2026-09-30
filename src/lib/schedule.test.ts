import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  DECISION_WINDOW_S,
  earliestStarts,
  effectiveNow,
  fmtDuration,
  projectedEnd,
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

describe("the decision-window in schedules", () => {
  const withWindow = (c: ScheduleConfig): ScheduleConfig => ({ ...c, decisionWindowS: DECISION_WINDOW_S });

  it("counts a decision-window per round in the total and in every later start", () => {
    fc.assert(
      fc.property(anyConfig, (config) => {
        const c = withWindow(config);
        expect(totalDurationS(c)).toBe(totalDurationS(config) + config.numRounds * DECISION_WINDOW_S);
        const plain = scheduledStarts(config);
        const counted = scheduledStarts(c);
        counted.forEach((s, r) => expect(s).toBe(plain[r] + r * DECISION_WINDOW_S));
        expect(globalRemainingS(c, [], 0)).toBe(totalDurationS(c));
      })
    );
  });

  it("the 30 Sep playtest: 2 rounds of 150s with a 30s break end by 7m, not 5m30s", () => {
    const c: ScheduleConfig = { numRounds: 2, roundDurationS: 150, breakDurationS: 30, decisionWindowS: DECISION_WINDOW_S };
    expect(scheduledStarts(c)).toEqual([0, 240]);
    expect(totalDurationS(c)).toBe(450);
    // Round 1 used its window and closed at 210: round 2 opens at 240, ends by 450.
    expect(projectedStarts(c, [{ actualStart: 0, actualClose: 210 }])).toEqual([0, 240]);
    expect(globalRemainingS(c, [{ actualStart: 0, actualClose: 210 }], 210)).toBe(240);
  });

  it("drops a closed round's unused window from the projection", () => {
    const c: ScheduleConfig = { numRounds: 2, roundDurationS: 150, breakDurationS: 30, decisionWindowS: 60 };
    expect(projectedStarts(c, [{ actualStart: 0, actualClose: 150 }])).toEqual([0, 180]);
  });

  it("never projects a round before its printed start", () => {
    const c: ScheduleConfig = { numRounds: 2, roundDurationS: 150, breakDurationS: 30, decisionWindowS: 60 };
    // Round 1 closed early at 40; round 2 still waits for its printed 180 unless everyone is ready.
    expect(projectedStarts(c, [{ actualStart: 0, actualClose: 40 }, { scheduledStart: 180 }])).toEqual([0, 180]);
    expect(projectedEnd(c, [{ actualStart: 0, actualClose: 40 }], [0, 180], 1)).toBe(40);
    expect(projectedEnd(c, [{ actualStart: 0, actualClose: 40 }], [0, 180], 2)).toBe(390);
  });

  it("leaves the round-countdown (the writing deadline) without the window", () => {
    const c: ScheduleConfig = { numRounds: 2, roundDurationS: 150, breakDurationS: 30, decisionWindowS: 60 };
    expect(roundRemainingS(c, [{ actualStart: 0 }], 1, 0)).toBe(150);
  });
});

describe("fmtDuration", () => {
  it("shows exact lengths instead of rounding to minutes", () => {
    expect(fmtDuration(150)).toBe("2m 30s");
    expect(fmtDuration(30)).toBe("30s");
    expect(fmtDuration(180)).toBe("3m");
    expect(fmtDuration(3900)).toBe("1h 5m");
    expect(fmtDuration(7200)).toBe("2h");
  });
});

describe("shown starts never promise a round later than it can open", () => {
  // The engine (runtime-service tick, without everyone ready): round r opens
  // at max(previous close + break, its printed start); printed starts leave
  // out decision-windows; a round closes anywhere from its opening to its
  // clock plus the decision-window.
  it("the review's example: 3 rounds of 150 s with 30 s breaks show 0 / 180 / 360, ending by 150+60 / 390 / 600", () => {
    const c: ScheduleConfig = { numRounds: 3, roundDurationS: 150, breakDurationS: 30, decisionWindowS: 60 };
    const printed = scheduledStarts({ ...c, decisionWindowS: 0 });
    expect(printed).toEqual([0, 180, 360]);
    const progress: RoundProgress[] = printed.map((s) => ({ scheduledStart: s }));
    progress[0].actualStart = 0;
    expect(earliestStarts(c, progress)).toEqual([0, 180, 360]);
    expect(projectedStarts(c, progress)).toEqual([0, 240, 480]);
    expect(totalDurationS(c)).toBe(690);
  });

  it("shown start ≤ the real opening ≤ latest start, and shown end/total ≥ the real end, at every step", () => {
    fc.assert(
      fc.property(
        anyConfig,
        fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 12, maxLength: 12 }),
        (base, fractions) => {
          const c: ScheduleConfig = { ...base, decisionWindowS: DECISION_WINDOW_S };
          const printed = scheduledStarts({ ...c, decisionWindowS: 0 });
          // Simulate the engine.
          const opens: number[] = [];
          const closes: number[] = [];
          for (let r = 0; r < c.numRounds; r++) {
            opens.push(r === 0 ? 0 : Math.max(closes[r - 1] + c.breakDurationS, printed[r]));
            closes.push(opens[r] + Math.round(fractions[r] * (c.roundDurationS + DECISION_WINDOW_S)));
          }
          // What the display says after rounds 0..k-1 have closed and round k has opened.
          for (let k = 0; k < c.numRounds; k++) {
            const progress: RoundProgress[] = printed.map((s, r) => ({
              scheduledStart: s,
              actualStart: r <= k ? opens[r] : undefined,
              actualClose: r < k ? closes[r] : undefined,
            }));
            const early = earliestStarts(c, progress);
            const late = projectedStarts(c, progress);
            for (let r = k; r < c.numRounds; r++) {
              expect(early[r]).toBeLessThanOrEqual(opens[r]);
              expect(late[r]).toBeGreaterThanOrEqual(opens[r]);
              expect(projectedEnd(c, progress, late, r + 1)).toBeGreaterThanOrEqual(closes[r]);
            }
            expect(opens[k] + globalRemainingS(c, progress, opens[k])).toBeGreaterThanOrEqual(closes[c.numRounds - 1]);
          }
          expect(totalDurationS(c)).toBeGreaterThanOrEqual(closes[c.numRounds - 1]);
        }
      )
    );
  });
});
