/**
 * Schedule arithmetic (SPEC §4 Phase 2 step 3, §7).
 *
 * All times here are "effective seconds since Begin": real elapsed time minus
 * total paused time. Converting a wall-clock instant into effective time is
 * the job of `effectiveNow`; everything else is pure arithmetic on that axis,
 * so pauses need no special handling downstream.
 *
 * The schedule is a ceiling, not a promise: a round may close early, which
 * shifts every subsequent segment forward.
 */

export interface ScheduleConfig {
  numRounds: number;
  roundDurationS: number;
  breakDurationS: number;
}

/** What has actually happened so far, indexed by round (0-based array for rounds 1..R). */
export interface RoundProgress {
  /** Effective time the round opened, if it has. */
  actualStart?: number;
  /** Effective time the round closed (early or on the clock), if it has. */
  actualClose?: number;
}

function checkConfig(c: ScheduleConfig): void {
  if (!Number.isInteger(c.numRounds) || c.numRounds < 1) {
    throw new Error(`numRounds must be a positive integer, got ${c.numRounds}`);
  }
  if (c.roundDurationS <= 0 || c.breakDurationS < 0) {
    throw new Error(`durations invalid: round=${c.roundDurationS}, break=${c.breakDurationS}`);
  }
}

/** Convert a wall-clock instant to effective seconds since Begin. */
export function effectiveNow(
  nowMs: number,
  begunAtMs: number,
  totalPausedS: number,
  pausedAtMs?: number
): number {
  const t = pausedAtMs !== undefined ? Math.min(pausedAtMs, nowMs) : nowMs;
  return (t - begunAtMs) / 1000 - totalPausedS;
}

/**
 * Projected start of each round in effective seconds, honouring actual closes
 * where known: round 1 starts at 0; round r+1 starts one break after round r's
 * close (actual if recorded, else its full-duration expiry).
 */
export function projectedStarts(config: ScheduleConfig, progress: readonly RoundProgress[]): number[] {
  checkConfig(config);
  const starts: number[] = [];
  for (let r = 0; r < config.numRounds; r++) {
    if (r === 0) {
      starts.push(progress[0]?.actualStart ?? 0);
      continue;
    }
    const prev = progress[r - 1];
    const prevClose = prev?.actualClose ?? starts[r - 1] + config.roundDurationS;
    starts.push(progress[r]?.actualStart ?? prevClose + config.breakDurationS);
  }
  return starts;
}

/** The scheduled (pre-tournament) start offsets: no early closes yet. */
export function scheduledStarts(config: ScheduleConfig): number[] {
  return projectedStarts(config, []);
}

/** Full-duration length of the whole tournament in seconds. */
export function totalDurationS(config: ScheduleConfig): number {
  checkConfig(config);
  return config.numRounds * config.roundDurationS + (config.numRounds - 1) * config.breakDurationS;
}

/**
 * The global countdown: effective seconds until the final merge locks,
 * assuming every remaining round and break runs its full duration.
 */
export function globalRemainingS(
  config: ScheduleConfig,
  progress: readonly RoundProgress[],
  nowEffectiveS: number
): number {
  const finalProgress = progress[config.numRounds - 1];
  if (finalProgress?.actualClose !== undefined) return 0;
  const starts = projectedStarts(config, progress);
  const finalEnd = starts[config.numRounds - 1] + config.roundDurationS;
  return Math.max(0, finalEnd - nowEffectiveS);
}

/**
 * Warning thresholds for a round countdown, scaled so rapid tournaments
 * aren't born amber: warn at 5 minutes or 20% of the round (whichever is
 * smaller), danger at 1 minute or 5%.
 */
export function warnThresholds(roundDurationS: number): { warnAtS: number; dangerAtS: number } {
  return {
    warnAtS: Math.min(300, Math.round(roundDurationS * 0.2)),
    dangerAtS: Math.min(60, Math.round(roundDurationS * 0.05)),
  };
}

/** Seconds left on one round's own clock (the workspace countdown). */
export function roundRemainingS(
  config: ScheduleConfig,
  progress: readonly RoundProgress[],
  round: number,
  nowEffectiveS: number
): number {
  if (!Number.isInteger(round) || round < 1 || round > config.numRounds) {
    throw new Error(`round out of range: ${round}`);
  }
  if (progress[round - 1]?.actualClose !== undefined) return 0;
  const starts = projectedStarts(config, progress);
  return Math.max(0, starts[round - 1] + config.roundDurationS - nowEffectiveS);
}
