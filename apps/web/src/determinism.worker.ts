import { executeDeterminismRequest, executeProbabilityRequest, generateDelivery } from "@lcxxvi/simulation";

// This worker owns no match state and has no draw cursor. Full engine ownership is deferred.
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: unknown): void;
};
scope.onmessage = (event) => {
  try {
    scope.postMessage({
      ok: true,
      result: typeof event.data === "object" && event.data !== null &&
      "kind" in event.data && event.data.kind === "GENERATE_DELIVERY"
        ? generateDelivery(event.data)
        : typeof event.data === "object" && event.data !== null &&
      "kind" in event.data &&
      (event.data.kind === "NORMALISE_CATEGORIES" || event.data.kind === "SAMPLE_CATEGORY")
        ? executeProbabilityRequest(event.data)
        : executeDeterminismRequest(event.data),
    });
  } catch (error) {
    scope.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
