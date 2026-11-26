export type AcceptanceStep = { name: string; args: string[]; [key: string]: unknown };
export const ACCEPTANCE_SCOPES: string[];
export const SPLIT_SCOPES: string[];
export const BROWSERS: string[];
export const BROWSER_SUITES: Set<string>;
export function parseAcceptanceArguments(argv: string[]): { flags: Set<string>; scope: string };
export function scopeSteps<T extends AcceptanceStep>(steps: T[], scope: string): T[];
