/**
 * The match worker renews its writer lease on a 4 s timer that runs beside the request queue. A renewal that fails only
 * means "read only" if nothing changed the worker's lease while it was in flight. A request can release the lease on
 * purpose ("New exhibition", loading or deleting a save, starting a scenario or tournament match) and then reset the
 * worker's state; a renewal that read the lease row after that release fails, and if its result were applied it would
 * mark the fresh state read only. With no active save there is nothing to retry, so the tab stayed read only and every
 * new match was refused (the intermittent Firefox failure of tests/ui/edited-world.spec.ts).
 *
 * This gate ignores the result of any renewal that overlapped a queued request. Ignoring it is safe: every durable
 * write still checks the lease atomically in the same transaction (SAVE_READ_ONLY), and the next tick checks again.
 */
export interface LeaseRenewalTicket {
  readonly saveId: string;
  readonly epoch: number;
  readonly quiet: boolean;
}

export interface LeaseRenewalGate {
  /** The worker began handling a queued request. */
  requestStarted(): void;
  /** The worker finished handling a queued request, whatever its outcome. */
  requestFinished(): void;
  /** Taken as the timer starts a renewal of the active save's lease. */
  begin(saveId: string): LeaseRenewalTicket;
  /** True when a failed renewal still describes the worker's current, writable lease. */
  failureApplies(ticket: LeaseRenewalTicket, activeSaveId: string | null, readOnly: boolean): boolean;
}

export function createLeaseRenewalGate(): LeaseRenewalGate {
  let epoch = 0;
  let handling = 0;
  return {
    requestStarted() {
      handling += 1;
      epoch += 1;
    },
    requestFinished() {
      handling = Math.max(0, handling - 1);
      epoch += 1;
    },
    begin(saveId) {
      return { saveId, epoch, quiet: handling === 0 };
    },
    failureApplies(ticket, activeSaveId, readOnly) {
      return ticket.quiet && ticket.epoch === epoch && handling === 0 && !readOnly && activeSaveId === ticket.saveId;
    },
  };
}
