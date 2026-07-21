import type { Round, Tournament } from "../../../db/schema";
import { numRounds } from "../../../lib/bracket";
import { projectedStarts, scheduledStarts, totalDurationS, type RoundProgress } from "../../../lib/schedule";
import {
  beginAction,
  closeSubmissionsAction,
  pauseAction,
  publishBracketAction,
} from "../../../server/actions";
import { baseUrl } from "../../../server/config";
import { LocalTime } from "../../local-time";
import { ControlButton } from "./admin-controls";
import { DurationsEditor, TimeControl } from "./timeline-controls";

/**
 * The timeline: every stage of the tournament in order, with its time (when
 * known) and its controls. One glance tells a first-time creator what
 * happens, in what sequence, and what they still have to do. Times before
 * Round 1 is scheduled are shown relative to the start ("start +30m").
 */

function fmtOffset(s: number): string {
  const m = Math.round(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

type Mark = "done" | "current" | "future";

function Row({
  mark,
  stage,
  time,
  children,
}: {
  mark: Mark;
  stage: React.ReactNode;
  time: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <tr className={mark === "current" ? "bg-wash" : mark === "done" ? "text-muted" : ""}>
      <td className="w-52 py-2.5 pr-3 align-top font-medium">
        <span className={`mr-1.5 inline-block w-4 ${mark === "current" ? "text-live-ink" : "text-muted"}`}>
          {mark === "done" ? "✓" : mark === "current" ? "▶" : ""}
        </span>
        {stage}
      </td>
      <td className="w-56 py-2.5 pr-3 align-top text-muted">{time}</td>
      <td className="py-2.5 align-top">{children}</td>
    </tr>
  );
}

export function Timeline({
  slug,
  tournament,
  allRounds,
  submitted,
  rosterCount,
}: {
  slug: string;
  tournament: Tournament;
  allRounds: Round[];
  submitted: number;
  rosterCount: number;
}) {
  const t = tournament;
  const now = Date.now();
  const prePublish = t.phase === "setup" || t.phase === "submission";
  const begun = Boolean(t.begunAt);
  const deadlinePassed = Boolean(t.submissionDeadline && t.submissionDeadline.getTime() <= now);
  const closed = !prePublish || deadlinePassed;

  const roundCount = prePublish ? numRounds(Math.max(submitted, 2)) : allRounds.length;
  const config = { numRounds: roundCount, roundDurationS: t.roundDurationS, breakDurationS: t.breakDurationS };
  const progress: RoundProgress[] = prePublish
    ? []
    : allRounds.map((r) => ({ actualStart: r.actualStartS ?? undefined, actualClose: r.actualCloseS ?? undefined }));
  const starts = prePublish ? scheduledStarts(config) : projectedStarts(config, progress);
  const roundEnd = (k: number) => progress[k - 1]?.actualClose ?? starts[k - 1] + t.roundDurationS;

  /** Wall-clock instant for an effective offset, when an anchor exists. */
  const wallIso = (s: number): string | null =>
    t.begunAt
      ? new Date(t.begunAt.getTime() + (t.totalPausedS + s) * 1000).toISOString()
      : t.startAt
        ? new Date(t.startAt.getTime() + s * 1000).toISOString()
        : null;

  const Span = ({ fromS, toS }: { fromS: number; toS: number }) => {
    const from = wallIso(fromS);
    const to = wallIso(toS);
    return from && to ? (
      <>
        <LocalTime iso={from} timeOnly /> – <LocalTime iso={to} timeOnly />
      </>
    ) : (
      <>start +{fmtOffset(fromS)} – +{fmtOffset(toS)}</>
    );
  };

  // Which row is "you are here".
  const currentKey =
    t.phase === "complete"
      ? "complete"
      : t.phase === "convening"
        ? "round-1"
        : prePublish
          ? closed
            ? "start"
            : "close"
          : (() => {
              const open = allRounds.find((r) => r.state === "open" || r.state === "closing");
              if (open) return `round-${open.number}`;
              const next = allRounds.find((r) => r.state === "scheduled");
              return next ? `break-${next.number - 1}` : "complete";
            })();

  const mark = (key: string, done: boolean): Mark => (key === currentKey ? "current" : done ? "done" : "future");
  const host = baseUrl().replace(/^https?:\/\//, "");

  const roundRows: React.ReactNode[] = [];
  for (let k = 1; k <= roundCount; k++) {
    if (k > 1) {
      const nextStarted = Boolean(progress[k - 1]?.actualStart);
      roundRows.push(
        <Row
          key={`break-${k - 1}`}
          mark={mark(`break-${k - 1}`, nextStarted)}
          stage={<span className="font-normal text-muted">Break</span>}
          time={<Span fromS={roundEnd(k - 1)} toS={starts[k - 1]} />}
        >
          {mark(`break-${k - 1}`, nextStarted) === "current" && (
            <span className="text-sm text-muted">read, lobby, find your next partner</span>
          )}
        </Row>
      );
    }
    const round = allRounds[k - 1];
    const state = round?.state;
    roundRows.push(
      <Row
        key={`round-${k}`}
        mark={mark(`round-${k}`, state === "closed")}
        stage={`Round ${k}`}
        time={<Span fromS={starts[k - 1]} toS={roundEnd(k)} />}
      >
        {k === 1 && !begun && (
          <span className="inline-flex flex-wrap items-center gap-2">
            <TimeControl slug={slug} field="startAt" hasValue={Boolean(t.startAt)} />
            {t.phase === "convening" && (
              <ControlButton
                small
                action={beginAction.bind(null, slug)}
                label="Start Round 1 now"
                confirmText="Has everyone logged in, found their first partner, and sat down next to them? This starts the clock."
              />
            )}
          </span>
        )}
        {state === "open" && (
          <span className="inline-flex items-center gap-2 text-sm">
            <span className={t.pausedAt ? "text-amber-600" : "text-live-ink"}>
              {t.pausedAt ? "paused" : "open now"}
            </span>
            <ControlButton
              small
              primary={false}
              action={pauseAction.bind(null, slug, Boolean(t.pausedAt))}
              label={t.pausedAt ? "Resume" : "Pause"}
            />
          </span>
        )}
        {state === "closing" && <span className="text-sm text-amber-600">backstop window — are you still here?</span>}
      </Row>
    );
  }

  return (
    <div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-edge text-left text-xs uppercase tracking-wide text-muted">
            <th className="py-2 pr-3 font-medium">Stage</th>
            <th className="py-2 pr-3 font-medium">Time</th>
            <th className="py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-edge-faint">
          <Row mark="future" stage="Create template" time="—">
            <a className="underline" href="#template">Open the template →</a>
            <span className="ml-2 text-xs text-muted">optional — the text every draft starts from</span>
          </Row>
          <Row mark="future" stage="Invite participants" time="—">
            <a className="underline" href="#roster">Open the roster →</a>
            <span className="ml-2 text-xs text-muted">
              {rosterCount} invited · {submitted} draft{submitted === 1 ? "" : "s"} in
            </span>
          </Row>
          <Row
            mark={mark("close", closed)}
            stage="Close submissions"
            time={t.submissionDeadline ? <LocalTime iso={t.submissionDeadline.toISOString()} /> : "—"}
          >
            {prePublish && !closed && (
              <span className="inline-flex flex-wrap items-center gap-2">
                <TimeControl slug={slug} field="deadline" hasValue={Boolean(t.submissionDeadline)} />
                <ControlButton
                  small
                  primary={false}
                  action={closeSubmissionsAction.bind(null, slug)}
                  label="Close now"
                  confirmText="Close submissions now? Participants can no longer edit their drafts."
                />
              </span>
            )}
            {prePublish && closed && <span className="text-sm">closed — drafts are frozen</span>}
          </Row>
          <Row
            mark={mark("start", !prePublish)}
            stage="Start Tournament"
            time={
              !prePublish ? "" : t.publishAt ? <LocalTime iso={t.publishAt.toISOString()} /> : "—"
            }
          >
            {prePublish ? (
              <span className="inline-flex flex-wrap items-center gap-2">
                <TimeControl slug={slug} field="publishAt" hasValue={Boolean(t.publishAt)} />
                <ControlButton
                  small
                  action={publishBracketAction.bind(null, slug)}
                  label="Start now"
                  disabled={!closed || submitted < 2}
                  disabledReason={
                    submitted < 2 ? "needs at least 2 drafts" : "close submissions first"
                  }
                  confirmText={`Start the tournament with ${submitted} drafts? The roster freezes, the bracket is drawn, and everything becomes readable to participants.`}
                />
              </span>
            ) : (
              <span className="text-sm">started — the bracket is drawn</span>
            )}
          </Row>
          <Row
            mark="future"
            stage={<span className="font-normal text-muted">Round &amp; break length</span>}
            time={<>total ≤ {fmtOffset(totalDurationS(config))}</>}
          >
            {prePublish ? (
              <DurationsEditor
                slug={slug}
                roundMinutes={Math.round(t.roundDurationS / 60)}
                breakMinutes={Math.round(t.breakDurationS / 60)}
              />
            ) : (
              <span className="text-sm text-muted">
                {Math.round(t.roundDurationS / 60)}m rounds · {Math.round(t.breakDurationS / 60)}m breaks (frozen)
              </span>
            )}
          </Row>
          {roundRows}
          <Row
            mark={mark("complete", false)}
            stage="Tournament complete"
            time={
              wallIso(roundEnd(roundCount)) ? (
                <LocalTime iso={wallIso(roundEnd(roundCount))!} />
              ) : (
                <>start +{fmtOffset(roundEnd(roundCount))}</>
              )
            }
          >
            <span className="text-sm">
              the canonical text will live at{" "}
              <a className="underline" href={`/${slug}/text`}>
                {host}/{slug}/text
              </a>
            </span>
          </Row>
        </tbody>
      </table>
      {prePublish && (
        <p className="mt-2 text-xs text-muted">
          Assuming {Math.max(submitted, 2)} drafts → {roundCount} round{roundCount === 1 ? "" : "s"}; the bracket
          redraws as more drafts arrive. Scheduled times run themselves — everything also works with the buttons alone.
        </p>
      )}
      {(t.phase === "convening" || t.phase === "running") && (
        <p className="mt-2 text-xs text-muted">
          There is deliberately no other live control: no extending a round, no reassigning a pairing, no overriding a flip.
        </p>
      )}
    </div>
  );
}
