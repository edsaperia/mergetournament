import type { Round, Tournament } from "../../../db/schema";
import { numRounds } from "../../../lib/bracket";
import {
  DECISION_WINDOW_S,
  earliestStarts,
  fmtDuration,
  projectedEnd,
  projectedStarts,
  scheduledStarts,
  wallClockIso,
  type RoundProgress,
} from "../../../lib/schedule";
import {
  beginAction,
  closeSubmissionsAction,
  pauseAction,
  publishBracketAction,
  setDeadlineAction,
} from "../../../server/actions";
import { baseUrl } from "../../../server/config";
import { LocalTime } from "../../local-time";
import { ControlButton } from "./admin-controls";
import { DurationEditor, TimeControl } from "./timeline-controls";

/**
 * The timeline: every stage of the tournament in order, with its time (when
 * known) and its controls. One glance tells a first-time creator what
 * happens, in what sequence, and what they still have to do. Times before
 * Round 1 is scheduled are shown relative to the start ("start +30m").
 */


type Mark = "done" | "current" | "future";

function Row({
  mark,
  stage,
  time,
  slim = false,
  children,
}: {
  mark: Mark;
  stage: React.ReactNode;
  time: React.ReactNode;
  /** Two-column (read-only) layout: any children render under the stage label. */
  slim?: boolean;
  children?: React.ReactNode;
}) {
  // A table from sm up; on a phone each row stacks (stage, then time, then
  // actions) so nothing is clipped at 360 px.
  return (
    <tr
      className={`flex flex-col gap-1 py-2.5 sm:table-row sm:py-0 ${
        mark === "current" ? "bg-wash" : mark === "done" ? "text-muted" : ""
      }`}
    >
      <td className="pr-3 align-top font-medium sm:w-52 sm:py-2.5">
        <span className={`mr-1.5 inline-block w-4 ${mark === "current" ? "text-live-ink" : "text-muted"}`}>
          {mark === "done" ? "✓" : mark === "current" ? "▶" : ""}
        </span>
        {stage}
        {slim && children && <div className="ml-5.5 mt-0.5 font-normal">{children}</div>}
      </td>
      {/* On a phone an unknown time ("—") is noise: shown only in the table. */}
      <td className={`pl-5.5 pr-3 align-top text-muted sm:w-56 sm:py-2.5 sm:pl-0 ${time === "—" ? "hidden sm:table-cell" : ""}`}>
        {time}
      </td>
      {!slim && <td className="min-w-0 pl-5.5 align-top sm:py-2.5 sm:pl-0">{children}</td>}
    </tr>
  );
}

const Or = () => <span className="text-xs text-muted">or</span>;

export function Timeline({
  slug,
  tournament,
  allRounds,
  submitted,
  invited,
  readOnly = false,
}: {
  slug: string;
  tournament: Tournament;
  allRounds: Round[];
  submitted: number;
  /** Non-admin participants on the roster. */
  invited: number;
  /** Participant/observer view: stages and times only — no admin to-dos or controls. */
  readOnly?: boolean;
}) {
  const t = tournament;
  const now = Date.now();
  const prePublish = t.phase === "setup" || t.phase === "submission";
  const begun = Boolean(t.begunAt);
  const deadlinePassed = Boolean(t.submissionDeadline && t.submissionDeadline.getTime() <= now);
  const closed = !prePublish || deadlinePassed;
  const introDone = t.intro.trim() !== "";
  // Ticked only when there is a template: an optional step left alone isn't "done".
  const templateDone = t.defaultSubmission.trim() !== "";
  const inviteDone = invited >= 2;

  const roundCount = prePublish ? numRounds(Math.max(submitted, 2)) : allRounds.length;
  // Times are ceilings: each round may run a decision-window past its clock.
  const config = {
    numRounds: roundCount,
    roundDurationS: t.roundDurationS,
    breakDurationS: t.breakDurationS,
    decisionWindowS: DECISION_WINDOW_S,
  };
  const progress: RoundProgress[] = prePublish
    ? []
    : allRounds.map((r) => ({
        actualStart: r.actualStartS ?? undefined,
        actualClose: r.actualCloseS ?? undefined,
        scheduledStart: r.scheduledStartS,
      }));
  // Starts are shown as the earliest a round can open (printed times leave
  // out decision-windows), with how much later it could be; ends are the latest case.
  const starts = prePublish ? scheduledStarts(config) : projectedStarts(config, progress);
  const earliest = earliestStarts(config, progress);
  const roundEnd = (k: number) => projectedEnd(config, progress, starts, k);
  const slip = (k: number) => (progress[k - 1]?.actualStart !== undefined ? 0 : starts[k - 1] - earliest[k - 1]);

  // Pre-begin, the planned startAt anchors the projection instead.
  const wallIso = (s: number): string | null =>
    wallClockIso(t, s) ?? (t.startAt ? new Date(t.startAt.getTime() + s * 1000).toISOString() : null);

  const Span = ({ fromS, toS, slipS = 0 }: { fromS: number; toS: number; slipS?: number }) => {
    const from = wallIso(fromS);
    const to = wallIso(toS);
    const later = slipS > 0 ? <> (or up to {fmtDuration(slipS)} later)</> : null;
    return from && to ? (
      <>
        <LocalTime iso={from} timeOnly />
        {later} – <LocalTime iso={to} timeOnly />
      </>
    ) : (
      <>
        start +{fmtDuration(fromS)}
        {later} – +{fmtDuration(toS)}
      </>
    );
  };

  // Which row is "you are here". Pre-start it is the earliest unmet step
  // (the template is optional and never blocks; read-only views have no
  // to-do rows, so they start at the clock stages); after that, the clock rules.
  const currentKey =
    t.phase === "complete"
      ? "complete"
      : t.phase === "convening"
        ? "round-1"
        : prePublish
          ? !readOnly && !introDone
            ? "intro"
            : !readOnly && !inviteDone
              ? "invite"
              : closed
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
      roundRows.push(<BreakRow key={`break-${k - 1}`} n={k - 1} />);
    }
    const round = allRounds[k - 1];
    const state = round?.state;
    roundRows.push(
      <Row
        key={`round-${k}`}
        slim={readOnly}
        mark={mark(`round-${k}`, state === "closed")}
        stage={`Round ${k}`}
        time={
          k === 1 && prePublish && !readOnly ? (
            <DurationEditor slug={slug} field="round" minutes={Math.round(t.roundDurationS / 60)} />
          ) : (
            <Span fromS={earliest[k - 1]} toS={roundEnd(k)} slipS={slip(k)} />
          )
        }
      >
        {k === 1 && !begun && !readOnly && (
          <span className="inline-flex flex-wrap items-center gap-2">
            <ControlButton
              small
              action={beginAction.bind(null, slug)}
              label="Start Round 1"
              disabled={t.phase !== "convening"}
              disabledReason="start the tournament first"
              confirmText="Has everyone logged in, found their first partner, and sat down next to them? This starts the clock."
            />
            <Or />
            <TimeControl slug={slug} field="startAt" hasValue={Boolean(t.startAt)} />
            {t.startAt && (
              <span className="text-xs text-muted">
                currently <LocalTime iso={t.startAt.toISOString()} />
              </span>
            )}
          </span>
        )}
        {state === "open" && (
          <span className="inline-flex items-center gap-2 text-sm">
            <span className={t.pausedAt ? "text-warn" : "text-live-ink"}>
              {t.pausedAt ? "paused" : "open now"}
            </span>
            {!readOnly && (
              <ControlButton
                small
                primary={false}
                action={pauseAction.bind(null, slug, Boolean(t.pausedAt))}
                label={t.pausedAt ? "Resume" : "Pause"}
              />
            )}
          </span>
        )}
        {state === "closing" && <span className="text-sm text-warn">decision window — pairs accept or reject</span>}
      </Row>
    );
  }
  // Before the bracket exists, Break 1 is always visible — it carries the
  // break-length picker even when the current draft count projects one round.
  if (prePublish && roundCount === 1) {
    roundRows.push(<BreakRow key="break-1" n={1} />);
  }

  function BreakRow({ n }: { n: number }) {
    const nextStarted = Boolean(progress[n]?.actualStart);
    return (
      <Row
        slim={readOnly}
        mark={mark(`break-${n}`, nextStarted)}
        stage={<span className="font-normal text-muted">Break {n}</span>}
        time={
          n === 1 && prePublish && !readOnly ? (
            <DurationEditor slug={slug} field="break" minutes={Math.round(t.breakDurationS / 60)} />
          ) : (
            // Clock times once the round before has closed; until then only its length is certain.
            progress[n - 1]?.actualClose !== undefined ? (
              <Span fromS={progress[n - 1].actualClose!} toS={earliest[n]} />
            ) : (
              fmtDuration(t.breakDurationS)
            )
          )
        }
      >
        {mark(`break-${n}`, nextStarted) === "current" && (
          <span className="text-sm text-muted">read, lobby, find your next partner</span>
        )}
      </Row>
    );
  }

  return (
    <div className="sm:overflow-x-auto">
      <table className="block w-full border-collapse text-sm sm:table">
        <thead className="hidden sm:table-header-group">
          <tr className="border-b border-edge text-left text-xs uppercase tracking-wide text-muted">
            <th className="py-2 pr-3 font-medium">Stage</th>
            <th className="py-2 pr-3 font-medium">Time</th>
            {!readOnly && <th className="py-2 font-medium">Actions</th>}
          </tr>
        </thead>
        <tbody className="block divide-y divide-edge-faint sm:table-row-group">
          {!readOnly && (
            <>
              <Row mark={mark("intro", introDone)} stage="Write the intro" time="—">
                <a className="underline" href="#intro">Edit the intro →</a>
                <span className="ml-2 text-xs text-muted">
                  what this tournament is about — participants see it in their invite
                </span>
              </Row>
              <Row mark={templateDone ? "done" : "future"} stage="Create template" time="—">
                {prePublish ? (
                  <>
                    <a className="underline" href="#template">Edit template →</a>
                    <span className="ml-2 text-xs text-muted">optional — the text every draft starts from</span>
                  </>
                ) : (
                  <span className="text-xs text-muted">{templateDone ? "drafts started from it" : "not used"}</span>
                )}
              </Row>
              <Row mark={mark("invite", inviteDone)} stage="Invite participants" time="—">
                <a className="underline" href="#roster">Edit the roster →</a>
                <span className="ml-2 text-xs text-muted">
                  {invited} invited · {submitted} draft{submitted === 1 ? "" : "s"} in
                </span>
              </Row>
            </>
          )}
          <Row
            slim={readOnly}
            mark={mark("close", closed)}
            stage="Close submissions"
            time={t.submissionDeadline ? <LocalTime iso={t.submissionDeadline.toISOString()} /> : "—"}
          >
            {prePublish && !closed && !readOnly && (
              <span className="inline-flex flex-wrap items-center gap-2">
                <ControlButton
                  small
                  primary={false}
                  action={closeSubmissionsAction.bind(null, slug)}
                  label="Close now"
                  confirmText="Close submissions now? Participants can no longer edit their drafts."
                />
                <Or />
                <TimeControl slug={slug} field="deadline" hasValue={Boolean(t.submissionDeadline)} />
              </span>
            )}
            {prePublish && closed && !readOnly && (
              <span className="inline-flex flex-wrap items-center gap-2">
                <span className="text-sm">closed — drafts are frozen</span>
                <ControlButton
                  small
                  primary={false}
                  action={setDeadlineAction.bind(null, slug, null, 0)}
                  label="Reopen submissions"
                />
                <Or />
                <TimeControl slug={slug} field="deadline" hasValue={false} />
              </span>
            )}
            {prePublish && closed && readOnly && <span className="text-sm">closed — drafts are frozen</span>}
          </Row>
          <Row
            slim={readOnly}
            mark={mark("start", !prePublish)}
            stage="Start Tournament"
            time={!prePublish ? "" : t.publishAt ? <LocalTime iso={t.publishAt.toISOString()} /> : "—"}
          >
            {prePublish && !readOnly && (
              <span className="inline-flex flex-wrap items-center gap-2">
                <ControlButton
                  small
                  action={publishBracketAction.bind(null, slug)}
                  label="Start Tournament"
                  disabled={!closed || submitted < 2}
                  disabledReason={submitted < 2 ? "needs at least 2 drafts" : "close submissions first"}
                  confirmText={`Start the tournament with ${submitted} drafts? The roster freezes, the bracket is drawn, and everything becomes readable to participants.`}
                />
                <Or />
                <TimeControl slug={slug} field="publishAt" hasValue={Boolean(t.publishAt)} />
              </span>
            )}
            {!prePublish && <span className="text-sm">started — the bracket is drawn</span>}
          </Row>
          {roundRows}
          {prePublish && (
            <tr className="block sm:table-row">
              <td colSpan={readOnly ? 2 : 3} className="block py-2.5 pl-6 text-sm italic text-muted sm:table-cell">
                more rounds will be added as the roster grows
              </td>
            </tr>
          )}
          <Row
            slim={readOnly}
            mark={mark("complete", false)}
            stage="Tournament complete"
            time={
              wallIso(roundEnd(roundCount)) ? (
                <LocalTime iso={wallIso(roundEnd(roundCount))!} />
              ) : (
                <>start +{fmtDuration(roundEnd(roundCount))}</>
              )
            }
          >
            <span className="text-sm">
              {t.phase === "complete" ? "the final text lives at" : "the final text will live at"}{" "}
              <a className="underline" href={`/${slug}/text`}>
                {host}/{slug}/text
              </a>
            </span>
          </Row>
        </tbody>
      </table>
      {!readOnly && (t.phase === "convening" || t.phase === "running") && (
        <p className="mt-2 text-xs text-muted">
          There is deliberately no other live control: no extending a round, no reassigning a pairing, no overriding a flip.
        </p>
      )}
    </div>
  );
}
