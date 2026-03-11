# Habi Mission Control Upstream Sync

This fork should be updated by **selective porting**, not by blindly merging upstream `main`.

## Goals

- Keep the canonical live app on `3005` stable.
- Update against upstream in a clean worktree.
- Protect Habi-specific founder, task, growth, and delivery flows.
- Make it obvious which upstream changes are safe-first candidates.

## Canonical rules

1. `3005` always runs the clean pushed `main` worktree.
2. Any experimental or dirty review build runs on a different port.
3. Before repointing `3005`, preserve non-main work as either:
   - a commit, or
   - a patch snapshot.

## Protected Habi surfaces

The protected-path list lives in:

- `config/habi-upstream/protected-paths.txt`

Treat those paths as local product surfaces. They are not safe for automatic upstream replacement.

Examples:

- founder packet and founder panels
- Habi task APIs and execution truth
- growth integrations
- Habi-specific libs (`habi-*`, `time-format`)
- local websocket handling

## Safe-first port candidates

The candidate list lives in:

- `config/habi-upstream/port-candidates.txt`

These are the first places to look when porting upstream improvements, because they are more likely to be infrastructure or generic operator improvements.

## Workflow

### 1. Prepare a clean update worktree

```bash
./scripts/habi-prepare-update-worktree.sh
```

Default output:

- branch: `codex/mc-upstream-sync`
- worktree: `/private/tmp/mc-upstream-sync`

### 2. Generate a divergence report

From the main worktree or the update worktree:

```bash
pnpm sync:report
```

This classifies divergence from upstream into:

- protected Habi surfaces
- safe-first port candidates
- unclassified paths that need review

### 3. Port upstream in slices

Recommended order:

1. websocket / gateway reliability
2. task outcome and feedback analytics
3. token and cost attribution
4. remaining runtime / operator hardening

### 4. Validate before replacing `3005`

Minimum checks:

- login
- gateway online detection
- founder queues
- task actions / QC / merge flow
- growth page
- office / OpenClaw control connectivity

## Notes

- OpenClaw runtime upgrades should happen separately from Mission Control code updates.
- Do not mix runtime repair, upstream porting, and Habi product changes in one change set.
