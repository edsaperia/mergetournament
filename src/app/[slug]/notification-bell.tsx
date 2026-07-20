"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Browser notifications for participants who wander during breaks: fires
 * when your merge opens, when the round enters its final stretch, and when
 * the tournament completes. Transitions are detected across SSE refreshes
 * by comparing successive prop snapshots.
 */
export function NotificationBell({
  myOpenMergeId,
  roundNo,
  remainingS,
  warnAtS,
  phase,
}: {
  myOpenMergeId: string | null;
  roundNo: number | null;
  remainingS: number | null;
  warnAtS: number;
  phase: string;
}) {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const prev = useRef({ mergeId: null as string | null, warned: null as number | null, phase });

  useEffect(() => {
    setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);

  useEffect(() => {
    if (permission !== "granted") return;
    const notify = (title: string, body: string) => {
      try {
        new Notification(title, { body, icon: "/icon.svg" });
      } catch {
        // some browsers require a service worker; fail quietly
      }
    };
    const p = prev.current;
    if (myOpenMergeId && myOpenMergeId !== p.mergeId) {
      notify("Your merge is open", "You're negotiating this round — head to your workspace.");
    }
    if (
      roundNo !== null &&
      remainingS !== null &&
      remainingS <= warnAtS &&
      remainingS > 0 &&
      p.warned !== roundNo
    ) {
      notify(`Round ${roundNo}: time is running low`, "Lock in your merge before the clock expires.");
      p.warned = roundNo;
    }
    if (phase === "complete" && p.phase !== "complete") {
      notify("The tournament is complete", "A canonical text has emerged.");
    }
    p.mergeId = myOpenMergeId;
    p.phase = phase;
  }, [permission, myOpenMergeId, roundNo, remainingS, warnAtS, phase]);

  if (permission === "unsupported" || permission === "denied") return null;
  if (permission === "granted") return null;
  return (
    <button
      type="button"
      onClick={async () => setPermission(await Notification.requestPermission())}
      className="rounded-lg border border-line px-3 py-2 text-sm hover:bg-panel"
      title="Get notified when your merge opens or a round is ending"
    >
      🔔 Notify me
    </button>
  );
}
