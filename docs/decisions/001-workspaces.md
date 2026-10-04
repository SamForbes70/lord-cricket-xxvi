# ADR 001: TypeScript modular monolith

Accepted for Pass 01. Use npm workspaces, strict TypeScript project references, React/Vite for the shell, and Node for batch tooling. Each package has its own package manifest, compilation output and public export. No backend or alternate production simulation runtime.

Engine-facing packages contain interfaces until their milestone is reached. Import direction is enforced. No ambient random source, clock or browser API enters contracts/domain/simulation/AI/projections/data. A browser worker and application transaction coordinator are deferred, not mocked as implemented.

The initial workspace was empty and had no repository files or AGENTS.md. This is a new source tree, not a modification of an existing remote repository.
