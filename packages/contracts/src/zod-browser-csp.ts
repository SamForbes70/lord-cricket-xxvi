import { z } from "zod";

const hasBrowserDom = typeof globalThis !== "undefined" && "document" in globalThis;
const hasWorkerScope = typeof globalThis !== "undefined" && "importScripts" in globalThis;

if (hasBrowserDom || hasWorkerScope) {
  z.config({ jitless: true });
}
