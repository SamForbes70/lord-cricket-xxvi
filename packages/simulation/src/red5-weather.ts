import type { Red5Command } from "@lcxxvi/contracts";
import { WEATHER_SEGMENT_SECONDS, WEATHER_TRANSITION_WEIGHTS } from "@lcxxvi/data";
import { createRandomService } from "./determinism.js";
import type { Red5Session } from "./red-ball-match.js";

export const RED5_WEATHER_SCHEDULE_VERSION = "LC_RED5_WEATHER_SCHEDULE_V1" as const;
export const RED5_WEATHER_FORECAST_VERSION = "LC_RED5_WEATHER_FORECAST_V1" as const;
export const RED5_WEATHER_SCHEDULE_DOMAIN = "WEATHER" as const;
export const RED5_WEATHER_FORECAST_DOMAIN = "PREDICTION" as const;

export type WeatherSegmentState = "DRY" | "OVERCAST" | "RAIN";

export interface Red5WeatherSegment {
  readonly segmentKey: string;
  readonly day: 1 | 2 | 3 | 4 | 5;
  readonly segmentIndex: number;
  readonly startLocalSeconds: number;
  readonly endLocalSeconds: number;
  readonly state: WeatherSegmentState;
}

export interface Red5WeatherSchedule {
  readonly version: typeof RED5_WEATHER_SCHEDULE_VERSION;
  readonly matchId: string;
  readonly segmentSeconds: number;
  readonly segments: readonly Red5WeatherSegment[];
}

/**
 * Public uncertain forecast: exposes only coarse risk bands and noisy probability
 * bounds so neither the UI nor tactical captains can read exact segment transitions.
 */
export interface Red5UncertainForecast {
  readonly version: typeof RED5_WEATHER_FORECAST_VERSION;
  readonly day: number;
  readonly outlook: "CLEAR" | "UNSETTLED" | "WET";
  readonly rainRiskBand: "LOW" | "MODERATE" | "HIGH";
  readonly estimatedRainChanceRangePct: readonly [number, number];
  readonly summaryText: string;
}

const random = createRandomService();
const START_OF_DAY_SECONDS = 11 * 3600;
const SEGMENTS_PER_DAY = 15; // 11:00 to 18:30 in 30-minute segments

function sampleNextWeatherState(
  seed: string,
  matchId: string,
  prev: WeatherSegmentState,
  eventOrdinal: number,
): WeatherSegmentState {
  const weights = WEATHER_TRANSITION_WEIGHTS[prev];
  const total = weights.DRY + weights.OVERCAST + weights.RAIN;
  const roll =
    random.uint32({
      seed,
      domain: RED5_WEATHER_SCHEDULE_DOMAIN,
      entityId: matchId,
      eventOrdinal,
      stageName: "markov_segment",
      drawIndex: 0,
    }) % total;
  if (roll < weights.DRY) return "DRY";
  if (roll < weights.DRY + weights.OVERCAST) return "OVERCAST";
  return "RAIN";
}

export function generateRed5WeatherSchedule(
  seed: string,
  matchId: string,
): Red5WeatherSchedule {
  const segments: Red5WeatherSegment[] = [];
  let state: WeatherSegmentState = "DRY";
  let ordinal = 1;
  for (const day of [1, 2, 3, 4, 5] as const) {
    for (let s = 0; s < SEGMENTS_PER_DAY; s++) {
      state = sampleNextWeatherState(seed, matchId, state, ordinal++);
      const startLocalSeconds = START_OF_DAY_SECONDS + s * WEATHER_SEGMENT_SECONDS;
      segments.push({
        segmentKey: `d${day}-s${s}`,
        day,
        segmentIndex: s,
        startLocalSeconds,
        endLocalSeconds: startLocalSeconds + WEATHER_SEGMENT_SECONDS,
        state,
      });
    }
  }
  return {
    version: RED5_WEATHER_SCHEDULE_VERSION,
    matchId,
    segmentSeconds: WEATHER_SEGMENT_SECONDS,
    segments,
  };
}

export function computeUncertainRed5Forecast(params: {
  readonly seed: string;
  readonly matchId: string;
  readonly day: number;
  readonly localSeconds: number;
}): Red5UncertainForecast {
  const schedule = generateRed5WeatherSchedule(params.seed, params.matchId);
  const remainingToday = schedule.segments.filter(
    seg => seg.day === params.day && seg.endLocalSeconds > params.localSeconds,
  );
  const activePool =
    remainingToday.length > 0
      ? remainingToday
      : schedule.segments.filter(seg => seg.day === Math.min(5, params.day + 1));

  const weightedScore =
    activePool.length === 0
      ? 0
      : activePool.reduce(
          (sum, seg) => sum + (seg.state === "RAIN" ? 100 : seg.state === "OVERCAST" ? 35 : 5),
          0,
        ) / activePool.length;

  // Perturb in an independent forecast-noise random domain [-12, +12] pct points.
  const bucket = Math.max(0, Math.floor((params.localSeconds - START_OF_DAY_SECONDS) / 3600));
  const noiseDraw =
    random.uint32({
      seed: params.seed,
      domain: RED5_WEATHER_FORECAST_DOMAIN,
      entityId: params.matchId,
      eventOrdinal: params.day * 50 + bucket,
      stageName: "forecast_noise",
      drawIndex: 0,
    }) % 25;
  const noisyCenter = Math.max(5, Math.min(90, Math.round(weightedScore + (noiseDraw - 12))));
  const low = Math.max(0, Math.floor((noisyCenter - 10) / 5) * 5);
  const high = Math.min(95, Math.max(low + 15, Math.ceil((noisyCenter + 10) / 5) * 5));

  const rainRiskBand: "LOW" | "MODERATE" | "HIGH" =
    noisyCenter >= 50 ? "HIGH" : noisyCenter >= 25 ? "MODERATE" : "LOW";
  const outlook: "CLEAR" | "UNSETTLED" | "WET" =
    rainRiskBand === "HIGH" ? "WET" : rainRiskBand === "MODERATE" ? "UNSETTLED" : "CLEAR";

  const summaryText =
    outlook === "WET"
      ? `Uncertain Day ${params.day} forecast: heavy cloud and high interruption risk (${low}% to ${high}% rain chance).`
      : outlook === "UNSETTLED"
        ? `Uncertain Day ${params.day} forecast: unsettled skies with passing showers possible (${low}% to ${high}% rain chance).`
        : `Uncertain Day ${params.day} forecast: mostly fair conditions (${low}% to ${high}% shower chance).`;

  return {
    version: RED5_WEATHER_FORECAST_VERSION,
    day: params.day,
    outlook,
    rainRiskBand,
    estimatedRainChanceRangePct: [low, high],
    summaryText,
  };
}

/**
 * Evaluates whether the current red-ball match state sits at a safe event boundary
 * (between overs during active play) where a scheduled seeded rain segment applies.
 * Never interrupts mid-over or during batter/bowler/toss/follow-on prompts.
 */
export function nextSafeBoundaryWeatherInterruption(params: {
  readonly session: Readonly<Red5Session>;
  readonly appliedSegmentKeys: ReadonlySet<string>;
}): {
  readonly segmentKey: string;
  readonly delaySeconds: number;
  readonly command: Red5Command;
} | null {
  const c = params.session.core;
  if (c.phase !== "READY" || c.innings.length === 0) return null;
  if (c.clock.phase !== "PLAY") return null;
  const active = c.innings[c.activeInningsIndex];
  if (!active || active.innings.legalBalls % 6 !== 0) return null;

  const schedule = generateRed5WeatherSchedule(
    params.session.setup.seed,
    params.session.setup.matchId,
  );
  const currentSeg = schedule.segments.find(
    seg =>
      seg.day === c.clock.day &&
      c.clock.localSeconds >= seg.startLocalSeconds &&
      c.clock.localSeconds < seg.endLocalSeconds,
  );
  if (!currentSeg || currentSeg.state !== "RAIN") return null;
  if (params.appliedSegmentKeys.has(currentSeg.segmentKey)) return null;

  return {
    segmentKey: currentSeg.segmentKey,
    delaySeconds: WEATHER_SEGMENT_SECONDS,
    command: {
      commandId: `weather-${currentSeg.segmentKey}-r${params.session.revision + 1}`,
      expectedRevision: params.session.revision,
      actorId: "SYSTEM",
      kind: "ADD_RAIN_DELAY",
      payload: { seconds: WEATHER_SEGMENT_SECONDS },
    },
  };
}
