# Outstanding issues

Deferred work. Each item says why it waits and the checkable condition that makes it time to act.

| Item | Why deferred | Condition to act | Where |
| --- | --- | --- | --- |
| Drop the unused `active_choice_a` / `active_choice_b` merge columns (and the `advance_choice` enum if nothing else uses it). The decision window reads the sole active bearer's accept vote instead. | A drop is a migration that runs on deploy and discards the choices recorded in past tournaments; deploys are Ed's call. | Ed has approved shipping a migration that drops them. | `src/db/schema.ts:212`, new file in `drizzle/` |
