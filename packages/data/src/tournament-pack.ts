import { CUSTOM_COMPETITION_PACK_SCHEMA_ID, CustomCompetitionPackSchema, type CustomCompetition } from "@lcxxvi/contracts";

/**
 * Stage 15 curated tournaments for the fictional world (`fictional-eight-01`). Every team and ground is fictional.
 * Matches are played by the authoritative T20 and one-day engines; results never touch a career.
 */
export const TOURNAMENT_PACK = CustomCompetitionPackSchema.parse({
  schemaId: CUSTOM_COMPETITION_PACK_SCHEMA_ID,
  packId: "fictional-eight-tournaments-01",
  competitions: [
    {
      competitionId: "eight-nations-cup",
      title: "Eight Nations Cup",
      format: "T20",
      sourceType: "FICTIONAL_CURATED",
      worldPackId: "fictional-eight-01",
      teamIds: ["team-01", "team-02", "team-03", "team-04", "team-05", "team-06", "team-07", "team-08"],
      groundIds: ["ground-01", "ground-02", "ground-03", "ground-04", "ground-05", "ground-06", "ground-07", "ground-08"],
      structure: { kind: "GROUPS_KNOCKOUT", groups: [["team-01", "team-03", "team-05", "team-07"], ["team-02", "team-04", "team-06", "team-08"]] },
      points: { win: 2, tie: 1, loss: 0 },
      summary: "All eight sides in two T20 groups of four. The top two in each group reach the semi-finals, then a final. A tied knockout match goes to a super over.",
    },
    {
      competitionId: "harbour-tri-series",
      title: "Harbour Tri-Series",
      format: "ODI",
      sourceType: "FICTIONAL_CURATED",
      worldPackId: "fictional-eight-01",
      teamIds: ["team-02", "team-04", "team-05"],
      groundIds: ["ground-02", "ground-04", "ground-05"],
      structure: { kind: "ROUND_ROBIN", legs: 2, finalTopTwo: true },
      points: { win: 4, tie: 2, loss: 0 },
      summary: "Copper Vale, Westmere Isles and Ember Plains play each other twice in one-day matches. The top two meet in the final.",
    },
    {
      competitionId: "larchwood-westmere-series",
      title: "Larchwood v Westmere one-day series",
      format: "ODI",
      sourceType: "FICTIONAL_CURATED",
      worldPackId: "fictional-eight-01",
      teamIds: ["team-07", "team-04"],
      groundIds: ["ground-07", "ground-04"],
      structure: { kind: "SERIES", matches: 5 },
      points: { win: 1, tie: 0, loss: 0 },
      summary: "A five-match one-day series, home and away. It ends as soon as one side has won three.",
    },
    {
      competitionId: "northern-t20-league",
      title: "Northern T20 League",
      format: "T20",
      sourceType: "FICTIONAL_CURATED",
      worldPackId: "fictional-eight-01",
      teamIds: ["team-01", "team-03", "team-06", "team-08"],
      groundIds: ["ground-01", "ground-03", "ground-06", "ground-08"],
      structure: { kind: "ROUND_ROBIN", legs: 2, finalTopTwo: false },
      points: { win: 2, tie: 1, loss: 0 },
      summary: "Four sides play each other home and away in T20s. Top of the table wins.",
    },
  ],
});

export function competitionById(competitionId: string): CustomCompetition | null {
  return TOURNAMENT_PACK.competitions.find((c) => c.competitionId === competitionId) ?? null;
}
