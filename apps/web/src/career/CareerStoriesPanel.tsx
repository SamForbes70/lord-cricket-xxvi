import { useState } from "react";
import type { CareerStoryCard, CareerStoryCategory } from "@lcxxvi/contracts";

/**
 * Stage 11 story cards (docs/ROADMAP_AND_AI_GUIDE.md): factual stories derived from committed career data.
 * Used as the Career Stories & Club Digest panel (with controls) and as a player's career timeline.
 */

const CATEGORY_LABELS: Record<CareerStoryCategory, string> = {
  MILESTONE_BATTING: "Batting milestones",
  MILESTONE_BOWLING: "Bowling milestones",
  MILESTONE_FIELDING: "Fielding milestones",
  FORM_STREAK: "Form",
  YOUTH_BREAKTHROUGH: "Youth",
  CONTRACT_TENSION: "Contracts",
  RETIREMENT_WATCH: "Retirements",
  AWARD_RECOGNITION: "Awards",
  CLUB_BOARD_REVIEW: "Board reviews",
};

type DetailLevel = "FULL" | "CONCISE" | "OFF";
const DETAIL_STORAGE_KEY = "lcxxvi-career-stories";
const PAGE_SIZE = 20;

function readDetail(): DetailLevel {
  try {
    const value = localStorage.getItem(DETAIL_STORAGE_KEY);
    return value === "CONCISE" || value === "OFF" ? value : "FULL";
  } catch {
    return "FULL";
  }
}

export function CareerStoriesPanel(props: {
  stories: readonly CareerStoryCard[];
  title: string;
  testId: string;
  /** The Career screen shows filter and detail controls; the player timeline does not. */
  withControls: boolean;
  busy: boolean;
  onOpenReplay?: (fixtureId: string, triggerId: string) => void;
}) {
  const { stories, title, testId, withControls, busy, onOpenReplay } = props;
  const [category, setCategory] = useState<CareerStoryCategory | "ALL">("ALL");
  const [detail, setDetail] = useState<DetailLevel>(() => (withControls ? readDetail() : "FULL"));
  const [shown, setShown] = useState(PAGE_SIZE);
  const headingId = `${testId}-heading`;
  const newestFirst = [...stories]
    .filter((story) => category === "ALL" || story.category === category)
    .reverse();
  const changeDetail = (value: DetailLevel) => {
    setDetail(value);
    try {
      localStorage.setItem(DETAIL_STORAGE_KEY, value);
    } catch {
      /* storage unavailable */
    }
  };
  return (
    <section className="career-panel" aria-labelledby={headingId} data-testid={testId}>
      <h3 id={headingId}>{title}</h3>
      {withControls && (
        <div className="action-row">
          <label>
            Show{" "}
            <select
              value={category}
              onChange={(event) => {
                setCategory(event.currentTarget.value as CareerStoryCategory | "ALL");
                setShown(PAGE_SIZE);
              }}
            >
              <option value="ALL">All stories</option>
              {(Object.keys(CATEGORY_LABELS) as CareerStoryCategory[]).map((key) => (
                <option key={key} value={key}>
                  {CATEGORY_LABELS[key]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Detail{" "}
            <select value={detail} onChange={(event) => changeDetail(event.currentTarget.value as DetailLevel)}>
              <option value="FULL">Full</option>
              <option value="CONCISE">Headlines only</option>
              <option value="OFF">Off</option>
            </select>
          </label>
        </div>
      )}
      {detail === "OFF" ? (
        <p>Stories are switched off.</p>
      ) : newestFirst.length === 0 ? (
        <p>No stories yet. They appear as the career produces milestones, streaks, awards and reviews.</p>
      ) : (
        <>
          <ol className="career-stories" aria-label={title}>
            {newestFirst.slice(0, shown).map((story) => {
              const fixtureId = story.linkedMatchKey?.split(":").slice(1).join(":") ?? null;
              const buttonId = `story-replay-${story.storyId.replaceAll(":", "-")}`;
              return (
                <li key={story.storyId} data-category={story.category}>
                  <p>
                    <small>
                      Season {story.seasonNumber} · Round {story.roundNumber} · {CATEGORY_LABELS[story.category]}
                    </small>
                  </p>
                  <p>
                    <strong>{story.headline}</strong>
                  </p>
                  {detail === "FULL" && <p>{story.summaryText}</p>}
                  {fixtureId && onOpenReplay && (
                    <button
                      id={buttonId}
                      type="button"
                      className="replay-btn"
                      disabled={busy}
                      onClick={() => onOpenReplay(fixtureId, buttonId)}
                    >
                      View replay
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
          {newestFirst.length > shown && (
            <button type="button" onClick={() => setShown(shown + PAGE_SIZE)}>
              Show more stories ({newestFirst.length - shown} more)
            </button>
          )}
        </>
      )}
    </section>
  );
}
