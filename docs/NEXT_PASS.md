# Next pass: Pass 12D / M6D deterministic off-screen fixture execution

Entry condition: retain the frozen Pass 12A schedule identity, Pass 12B exactly-once condition boundary and Pass 12C V2 training/readiness state. All inherited match-engine gates remain authoritative.

Bounded objective: execute scheduled AI-vs-AI T20 league fixtures headlessly using the same accepted `LC_T20_MATCH_V1` scoring/probability engine and each fixture's independent Pass 12A match seed. Process fixtures in fixture-ID order, produce a canonical match-completion record, and apply condition/statistical inputs exactly once. Batch order must not affect any match result.

The pass may introduce a deterministic fixture-management autopilot for the decisions required to finish AI-vs-AI matches. It must not be described as the later tactical opponent AI and must not read hidden future random values. Do not yet implement the final league table/NRR reducer, season archive, management UI or calibrated tactical captain intelligence.
