import type { ActionState } from "../server/actions";

/** Renders an action's outcome, including the dev-mode magic link. */
export function ActionStatus({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return (
    <div
      className={`rounded-md px-3 py-2 text-sm ${
        state.ok
          ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
          : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
      }`}
    >
      <p>{state.message}</p>
      {state.devLink && (
        <p className="mt-1 break-all font-mono text-xs">
          dev magic link:{" "}
          <a className="underline" href={state.devLink}>
            {state.devLink}
          </a>
        </p>
      )}
    </div>
  );
}
