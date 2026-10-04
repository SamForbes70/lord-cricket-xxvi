/** Frozen external trust anchor. Changing the seed/world requires an explicit new pack and ADR. */
export const FROZEN_WORLD_PINS = Object.freeze({
  "worldPackId": "fictional-eight-01",
  "worldSeed": "lcxxvi-fictional-eight-v1-20260927",
  "worldGeneratorVersion": "LC_FICTIONAL_WORLD_GENERATOR_V1",
  "generatorSourceSha256": "a3aaa4b64926ad9859f84222eb51274e7881df750308c2e9ae8fd1fa66e2f4da",
  "provenanceSourceSha256": "97c7a43de0937ce85dcc03c3cddbd2a1be67b99b8af2f0099391bb7c39562982",
  "worldFileSha256": "0136173903ba42a199c84a17407cf711c2caf1b57c52472abb52e9be7a6d8257",
  "worldCanonicalSha256": "f4cbe33f4a2ea41385143cc03ab6d64e94a356f8af75e30483a68de87bdca252",
  "worldByteLength": 310033
} as const);
