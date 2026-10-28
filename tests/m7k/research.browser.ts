/** Exposes candidate archive checks only inside the developer browser bundle. */
import { hash, importArchive, exportArchive, recover, type ResearchEvent } from "../../scripts/research/m7k-ledger.js";
declare global {
  interface Window { m7kArchiveCheck: (archive: string, tail: ResearchEvent[]) => { hash: string; archive: string; events: number } }
}
window.m7kArchiveCheck = (archive, tail) => {
  const initial = importArchive(archive), recovered = recover(exportArchive(initial), tail);
  return { hash: hash(recovered.projection), archive: exportArchive(recovered), events: recovered.events.length };
};
