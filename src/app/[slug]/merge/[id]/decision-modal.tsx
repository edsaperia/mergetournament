"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { carrierLine } from "../../../../lib/carrier";
import { countWords } from "../../../../lib/text";
import { workspaceAction, type ActionState } from "../../../../server/actions";
import type { WorkspaceAction } from "../../../../services/runtime-service";
import { ActionStatus } from "../../../action-status";
import { Countdown } from "../../../live";
import { Modal } from "../../../modal";
import { NumberedText } from "../../../numbered-text";
import { Button } from "../../../ui";

const initial: ActionState = { ok: true, message: "" };

/** Lines of the frozen text the confirmation strip shows from each end. */
const STRIP_HEAD = 3;
const STRIP_TAIL = 3;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The decision modal (SPEC §4, the decision window): once the clock expires
 * the text is frozen, and each bearer of an unfinished merge gets this for the
 * window's 60 seconds — accept or reject the merge, choose who carries it.
 * Any press also counts as presence. Not dismissible: the system removes it
 * when the merge resolves or the window ends.
 */
export function DecisionModal({
  slug,
  mergeId,
  mySide,
  names,
  proposedBy,
  myVote,
  myPref,
  partnerPref,
  iAmActive,
  partnerActive,
  finalRound,
  workingText,
  remainingS,
}: {
  slug: string;
  mergeId: string;
  mySide: "A" | "B";
  names: { A: string; B: string };
  /** The one accept vote cast so far, if any. */
  proposedBy: "A" | "B" | null;
  /** My last pressed window vote (working = Accept, input = Reject), if any. */
  myVote: "working" | "input" | null;
  myPref: "A" | "B" | null;
  partnerPref: "A" | "B" | null;
  iAmActive: boolean;
  partnerActive: boolean;
  finalRound: boolean;
  workingText: string;
  remainingS: number;
}) {
  const [state, dispatch, pending] = useActionState(
    async (_prev: ActionState, formData: FormData): Promise<ActionState> => {
      const intent = String(formData.get("intent"));
      const action: WorkspaceAction =
        intent === "accept"
          ? { type: "accept" }
          : intent === "reject"
            ? { type: "reject" }
            : { type: "selectBearer", pref: intent === "bearerA" ? "A" : "B" };
      return workspaceAction(slug, mergeId, action);
    },
    initial
  );

  const [showAll, setShowAll] = useState(false);
  const partner = names[mySide === "A" ? "B" : "A"];
  const iAccepted = proposedBy === mySide;
  const partnerAccepted = proposedBy !== null && proposedBy !== mySide;
  const blank = workingText.trim() === "";
  const lines = workingText.split("\n");
  // Confirmation strip: the modal confirms which text, it isn't for rereading.
  const excerpt = !showAll && lines.length > STRIP_HEAD + STRIP_TAIL + 2;
  // What the window's end does (resolveMerge): both accept-votes lock; else,
  // with both bearers active this round, a coin flip between the inputs; with
  // one, their accept-vote advances the merge, anything else their input;
  // with none, abandoned. Worded for who is active now: one short sentence,
  // and the full rules behind "what if…" (short enough for a 360×640 phone).
  const both = `Both accept: ${finalRound ? "it becomes the canonical text" : "it locks in"}.`;
  const orFlip = "it's both accepting or a coin flip between the input texts";
  const variant = iAmActive && partnerActive ? "both" : iAmActive ? "me" : partnerActive ? "partner" : "none";
  const rules = {
    both: {
      short: `${both} Anything else: a coin flip between the input texts.`,
      full: `${both} Anything else: a coin flip picks one input text to advance unchanged.`,
    },
    me: {
      short: `${both} If ${partner} stays silent, your Accept advances this merge.`,
      full:
        `${both} While ${partner} stays silent, your Accept advances this merge and anything else advances ` +
        `your own input; once ${partner} responds, ${orFlip}.`,
    },
    partner: {
      short: `${both} If you stay silent, ${partner}'s Accept advances this merge.`,
      full:
        `${both} If you stay silent, ${partner}'s Accept advances this merge and anything else advances ` +
        `their own input; once you respond, ${orFlip}.`,
    },
    none: {
      short: `${both} If nobody responds, the merge is abandoned.`,
      full:
        `${both} If just one of you responds, their Accept advances this merge and anything else their own ` +
        `input; if you both respond, ${orFlip}; if neither does, the merge is abandoned.`,
    },
  }[variant];
  // Who carries: with one bearer active, whatever advances at the window's
  // end is theirs to carry (resolveMerge ignores the picks); the picks count
  // only if both accept and the merge locks.
  const picks = mySide === "A" ? { A: myPref, B: partnerPref } : { A: partnerPref, B: myPref };
  // (The partner-only case needs no extra line: the rules line already says
  // their Accept advances while you stay silent, and the picks count once you respond.)
  const carrier =
    variant === "me"
      ? `While ${partner} stays silent, you carry whatever advances; your pick counts only if ${partner} accepts too.`
      : carrierLine(mySide, names, picks);
  // Expanded for one variant only, so a change of who is active collapses it.
  const [whatIfFor, setWhatIfFor] = useState<string | null>(null);
  const whatIf = whatIfFor === variant;
  const rulesRef = useRef<HTMLSpanElement>(null);
  const [moreBelow, setMoreBelow] = useState(false);
  const measureRules = useCallback(() => {
    const el = rulesRef.current;
    setMoreBelow(el !== null && el.scrollTop + el.clientHeight < el.scrollHeight - 1);
  }, []);
  useEffect(() => {
    measureRules();
    const el = rulesRef.current;
    if (!el) return;
    const observer = new ResizeObserver(measureRules);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measureRules, whatIf, rules.full]);

  return (
    // Header and footer stay put; only the middle scrolls, so the buttons
    // are always in reach however long the text or small the screen.
    <Modal label="Time is up — decide on the merge" className="flex max-w-2xl flex-col">
      {/* Smaller type on a phone, so on 360×640 the confirmation-strip's first line stays in view. */}
      <div className="flex shrink-0 items-baseline justify-between gap-2 border-b border-edge px-5 py-3 sm:py-4">
        <p className="text-base font-bold sm:text-xl">Time is up — the text is frozen</p>
        <Countdown remainingS={remainingS} className="shrink-0 text-xl font-bold text-warn sm:text-2xl" dangerAtS={15} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-5 py-3 sm:gap-3 sm:py-4">
        {!iAmActive && <p className="text-sm font-semibold text-warn sm:text-base">Are you still here? Any button below counts.</p>}
        <p className="text-xs text-muted sm:text-sm">
          The merge you would accept · {plural(countWords(workingText), "word")} · {plural(lines.length, "line")}
        </p>
        <div className="rounded-md border border-edge p-3">
          {blank ? (
            <p className="text-faint">(blank)</p>
          ) : excerpt ? (
            <>
              <NumberedText body={lines.slice(0, STRIP_HEAD).join("\n")} />
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="my-1 w-full rounded-md py-1 text-center text-xs text-muted hover:bg-panel"
              >
                ⋯ show all {lines.length} lines ⋯
              </button>
              <NumberedText body={lines.slice(-STRIP_TAIL).join("\n")} firstLine={lines.length - STRIP_TAIL + 1} />
            </>
          ) : (
            <NumberedText body={workingText} />
          )}
        </div>
      </div>

      {/* Tighter on a phone too, so the expanded rules leave the strip's first line in view at 360×640. */}
      <form action={dispatch} className="flex shrink-0 flex-col gap-2 border-t border-edge bg-panel px-5 py-3 sm:gap-3 sm:py-4">
        {!finalRound && (
          <fieldset className="rounded-md border border-edge p-3 text-sm">
            <legend className="px-1 text-muted">Who carries the result forward?</legend>
            <div className="flex flex-wrap gap-2">
              {(["A", "B"] as const).map((s) => (
                <Button
                  key={s}
                  variant={myPref === s ? "primary" : "secondary"}
                  name="intent"
                  value={`bearer${s}`}
                  disabled={pending}
                >
                  {names[s]}
                </Button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">{carrier}</p>
          </fieldset>
        )}

        {/* The rules sit with the buttons so they are never below the fold. Collapsed, "what if…" follows
            the short line; expanded, the full rules take a capped box (five lines, enough for every variant
            at 360 px) and "less" sits below it, so the button is always in view and keeps keyboard focus. */}
        <div className="text-xs text-muted">
          <span className={whatIf ? "relative block" : ""}>
            <span
              ref={rulesRef}
              onScroll={measureRules}
              className={whatIf ? "block max-h-20 overflow-y-auto" : ""}
            >
              {whatIf ? rules.full : rules.short}
            </span>
            {/* Only on a screen too narrow for five lines: a fade says there is more to scroll to. */}
            {whatIf && moreBelow && (
              <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-linear-to-t from-panel" />
            )}
          </span>{" "}
          <button
            type="button"
            aria-expanded={whatIf}
            onClick={() => setWhatIfFor(whatIf ? null : variant)}
            className="whitespace-nowrap underline underline-offset-2 hover:text-foreground"
          >
            {whatIf ? "less" : "what if…"}
          </button>
        </div>
        {iAccepted && <p className="text-sm text-warn">You accepted — waiting for {partner}.</p>}
        {partnerAccepted && (
          <p className="text-sm text-warn">{`${partner} has accepted. Accept too and the merge locks in.`}</p>
        )}
        {/* Side by side at every width: a wrapped pair doubles the footer on a phone. */}
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button size="lg" variant={iAccepted ? "primary" : "secondary"} name="intent" value="accept" disabled={pending}>
            Accept the Merge
          </Button>
          <Button size="lg" variant={myVote === "input" && !iAccepted ? "primary" : "secondary"} name="intent" value="reject" disabled={pending}>
            Reject the Merge
          </Button>
        </div>
        <ActionStatus state={state} />
      </form>
    </Modal>
  );
}
