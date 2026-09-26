# Outstanding issues

Deferred work. Each item says why it waits and the checkable condition that makes it time to act.

| Item | Why deferred | Condition to act | Where |
| --- | --- | --- | --- |
| Drop the `sharp` and `next → postcss` entries from `overrides` | Added before Next shipped fixed versions; Next 16.3.6 now requires `sharp ^0.35.4` and `postcss 8.5.23` itself. The lockfile holds the fixed versions (sharp 0.35.4, postcss 8.5.28), so the entries only lower the floor. Left in to keep the upgrade minimal. The `esbuild` entry is still needed for drizzle-kit. | Ed rules on it (issue #1, FINAL call 1) | `package.json` `overrides` |
| Let `next dev` add its managed block to `AGENTS.md` | Since 16.3, `next dev` run by an AI agent upserts a `<!-- BEGIN:nextjs-agent-rules -->` block into `AGENTS.md`; ours has the same text without the markers, so the first agent run leaves `AGENTS.md` modified. | `git status` shows `AGENTS.md` modified after a `next dev` run | `AGENTS.md` |
