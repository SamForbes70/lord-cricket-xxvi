import worldText from "../../../../packages/data/worlds/fictional-eight-01.json?raw";
import manifest from "../../../../packages/data/worlds/fictional-eight-01.manifest.json" with { type: "json" };
import { createMatchController } from "./controller.js";
const controller = createMatchController(
  new TextEncoder().encode(worldText),
  manifest,
  () => {
    // Entropy is used only when creating a new match. The validated engine owns every gameplay draw.
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  },
);
self.onmessage = (event: MessageEvent<unknown>) =>
  self.postMessage(controller.handle(event.data));
