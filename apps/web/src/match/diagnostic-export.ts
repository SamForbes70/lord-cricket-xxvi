import { canonicalJson } from "@lcxxvi/contracts";
import type { T20Session, ODISession, Red5Session } from "@lcxxvi/simulation";
import type { Request } from "./protocol.js";

type Session = T20Session | ODISession | Red5Session;
export type DiagnosticFailure = { requestType: string; sequence: number | null; invariantCode: string | null; command: Extract<Request, { type: "COMMAND" }>["command"] | null };
export type DiagnosticPreview = { format: string | null; eventCount: number; revision: number | null; byteCount: number; sha256: string; failure: { requestType: string; sequence: number | null; invariantCode: string | null } | null; includesSeed: boolean; engine: string | null; rulesHash: string | null; modelHash: string | null };

export async function createDiagnostic(session: Session | null, failure: DiagnosticFailure | null): Promise<{ preview: DiagnosticPreview; bytes: Uint8Array }> {
  const report = { version: "LC_MATCH_DIAGNOSTIC_V1", modelStatus: "SYNTHETIC_ALPHA", format: session?.setup.format ?? null,
    gameId: session?.setup.gameId ?? null, matchId: session?.setup.matchId ?? null,
    seed: session?.setup.seed ?? null, revision: session?.revision ?? null,
    manifest: session?.executionManifest ?? null, lastEventHash: session?.lastEventHash ?? null,
    failure, events: session?.events ?? [] };
  const bytes = new TextEncoder().encode(canonicalJson(report));
  if (bytes.length > 20 * 1024 * 1024) throw new Error("Diagnostic exceeds the 20 MiB export limit.");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
  return { bytes, preview: { format: report.format, eventCount: report.events.length, revision: report.revision,
    byteCount: bytes.length, sha256, includesSeed: report.seed !== null,
    engine: report.manifest?.engine ?? null, rulesHash: report.manifest?.rulesHash ?? null, modelHash: report.manifest?.modelHash ?? null,
    failure: failure ? { requestType: failure.requestType, sequence: failure.sequence, invariantCode: failure.invariantCode } : null } };
}
