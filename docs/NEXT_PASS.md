# Next pass: M7D external dataset ingestion and model candidate, then M8

Pass 15 M7C preserves the frozen engine, adds a fixed-seed 96-match
first-innings phase diagnostic, and implements a defensively checked external
reference extraction/comparison protocol. It has **not** ingested genuine
Cricsheet delivery records: this execution host cannot resolve the data host.
Therefore no fitted parameter pack is approved and model status remains
SYNTHETIC_ALPHA.

Next action in an authorised, network-enabled environment:

1. Acquire, record provenance and licensing for a full actual Cricsheet JSON
   T20 ZIP; retain exact source bytes outside the code repository.
2. Run the M7C extractor and enforce >=200 date-held-out real matches plus
   substantial separate training matches. Examine exclusions and league mix.
3. Run simulations on representative fixed population contexts, inspect
   phase-level deltas and run independent ablation, then fit a NEW versioned
   parameter pack. Do not edit `synthetic-alpha-01` or replay hashes.
4. Validate on an untouched held-out real cohort with bootstrap uncertainty,
   cohort-wise scoring/wickets/extras/dots/boundaries/tails, and no dominating
   tactic exploit; do not approve weak or nonrepresentative evidence.
5. Run M6F/M6G/M7B browser+IndexedDB tests in *permitted* Chromium and Firefox,
   record 1366x768, keyboard and 150% rendering; perform human M3 acceptance.
6. Benchmark browser/worker run times, memory, save/load on recorded reference
   four-core, 8GB host. Fix performance issues with unchanged event hashes.

Do not label the complete M7 milestone PASS until these outstanding gates are
really executed and accepted. M8 release remains a separate milestone.
