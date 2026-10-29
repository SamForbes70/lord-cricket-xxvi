/** Mirrors synthetic ground coordinates without changing players, runs or event order. */
export function mirrorEnds<T>(input: T): T {
  const opposite: Record<string, string> = { north: "south", south: "north", NORTH: "SOUTH", SOUTH: "NORTH" };
  return JSON.parse(JSON.stringify(input).replace(/"(north|south|NORTH|SOUTH)"/g, (_, end: string) => JSON.stringify(opposite[end]))) as T;
}
