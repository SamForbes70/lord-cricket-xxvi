import { describe, expect, it } from 'vitest';
import {
  EXPLICIT_RECOVERY_BUILD_PATH,
  OFFLINE_SAFE_UPDATE_VERSION,
  RETAINED_SUPPORTED_ENGINES,
  evaluateSafeUpdateOffer,
  offlineUpdateCoordinator,
} from '../../apps/web/src/offline-update.js';

describe('V01-027: offline assets and safe updates', () => {
  it('offers updates only when a staged worker is waiting and defers application during active transactions', () => {
    const idle = evaluateSafeUpdateOffer({
      waitingWorkerPresent: true,
      activeTransactionSources: new Set(),
    });
    expect(idle.version).toBe(OFFLINE_SAFE_UPDATE_VERSION);
    expect(idle.shouldRenderBanner).toBe(true);
    expect(idle.canApplyNow).toBe(true);
    expect(idle.deferredByActiveTransaction).toBe(false);
    expect(idle.supportedEngines).toEqual(RETAINED_SUPPORTED_ENGINES);
    expect(idle.recoveryBuildPath).toBe(EXPLICIT_RECOVERY_BUILD_PATH);

    const busy = evaluateSafeUpdateOffer({
      waitingWorkerPresent: true,
      activeTransactionSources: new Set(['match']),
    });
    expect(busy.shouldRenderBanner).toBe(true);
    expect(busy.canApplyNow).toBe(false);
    expect(busy.deferredByActiveTransaction).toBe(true);
  });

  it('refuses applySafeUpdate while match or career transactions are active and applies once idle', () => {
    offlineUpdateCoordinator.setBusySource('match', false);
    offlineUpdateCoordinator.setBusySource('career', false);
    offlineUpdateCoordinator.simulateWaitingUpdate(false);

    expect(offlineUpdateCoordinator.applySafeUpdate()).toEqual({
      applied: false,
      reason: 'NO_UPDATE_WAITING',
    });

    offlineUpdateCoordinator.simulateWaitingUpdate(true);
    offlineUpdateCoordinator.setBusySource('match', true);
    expect(offlineUpdateCoordinator.getState().canApplyNow).toBe(false);
    expect(offlineUpdateCoordinator.applySafeUpdate()).toEqual({
      applied: false,
      reason: 'ACTIVE_TRANSACTION_BLOCKS_UPDATE',
    });
    expect(offlineUpdateCoordinator.getState().waitingWorkerPresent).toBe(true);

    offlineUpdateCoordinator.setBusySource('match', false);
    expect(offlineUpdateCoordinator.getState().canApplyNow).toBe(true);
    expect(offlineUpdateCoordinator.applySafeUpdate()).toEqual({
      applied: true,
      reason: 'APPLIED',
    });
    expect(offlineUpdateCoordinator.getState().waitingWorkerPresent).toBe(false);
  });
});
