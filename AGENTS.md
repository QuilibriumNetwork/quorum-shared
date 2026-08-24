# AGENTS.md

This is the **quorum-shared** package: types, cross-platform UI primitives,
hooks, and sync protocol shared between `quorum-desktop` and `quorum-mobile`.

---

## Verifying a change

Before reporting any code change complete, run `yarn verify` and paste the
verdict block **verbatim**.

- Do not summarise it, and do not report a subset of the rows.
- Do not report `PASS` when the block says `PASS (PARTIAL)` or `FLAKY`. Those
  are distinct verdicts: `PASS (PARTIAL)` means coverage was reduced, `FLAKY`
  means a step went green only on a retry.
- `yarn verify --show-receipt` prints the last run's record, including the
  commit it ran against.

### What it costs, so you can predict before you run it

The gate routes itself from the diff (`scripts/verify/routing.mjs`), so the
cost depends on what changed, not on asking:

- **Docs, styles, images, locales, or a components-only change**: the fast
  tier only, about **3 minutes** (desktop's fast tier: typecheck, lint, unit
  tests, build; measured 2026-08-23). The live tier does not run. Changing
  the colour of a button falls here.
- **Services, sync, storage, crypto, or any path nobody has classified**: the
  fast tier plus the live tier, about **6.5 minutes measured** (longer once
  the two cross-client arms are runnable; they are currently skipped from a
  linked worktree checkout, tracked in quorum-desktop's
  `.agents/issues/.open/2026-08-23-cross-client-harness-scripts-resolve-mobile-wrong-from-worktree.md`).
  Real bots send real messages over a real relay.
- `yarn verify --fast` skips the live tier on request, for a quick check
  mid-work; it is not a substitute for the full run before reporting done.
- `space-delivery` is retried once if it fails, because it is load-sensitive
  under the live tier's back-to-back real-relay traffic. A retry-pass reports
  `FLAKY`, never `PASS`: that distinction is the point, not a bug.

An unclassified path defaults to the live tier on purpose: the routing is an
allowlist of provably safe paths, not a denylist of risky ones, so it rots
loudly (an occasional unnecessary few minutes) rather than silently (a real
risk shipping with no coverage). That is the trade this rule makes on your
behalf.

This repo delegates to the same orchestrator: `yarn verify` here runs
`scripts/verify.mjs`, which spawns `quorum-desktop`'s `scripts/verify/index.mjs`
if that checkout is present as a sibling, and falls back to this repo's own
fast tier (with a `PASS (PARTIAL)`) if it is not.

That default delegation path (a real sibling `quorum-desktop` checkout) has
not itself been exercised end to end yet, only via the `VERIFY_ORCHESTRATOR`
override: the main desktop checkout stays on `main`, which will not carry the
orchestrator until this PR merges there, and this gap closes once it does.

> ⚠️ **The single-repo fallback currently reports `FAIL`, on any change,
> including a no-op.** MEASURED 2026-08-24:
> `VERDICT FAIL — single-repo fast tier failed at 'typecheck' (exit 2)`.
>
> The cause is one pre-existing type error in `src/primitives/Input/Input.native.tsx`
> (TS2769, a falsy `0`/`''` leaking through a `||` chain into a React Native
> style-array slot). The orchestrator knows about it — it is recorded as a
> `KNOWN-RED` baseline of 1, so it does not fail a run there. The fallback has
> no such notion, and it stops at the first failing step, so `unit` and `build`
> never get to run.
>
> Until it is fixed, a `FAIL` from the fallback naming `typecheck` says nothing
> about your change. Check the error is that one and no other. With a sibling
> `quorum-desktop` checkout on a branch carrying the orchestrator, this does not
> arise at all.
>
> Tracked in quorum-desktop:
> `.agents/issues/.open/2026-08-24-shared-verify-fallback-always-fails-on-a-known-type-error.md`

---

_Last updated: 2026-08-23_
