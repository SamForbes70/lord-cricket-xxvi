import type { View } from "./protocol.js";

/** The tip for the current moment. Exported for tests. */
export function coachTip(view: Pick<View, "phase" | "fieldPresentation" | "activeIndex" | "innings">): { title: string; text: string } {
  const last = view.fieldPresentation?.latestHighlight;
  switch (view.phase) {
    case "TOSS":
      return { title: "The toss", text: "Call heads or tails. Whoever wins the toss chooses whether to bat or bowl first." };
    case "AWAITING_INNINGS":
      return { title: "Bat or bowl?", text: "Batting first means setting a target. Bowling first means you know exactly what you need when you chase. Either is a fair choice in your first match." };
    case "AWAITING_FOLLOW_ON":
      return { title: "The follow-on", text: "The side batting second is well behind. You can make them bat again straight away, or bat yourself and set a bigger lead." };
    case "AWAITING_BATTER":
      return last?.dismissalKind
        ? { title: "Wicket: who's next in?", text: "Choose the next batter. Keep your best hitters for the last overs if you want quick runs at the end." }
        : { title: "Choose a batter", text: "Pick who walks out to bat. Openers face the new ball, so steady batters often go first." };
    case "AWAITING_BOWLER":
      return { title: "Choose the bowler", text: "Pick who bowls this over. Greyed-out names can't bowl right now (for example, nobody bowls two overs in a row); the reason shows under each one." };
    case "READY":
      if (last?.boundary === "SIX" || last?.boundary === "FOUR") return { title: "Boundary!", text: "The This ball panel calls each delivery, and the strip beside it shows the over so far. Keep going with Next delivery, or speed up with Finish over." };
      return view.innings.length > 0 && (view.innings[view.activeIndex]?.innings.legalBalls ?? 0) > 0
        ? { title: "Keep the match moving", text: "Next delivery plays one ball. Finish over plays to the end of the over. Next decision plays until you're needed again. Tactics below change field and intent at any time." }
        : { title: "Play the first ball", text: "Press Next delivery to bowl the first ball. Each ball is decided by the match engine from the players' skills and your plans." };
    case "COMPLETE":
      return { title: "That's the match", text: "Scroll down for the scorecard, the player of the match and the analytics. When you're ready, try a career from the title screen." };
    default:
      return { title: "Your call", text: "The next decision is shown below. Pick an option to carry on." };
  }
}
