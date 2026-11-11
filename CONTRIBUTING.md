# Contributing

Read [AGENTS.md](AGENTS.md), the [engineering guide](docs/ENGINEERING_GUIDE.md) and relevant architecture decisions before changing code.

## Change workflow

1. Identify the backlog item and its acceptance criteria.
2. Create an isolated branch from the correct current base; preserve other work.
3. Make a small coherent change. Add regression coverage for behavioural failures and compatibility boundaries.
4. Run focused checks and required integration gates. Retain precise failures and environment limitations.
5. Review the final diff, protected version boundaries and save compatibility.
6. Open or update a PR describing the problem, resulting behaviour and validation.
7. Merge only after review and required checks pass on the current head/base. Reconcile backlog and status after integration.

Use Australian English in project documentation. Keep historical reports dated; add new evidence rather than rewriting old results. Do not commit credentials, private saves or raw licensed research archives.

## Documentation maintenance

Update capability descriptions when behaviour changes. Document public contracts and non-obvious invariants near their code; use ADRs for architectural decisions. Keep command examples executable and relative links valid. AI-specific context belongs in [AI_CONTINUATION.md](docs/AI_CONTINUATION.md), linked from AGENTS.md.

## Bug reports

Provide the revision/build, format, browser/OS, steps, expected/actual behaviour and relevant diagnostic output. Preserve damaged saves. Review diagnostic exports before sharing; avoid publishing private archives or licensed raw inputs.
