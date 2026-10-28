# Owner release comparison: 26 October 2026

> Dated evidence snapshot. [Current status](../CURRENT_STATUS.md) records later merges, acceptance and research authorisation.
PASS: the supplied owner archive agrees with the recovered historical source and its release manifest.
The rebuilt application preserves the simulation worker and save module exactly.
Only the main presentation assets and their index references differ among the eight published web files.

## Archive and historical source

Uploaded filename: `Lord_Cricket_XXVI_START_HERE_2026-10-17.zip`.
Archive size: 3,101,092 bytes.
Archive SHA-256: `ef5dbcb59b01d65b410526a166fef45153755af99dc683797f075481bcfca63f`.
The original upload remains outside the source checkout.
Extraction occurred under `/workspace/owner-release-comparison/original`, after checking paths for traversal.

The outer archive passes CRC checks for all 24 entries.
The source and evidence ZIPs pass CRC checks for 894 and 25 entries respectively.
All 23 entries in the owner's `SHA256SUMS.txt` match their actual file bytes.
All 894 source files match Git commit `5b8b9da990d657197fb56bbfd33152f87b875f5c` byte for byte.
`git bundle verify` exits zero and reports complete history with the accepted commit at HEAD.
These checks establish archive consistency, rather than independent authentication of authorship.

## Rebuilt application and HTTP delivery

Comparison source commit: `3ac8a0b` on `codex/baseline-recovery-acceptance`.
`npm run build` exits zero; its retained output includes the existing bundle-size warnings.
The engineering HTML, engineering JavaScript, engineering CSS, simulation worker and save module match byte for byte.
The simulation worker SHA-256 remains `60df03f74ca1595fab9ec8a6c041445f8f1c039b0d634503fe8913f31c83dac4`.
The main JavaScript, main CSS and index HTML differ.
Their changed names and hashes agree with the presentation changes documented in `LAYOUT_ACCEPTANCE_FOLLOWUP.md`.
The only application source differences from the historical commit are `career.css`, `main.tsx` and `styles.css`.
Simulation and persistence packages remain unchanged.

The comparison starts each application's `node start.mjs` on separate loopback ports, 4191 and 4192.
All eight web files from each application return HTTP 200 and match their respective disk bytes: 16/16 checks pass.
Both server processes stop after comparison.
This is a build and HTTP comparison; it does not claim a new browser playthrough of the original release.
The application has no remote gameplay API; its authority runs in browser workers and local persistence.
Personal browser profiles and saves remain untouched.

## Acceptance status

The owner reports a successful Windows Edge match, usable layout and repeat replay verification.
See `../M3_HUMAN_ACCEPTANCE.md` for the result, hashes and unrecorded individual checklist details.
The original-archive comparison blocker recorded in earlier reports is resolved by this run.
Those earlier reports remain dated snapshots.

Before this documentation update, PR #2 reports four passing checks at `3ac8a0b`.
Documentation pushes can start new checks; those results require their own review.
PR #2 remains unmerged. M7K and research-model promotion remain outside this task.

## Reproducible evidence

[comparison.json](verification/2026-10-26-owner/comparison.json) records every manifest, asset and HTTP comparison.
The same directory retains the comparison script, build output, server logs and `SHA256SUMS`.
The script uses absolute paths for this workspace and requires the separately preserved uploaded archive.
No game code changes or new test suites were required for this comparison.
