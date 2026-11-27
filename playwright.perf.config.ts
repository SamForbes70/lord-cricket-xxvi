import { defineConfig } from "@playwright/test";
import ui from "./playwright.ui.config.js";

/** Timing runs for docs/pavilion/UNIFIED_ADVANCE.md: the browser suite's settings, its own folder, no JSON report. */
export default defineConfig({ ...ui, testDir: "./tests/perf", outputDir: "test-results-perf", reporter: [["list"]] });
