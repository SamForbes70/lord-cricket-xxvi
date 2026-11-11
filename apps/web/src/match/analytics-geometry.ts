export function displaySector(sector: number, hand: "L" | "R"): number {
  if (!Number.isInteger(sector) || sector < 0 || sector > 7) throw new Error("INVALID_SHOT_SECTOR");
  return hand === "L" ? 7 - sector : sector;
}

export function sectorEndpoint(sector: number, magnitude: number): { x: number; y: number } {
  if (!Number.isInteger(sector) || sector < 0 || sector > 7 || !Number.isFinite(magnitude) || magnitude < 0 || magnitude > 1) throw new Error("INVALID_SECTOR_GEOMETRY");
  const angle = (sector - 3.5) * Math.PI / 4;
  return { x: 100 + Math.sin(angle) * magnitude * 80, y: 100 - Math.cos(angle) * magnitude * 80 };
}
