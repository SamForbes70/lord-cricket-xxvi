import {
  CAREER_STORIES_SCHEMA_ID,
  CareerStoriesProjectionSchema,
  type CareerAwardsLedger,
  type CareerStoriesProjection,
  type CareerStoryCard,
  type CareerStoryCategory,
  type CareerStoryFact,
} from "@lcxxvi/contracts";
import type { HistoricalMatchFact } from "./historical-stats.js";

/**
 * Stage 11: player and manager stories (docs/ROADMAP_AND_AI_GUIDE.md). A pure projection over committed career
 * data. Every story rests on listed facts, and every number in its text is one of those facts. No randomness:
 * headline templates are chosen by an FNV-1a hash of the story id, never repeating the previous template of the
 * same category.
 */

export const CAREER_STORY_THRESHOLDS = {
  runs: [500, 1000, 2000, 3000, 4000, 5000, 7500, 10000],
  wickets: [25, 50, 100, 150, 200, 300],
  fieldingDismissals: [15, 30, 60, 100, 150],
} as const;

/** Rounds at which the board reviews the managed club: mid-season and season end. */
export const BOARD_REVIEW_ROUNDS = [7, 14] as const;
/** From this round, a managed player in the final year of a contract is a contract story. */
export const CONTRACT_TENSION_ROUND = 10;
const FINAL_ROUND = 14;
const STREAK_LENGTH = 3;

export type CareerStoriesInput = {
  readonly worldOrCareerId: string;
  /** Match facts in any order; they are sorted by season and fixture. */
  readonly facts: readonly HistoricalMatchFact[];
  readonly controlledTeamId: string | null;
  readonly playerNames: Readonly<Record<string, string>>;
  readonly teamNames: Readonly<Record<string, string>>;
  readonly awardsLedger?: CareerAwardsLedger | null;
  readonly currentSeasonNumber: number;
  /** Contracts in force now: only the current season can show contract stories. */
  readonly contracts?: readonly {
    playerId: string;
    teamId: string;
    expiresAfterSeasonNumber: number;
  }[];
  readonly youthPromotions?: readonly { playerId: string; teamId: string; promotedInSeasonNumber: number }[];
  readonly retirements?: readonly {
    playerId: string;
    debutSeasonNumber: number;
    retiredAfterSeasonNumber: number;
    lastTeamId: string;
    ageAtRetirement: number;
  }[];
};

type Draft = Omit<CareerStoryCard, "headline"> & { readonly headlineChoices: readonly string[] };

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function compareCodePoints(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th"}`;
}

const CATEGORY_ORDER: readonly CareerStoryCategory[] = [
  "MILESTONE_BATTING",
  "MILESTONE_BOWLING",
  "MILESTONE_FIELDING",
  "FORM_STREAK",
  "YOUTH_BREAKTHROUGH",
  "AWARD_RECOGNITION",
  "CONTRACT_TENSION",
  "CLUB_BOARD_REVIEW",
  "RETIREMENT_WATCH",
];

export function projectCareerStories(input: CareerStoriesInput): CareerStoriesProjection {
  const name = (playerId: string) => input.playerNames[playerId] ?? playerId;
  const team = (teamId: string | null | undefined) => (teamId ? (input.teamNames[teamId] ?? teamId) : "their club");
  const drafts: Draft[] = [];
  const facts = [...input.facts].sort(
    (a, b) => a.seasonNumber - b.seasonNumber || a.fixtureOrdinal - b.fixtureOrdinal,
  );
  const matchKey = (fact: HistoricalMatchFact) => `${fact.seasonNumber}:${fact.fixtureId}`;
  const push = (draft: Omit<Draft, "storyId"> & { subjectId: string }) => {
    const { subjectId, ...rest } = draft;
    drafts.push({ ...rest, storyId: `${draft.seasonNumber}:${draft.roundNumber}:${draft.category}:${subjectId}` });
  };

  // Running career totals, and streaks for the managed club.
  const runs = new Map<string, number>();
  const wickets = new Map<string, number>();
  const dismissals = new Map<string, number>();
  const firstAppearance = new Set<string>();
  const hotBat = new Map<string, number>();
  const coldBat = new Map<string, number>();
  const hotBall = new Map<string, number>();
  const appearancesBySeason = new Map<string, number>();
  const promotions = new Map((input.youthPromotions ?? []).map((p) => [p.playerId, p] as const));
  const totalsAtSeasonEnd = new Map<number, Map<string, { runs: number; wickets: number }>>();

  const crossed = (before: number, after: number, thresholds: readonly number[]) =>
    thresholds.filter((t) => before < t && after >= t);

  let lastSeason = facts[0]?.seasonNumber ?? 0;
  const snapshotSeason = (season: number) => {
    const snapshot = new Map<string, { runs: number; wickets: number }>();
    for (const playerId of new Set([...runs.keys(), ...wickets.keys()])) {
      snapshot.set(playerId, { runs: runs.get(playerId) ?? 0, wickets: wickets.get(playerId) ?? 0 });
    }
    totalsAtSeasonEnd.set(season, snapshot);
  };

  for (const fact of facts) {
    if (fact.seasonNumber !== lastSeason) {
      snapshotSeason(lastSeason);
      lastSeason = fact.seasonNumber;
    }
    const managed = (playerId: string) =>
      input.controlledTeamId !== null && fact.participantTeamByPlayerId[playerId] === input.controlledTeamId;

    for (const playerId of Object.keys(fact.participantTeamByPlayerId).sort(compareCodePoints)) {
      const seasonKey = `${fact.seasonNumber}:${playerId}`;
      appearancesBySeason.set(seasonKey, (appearancesBySeason.get(seasonKey) ?? 0) + 1);
      const promotion = promotions.get(playerId);
      if (!firstAppearance.has(playerId)) {
        firstAppearance.add(playerId);
        if (promotion && fact.seasonNumber >= promotion.promotedInSeasonNumber) {
          const teamId = fact.participantTeamByPlayerId[playerId] ?? promotion.teamId;
          push({
            subjectId: playerId,
            seasonNumber: fact.seasonNumber,
            roundNumber: fact.roundNumber,
            category: "YOUTH_BREAKTHROUGH",
            headlineChoices: [
              `${name(playerId)} makes a senior debut`,
              `Academy graduate ${name(playerId)} steps up`,
              `${name(playerId)} graduates to the first team`,
            ],
            summaryText: `${name(playerId)}, promoted from the ${team(teamId)} academy in season ${promotion.promotedInSeasonNumber}, played a first senior match in round ${fact.roundNumber} of season ${fact.seasonNumber}.`,
            subjectPlayerId: playerId,
            subjectTeamId: teamId,
            linkedMatchKey: matchKey(fact),
            factProvenance: [
              { key: "promotedInSeasonNumber", value: promotion.promotedInSeasonNumber },
              { key: "debutRound", value: fact.roundNumber },
              { key: "debutSeason", value: fact.seasonNumber },
            ],
          });
        }
      }
    }

    for (const entry of fact.battingEntries) {
      const before = runs.get(entry.playerId) ?? 0;
      const after = before + entry.runs;
      runs.set(entry.playerId, after);
      for (const threshold of crossed(before, after, CAREER_STORY_THRESHOLDS.runs)) {
        push({
          subjectId: `${entry.playerId}:${threshold}`,
          seasonNumber: fact.seasonNumber,
          roundNumber: fact.roundNumber,
          category: "MILESTONE_BATTING",
          headlineChoices: [
            `${name(entry.playerId)} passes ${threshold} career runs`,
            `${threshold} up for ${name(entry.playerId)}`,
            `${name(entry.playerId)} reaches ${threshold} runs`,
          ],
          summaryText: `${name(entry.playerId)} made ${entry.runs} for ${team(entry.teamId)} in round ${fact.roundNumber} of season ${fact.seasonNumber}, taking a league career total to ${after} runs.`,
          subjectPlayerId: entry.playerId,
          subjectTeamId: entry.teamId,
          linkedMatchKey: matchKey(fact),
          factProvenance: [
            { key: "threshold", value: threshold },
            { key: "matchRuns", value: entry.runs },
            { key: "careerRuns", value: after },
            { key: "round", value: fact.roundNumber },
            { key: "season", value: fact.seasonNumber },
          ],
        });
      }
      if (managed(entry.playerId)) {
        const hot = entry.runs >= 30 ? (hotBat.get(entry.playerId) ?? 0) + 1 : 0;
        hotBat.set(entry.playerId, hot);
        if (hot === STREAK_LENGTH) {
          push({
            subjectId: `${entry.playerId}:BAT_HOT:${fact.fixtureId}`,
            seasonNumber: fact.seasonNumber,
            roundNumber: fact.roundNumber,
            category: "FORM_STREAK",
            headlineChoices: [
              `${name(entry.playerId)} in rich form`,
              `Three in a row for ${name(entry.playerId)}`,
              `${name(entry.playerId)} keeps the runs coming`,
            ],
            summaryText: `${name(entry.playerId)} has scored 30 or more in ${STREAK_LENGTH} consecutive innings, the latest ${entry.runs} in round ${fact.roundNumber}.`,
            subjectPlayerId: entry.playerId,
            subjectTeamId: entry.teamId,
            linkedMatchKey: matchKey(fact),
            factProvenance: [
              { key: "streakThreshold", value: 30 },
              { key: "consecutiveInnings", value: STREAK_LENGTH },
              { key: "latestRuns", value: entry.runs },
              { key: "round", value: fact.roundNumber },
            ],
          });
        }
        const cold =
          entry.dismissed && entry.runs < 10 && entry.battingPosition <= 5 ? (coldBat.get(entry.playerId) ?? 0) + 1 : 0;
        coldBat.set(entry.playerId, cold);
        if (cold === STREAK_LENGTH) {
          push({
            subjectId: `${entry.playerId}:BAT_COLD:${fact.fixtureId}`,
            seasonNumber: fact.seasonNumber,
            roundNumber: fact.roundNumber,
            category: "FORM_STREAK",
            headlineChoices: [
              `Lean spell for ${name(entry.playerId)}`,
              `${name(entry.playerId)} searching for runs`,
              `Pressure builds on ${name(entry.playerId)}`,
            ],
            summaryText: `${name(entry.playerId)}, batting in the top 5, has been dismissed for under 10 in ${STREAK_LENGTH} consecutive innings, the latest for ${entry.runs} in round ${fact.roundNumber}.`,
            subjectPlayerId: entry.playerId,
            subjectTeamId: entry.teamId,
            linkedMatchKey: matchKey(fact),
            factProvenance: [
              { key: "topOrderPositions", value: 5 },
              { key: "slumpThreshold", value: 10 },
              { key: "consecutiveInnings", value: STREAK_LENGTH },
              { key: "latestRuns", value: entry.runs },
              { key: "round", value: fact.roundNumber },
            ],
          });
        }
      }
    }

    // A player may bowl in one innings only; combine per player per match for streaks.
    const wicketsThisMatch = new Map<string, { wickets: number; teamId: string }>();
    for (const entry of fact.bowlingEntries) {
      const before = wickets.get(entry.playerId) ?? 0;
      const after = before + entry.wickets;
      wickets.set(entry.playerId, after);
      const current = wicketsThisMatch.get(entry.playerId);
      wicketsThisMatch.set(entry.playerId, { wickets: (current?.wickets ?? 0) + entry.wickets, teamId: entry.teamId });
      for (const threshold of crossed(before, after, CAREER_STORY_THRESHOLDS.wickets)) {
        push({
          subjectId: `${entry.playerId}:${threshold}`,
          seasonNumber: fact.seasonNumber,
          roundNumber: fact.roundNumber,
          category: "MILESTONE_BOWLING",
          headlineChoices: [
            `${name(entry.playerId)} reaches ${threshold} wickets`,
            `${threshold} career wickets for ${name(entry.playerId)}`,
            `${name(entry.playerId)} claims wicket ${threshold}`,
          ],
          summaryText: `${name(entry.playerId)} took ${entry.wickets} for ${team(entry.teamId)} in round ${fact.roundNumber} of season ${fact.seasonNumber}, reaching ${after} league career wickets.`,
          subjectPlayerId: entry.playerId,
          subjectTeamId: entry.teamId,
          linkedMatchKey: matchKey(fact),
          factProvenance: [
            { key: "threshold", value: threshold },
            { key: "matchWickets", value: entry.wickets },
            { key: "careerWickets", value: after },
            { key: "round", value: fact.roundNumber },
            { key: "season", value: fact.seasonNumber },
          ],
        });
      }
    }
    for (const [playerId, bowled] of [...wicketsThisMatch.entries()].sort(([a], [b]) => compareCodePoints(a, b))) {
      if (!managed(playerId)) continue;
      const hot = bowled.wickets >= 2 ? (hotBall.get(playerId) ?? 0) + 1 : 0;
      hotBall.set(playerId, hot);
      if (hot === STREAK_LENGTH) {
        push({
          subjectId: `${playerId}:BOWL_HOT:${fact.fixtureId}`,
          seasonNumber: fact.seasonNumber,
          roundNumber: fact.roundNumber,
          category: "FORM_STREAK",
          headlineChoices: [
            `${name(playerId)} on a wicket-taking run`,
            `${name(playerId)} keeps striking`,
            `Batters cannot settle against ${name(playerId)}`,
          ],
          summaryText: `${name(playerId)} has taken 2 or more wickets in ${STREAK_LENGTH} consecutive matches, the latest ${bowled.wickets} in round ${fact.roundNumber}.`,
          subjectPlayerId: playerId,
          subjectTeamId: bowled.teamId,
          linkedMatchKey: matchKey(fact),
          factProvenance: [
            { key: "streakThreshold", value: 2 },
            { key: "consecutiveMatches", value: STREAK_LENGTH },
            { key: "latestWickets", value: bowled.wickets },
            { key: "round", value: fact.roundNumber },
          ],
        });
      }
    }

    for (const entry of fact.fieldingEntries) {
      const inMatch = entry.catches + entry.stumpings + entry.runOuts;
      const before = dismissals.get(entry.playerId) ?? 0;
      const after = before + inMatch;
      dismissals.set(entry.playerId, after);
      for (const threshold of crossed(before, after, CAREER_STORY_THRESHOLDS.fieldingDismissals)) {
        push({
          subjectId: `${entry.playerId}:${threshold}`,
          seasonNumber: fact.seasonNumber,
          roundNumber: fact.roundNumber,
          category: "MILESTONE_FIELDING",
          headlineChoices: [
            `${name(entry.playerId)} completes ${threshold} dismissals in the field`,
            `Safe hands: ${threshold} for ${name(entry.playerId)}`,
            `${name(entry.playerId)} reaches ${threshold} fielding dismissals`,
          ],
          summaryText: `${name(entry.playerId)} was involved in ${inMatch} dismissals in the field in round ${fact.roundNumber} of season ${fact.seasonNumber}, reaching ${after} in the league.`,
          subjectPlayerId: entry.playerId,
          subjectTeamId: entry.teamId,
          linkedMatchKey: matchKey(fact),
          factProvenance: [
            { key: "threshold", value: threshold },
            { key: "matchDismissals", value: inMatch },
            { key: "careerDismissals", value: after },
            { key: "round", value: fact.roundNumber },
            { key: "season", value: fact.seasonNumber },
          ],
        });
      }
    }
  }
  if (facts.length > 0) snapshotSeason(lastSeason);

  // Board reviews of the managed club, from the points table after rounds 7 and 14.
  if (input.controlledTeamId) {
    const seasons = [...new Set(facts.map((f) => f.seasonNumber))].sort((a, b) => a - b);
    for (const season of seasons) {
      const seasonFacts = facts.filter((f) => f.seasonNumber === season);
      const maxRound = Math.max(...seasonFacts.map((f) => f.roundNumber));
      for (const reviewRound of BOARD_REVIEW_ROUNDS) {
        if (maxRound < reviewRound) continue;
        const roundFacts = seasonFacts.filter((f) => f.roundNumber <= reviewRound);
        // A review needs the whole round played.
        if (!seasonFacts.some((f) => f.roundNumber === reviewRound)) continue;
        const points = new Map<string, number>();
        for (const f of roundFacts) {
          points.set(f.homeTeamId, (points.get(f.homeTeamId) ?? 0) + f.homePoints);
          points.set(f.awayTeamId, (points.get(f.awayTeamId) ?? 0) + f.awayPoints);
        }
        const own = points.get(input.controlledTeamId) ?? 0;
        const above = [...points.values()].filter((p) => p > own).length;
        const level = [...points.entries()].filter(([t, p]) => t !== input.controlledTeamId && p === own).length;
        const position = above + 1;
        const teams = points.size;
        const mood = position <= 2 ? "pleased" : position <= Math.ceil(teams / 2) + 1 ? "steady" : "concerned";
        const label = reviewRound === FINAL_ROUND ? "end-of-season" : "mid-season";
        push({
          subjectId: `${input.controlledTeamId}:${reviewRound}`,
          seasonNumber: season,
          roundNumber: reviewRound,
          category: "CLUB_BOARD_REVIEW",
          headlineChoices:
            mood === "pleased"
              ? [`Board pleased at the ${label} review`, `Board backs the direction of travel`, `Strong ${label} report`]
              : mood === "steady"
                ? [`Board urges a push at the ${label} review`, `Mixed ${label} report from the board`, `Board wants more`]
                : [`Board concerned at the ${label} review`, `Pressure from the boardroom`, `Board demands improvement`],
          summaryText: `After round ${reviewRound} of season ${season}, ${team(input.controlledTeamId)} sit ${ordinal(position)} of ${teams} on ${own} points${level > 0 ? `, level with ${level} other club${level === 1 ? "" : "s"}` : ""}. The board is ${mood}.`,
          subjectPlayerId: null,
          subjectTeamId: input.controlledTeamId,
          linkedMatchKey: null,
          factProvenance: [
            { key: "round", value: reviewRound },
            { key: "season", value: season },
            { key: "position", value: position },
            { key: "teams", value: teams },
            { key: "points", value: own },
            { key: "levelOnPoints", value: level },
          ],
        });
      }
    }
  }

  // Season awards from the awards ledger.
  for (const summary of input.awardsLedger?.seasonAwards ?? []) {
    for (const award of summary.awards) {
      if (award.status !== "AWARDED" || !award.winnerPlayerId) continue;
      const stat = award.headlineStat;
      push({
        subjectId: `${award.winnerPlayerId}:${award.category}`,
        seasonNumber: summary.seasonNumber,
        roundNumber: FINAL_ROUND,
        category: "AWARD_RECOGNITION",
        headlineChoices: [
          `${name(award.winnerPlayerId)} wins ${award.label}`,
          `${award.label}: ${name(award.winnerPlayerId)}`,
          `Recognition for ${name(award.winnerPlayerId)}`,
        ],
        summaryText: `${name(award.winnerPlayerId)} of ${team(award.winnerTeamId)} is the ${award.label} for season ${summary.seasonNumber}${stat ? ` (${stat})` : ""}.`,
        subjectPlayerId: award.winnerPlayerId,
        subjectTeamId: award.winnerTeamId,
        linkedMatchKey: null,
        factProvenance: [
          { key: "awardCategory", value: award.category },
          { key: "season", value: summary.seasonNumber },
          ...(stat ? [{ key: "headlineStat", value: stat } as CareerStoryFact] : []),
        ],
      });
    }
  }

  // Contracts in their final season, for the managed club, from round 10 of the current season.
  if (input.controlledTeamId) {
    const currentFacts = facts.filter((f) => f.seasonNumber === input.currentSeasonNumber);
    const currentRound = currentFacts.length > 0 ? Math.max(...currentFacts.map((f) => f.roundNumber)) : 0;
    if (currentRound >= CONTRACT_TENSION_ROUND) {
      for (const contract of [...(input.contracts ?? [])].sort((a, b) => compareCodePoints(a.playerId, b.playerId))) {
        if (contract.teamId !== input.controlledTeamId) continue;
        if (contract.expiresAfterSeasonNumber !== input.currentSeasonNumber) continue;
        const appearances = appearancesBySeason.get(`${input.currentSeasonNumber}:${contract.playerId}`) ?? 0;
        if (appearances < 5) continue;
        push({
          subjectId: contract.playerId,
          seasonNumber: input.currentSeasonNumber,
          roundNumber: CONTRACT_TENSION_ROUND,
          category: "CONTRACT_TENSION",
          headlineChoices: [
            `${name(contract.playerId)} enters a contract decision`,
            `Future of ${name(contract.playerId)} in the balance`,
            `Contract clock ticking for ${name(contract.playerId)}`,
          ],
          summaryText: `${name(contract.playerId)} has played ${appearances} matches for ${team(contract.teamId)} this season and is in the final season of a contract that ends after season ${contract.expiresAfterSeasonNumber}.`,
          subjectPlayerId: contract.playerId,
          subjectTeamId: contract.teamId,
          linkedMatchKey: null,
          factProvenance: [
            { key: "appearancesThisSeason", value: appearances },
            { key: "expiresAfterSeason", value: contract.expiresAfterSeasonNumber },
          ],
        });
      }
    }
  }

  // Retirements, with league career totals at the end of the final season.
  for (const retirement of [...(input.retirements ?? [])].sort((a, b) => compareCodePoints(a.playerId, b.playerId))) {
    const totals = totalsAtSeasonEnd.get(retirement.retiredAfterSeasonNumber)?.get(retirement.playerId) ?? {
      runs: 0,
      wickets: 0,
    };
    const seasons = retirement.retiredAfterSeasonNumber - retirement.debutSeasonNumber + 1;
    push({
      subjectId: retirement.playerId,
      seasonNumber: retirement.retiredAfterSeasonNumber,
      roundNumber: FINAL_ROUND,
      category: "RETIREMENT_WATCH",
      headlineChoices: [
        `${name(retirement.playerId)} retires`,
        `Farewell to ${name(retirement.playerId)}`,
        `${name(retirement.playerId)} calls time`,
      ],
      summaryText: `${name(retirement.playerId)} retires at ${retirement.ageAtRetirement} after ${seasons} season${seasons === 1 ? "" : "s"}, last with ${team(retirement.lastTeamId)}, with ${totals.runs} league runs and ${totals.wickets} wickets.`,
      subjectPlayerId: retirement.playerId,
      subjectTeamId: retirement.lastTeamId,
      linkedMatchKey: null,
      factProvenance: [
        { key: "ageAtRetirement", value: retirement.ageAtRetirement },
        { key: "seasons", value: seasons },
        { key: "careerRuns", value: totals.runs },
        { key: "careerWickets", value: totals.wickets },
      ],
    });
  }

  // Deterministic order, then headline choice with a cooldown per category.
  drafts.sort(
    (a, b) =>
      a.seasonNumber - b.seasonNumber ||
      a.roundNumber - b.roundNumber ||
      CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
      compareCodePoints(a.storyId, b.storyId),
  );
  const lastChoice = new Map<CareerStoryCategory, number>();
  const seen = new Set<string>();
  const stories: CareerStoryCard[] = [];
  for (const { headlineChoices, ...draft } of drafts) {
    if (seen.has(draft.storyId)) continue;
    seen.add(draft.storyId);
    let choice = fnv1a32(draft.storyId) % headlineChoices.length;
    if (lastChoice.get(draft.category) === choice) choice = (choice + 1) % headlineChoices.length;
    lastChoice.set(draft.category, choice);
    stories.push({ ...draft, headline: headlineChoices[choice]! });
  }
  return CareerStoriesProjectionSchema.parse({
    schemaId: CAREER_STORIES_SCHEMA_ID,
    worldOrCareerId: input.worldOrCareerId,
    stories,
  });
}
