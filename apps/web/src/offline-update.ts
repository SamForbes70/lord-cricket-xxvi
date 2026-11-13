export const OFFLINE_SAFE_UPDATE_VERSION = 'LC_OFFLINE_SAFE_UPDATE_V1' as const;

export const RETAINED_SUPPORTED_ENGINES = [
  'LC_T20_MATCH_V1',
  'LC_ODI_MATCH_V1',
  'LC_RED5_MATCH_V1',
] as const;

export const EXPLICIT_RECOVERY_BUILD_PATH = '/engineering.html' as const;

export interface SafeUpdateOfferInput {
  readonly waitingWorkerPresent: boolean;
  readonly activeTransactionSources: ReadonlySet<string>;
}

export interface SafeUpdateOfferDecision {
  readonly version: typeof OFFLINE_SAFE_UPDATE_VERSION;
  readonly shouldRenderBanner: boolean;
  readonly canApplyNow: boolean;
  readonly deferredByActiveTransaction: boolean;
  readonly supportedEngines: readonly string[];
  readonly recoveryBuildPath: string;
}

export function evaluateSafeUpdateOffer(input: SafeUpdateOfferInput): SafeUpdateOfferDecision {
  const busy = input.activeTransactionSources.size > 0;
  return {
    version: OFFLINE_SAFE_UPDATE_VERSION,
    shouldRenderBanner: input.waitingWorkerPresent,
    canApplyNow: input.waitingWorkerPresent && !busy,
    deferredByActiveTransaction: input.waitingWorkerPresent && busy,
    supportedEngines: RETAINED_SUPPORTED_ENGINES,
    recoveryBuildPath: EXPLICIT_RECOVERY_BUILD_PATH,
  };
}

export interface OfflineCoordinatorState {
  readonly version: typeof OFFLINE_SAFE_UPDATE_VERSION;
  readonly supported: boolean;
  readonly offlineReady: boolean;
  readonly waitingWorkerPresent: boolean;
  readonly activeTransactions: number;
  readonly canApplyNow: boolean;
  readonly deferredByActiveTransaction: boolean;
  readonly supportedEngines: readonly string[];
  readonly recoveryBuildPath: string;
}

type Listener = (state: OfflineCoordinatorState) => void;

class OfflineUpdateCoordinator {
  private activeSources = new Set<string>();
  private offlineReady = false;
  private waitingWorker: ServiceWorker | null = null;
  private simulatedWaiting = false;
  private listeners = new Set<Listener>();
  private registration: ServiceWorkerRegistration | null = null;

  getState(): OfflineCoordinatorState {
    const waitingPresent = Boolean(this.waitingWorker) || this.simulatedWaiting;
    const offer = evaluateSafeUpdateOffer({
      waitingWorkerPresent: waitingPresent,
      activeTransactionSources: this.activeSources,
    });
    return {
      version: OFFLINE_SAFE_UPDATE_VERSION,
      supported: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
      offlineReady: this.offlineReady,
      waitingWorkerPresent: waitingPresent,
      activeTransactions: this.activeSources.size,
      canApplyNow: offer.canApplyNow,
      deferredByActiveTransaction: offer.deferredByActiveTransaction,
      supportedEngines: offer.supportedEngines,
      recoveryBuildPath: offer.recoveryBuildPath,
    };
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.getState());
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit() {
    const snap = this.getState();
    for (const fn of this.listeners) fn(snap);
  }

  setBusySource(sourceId: string, busy: boolean): void {
    const had = this.activeSources.has(sourceId);
    if (busy && !had) {
      this.activeSources.add(sourceId);
      this.emit();
    } else if (!busy && had) {
      this.activeSources.delete(sourceId);
      this.emit();
    }
  }

  simulateWaitingUpdate(waiting: boolean): void {
    this.simulatedWaiting = waiting;
    this.emit();
  }

  applySafeUpdate(): { applied: boolean; reason: 'APPLIED' | 'NO_UPDATE_WAITING' | 'ACTIVE_TRANSACTION_BLOCKS_UPDATE' } {
    const snap = this.getState();
    if (!snap.waitingWorkerPresent) return { applied: false, reason: 'NO_UPDATE_WAITING' };
    if (snap.activeTransactions > 0) return { applied: false, reason: 'ACTIVE_TRANSACTION_BLOCKS_UPDATE' };
    if (this.waitingWorker) {
      this.waitingWorker.postMessage({ type: 'LCXXVI_APPLY_SAFE_UPDATE' });
      this.waitingWorker = null;
    }
    this.simulatedWaiting = false;
    this.emit();
    return { applied: true, reason: 'APPLIED' };
  }

  async register(): Promise<void> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      this.registration = reg;
      if (reg.active) {
        this.offlineReady = true;
      }
      if (reg.waiting && navigator.serviceWorker.controller) {
        this.waitingWorker = reg.waiting;
      }
      reg.addEventListener('updatefound', () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              this.waitingWorker = reg.waiting ?? installing;
            } else {
              this.offlineReady = true;
            }
            this.emit();
          } else if (installing.state === 'activated') {
            this.offlineReady = true;
            this.emit();
          }
        });
      });
      void navigator.serviceWorker.ready.then(() => {
        this.offlineReady = true;
        this.emit();
      });
      this.emit();
    } catch {
      // Non-fatal in non-SW test harnesses
    }
  }

  async checkForUpdates(): Promise<void> {
    if (this.registration) {
      await this.registration.update();
    }
  }
}

export const offlineUpdateCoordinator = new OfflineUpdateCoordinator();

declare global {
  interface Window {
    __lcxxviOfflineCoordinator?: OfflineUpdateCoordinator;
  }
}

if (typeof window !== 'undefined') {
  window.__lcxxviOfflineCoordinator = offlineUpdateCoordinator;
}
