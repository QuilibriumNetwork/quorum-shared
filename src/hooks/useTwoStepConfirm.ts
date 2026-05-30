/**
 * useTwoStepConfirm
 *
 * Two-step confirmation primitive for destructive actions. First call to
 * `armOrConfirm` arms the confirmation (sets step to 1) and starts a
 * timeout; the second call within the timeout window executes the action.
 * If the timeout elapses, the state resets and the next call re-arms.
 *
 * Extracted from desktop's `useUserKicking` and `useSpaceLeaving`, which
 * each inlined the same state machine. Mobile's `useUserKicking` inlined
 * the identical pattern. This hook is the shared primitive; consumers on
 * either platform can adopt it incrementally.
 *
 * Uses `ReturnType<typeof setTimeout>` for the timeout handle so it works
 * in both browser and React Native runtimes without ambient `NodeJS.*`
 * types.
 */

import { useState, useCallback, useEffect, useRef } from 'react';

export interface UseTwoStepConfirmOptions {
  /**
   * Milliseconds the armed state stays active before auto-resetting.
   * Default: 5000.
   */
  timeoutMs?: number;
}

export interface UseTwoStepConfirmResult {
  /**
   * Current step. 0 = idle, 1 = armed (one click away from confirmation).
   */
  confirmationStep: 0 | 1;

  /**
   * Arm on first call, confirm on second.
   *
   * - If `confirmationStep` is 0: arms the confirmation and starts the
   *   auto-reset timeout. Does NOT invoke `onConfirm`.
   * - If `confirmationStep` is 1: clears the timeout and invokes
   *   `onConfirm`. The caller is responsible for awaiting its result.
   *
   * `onConfirm` may return a promise; the hook does not await it. State
   * resets to idle as soon as the second call fires.
   */
  armOrConfirm: (onConfirm: () => void | Promise<void>) => void;

  /**
   * Cancel any in-flight arming and reset to step 0.
   */
  resetConfirmation: () => void;
}

const DEFAULT_TIMEOUT_MS = 5000;

export function useTwoStepConfirm(
  options: UseTwoStepConfirmOptions = {}
): UseTwoStepConfirmResult {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const [confirmationStep, setConfirmationStep] = useState<0 | 1>(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending timeout on unmount so we don't try to set state on
  // an unmounted component.
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const clearPendingTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const resetConfirmation = useCallback(() => {
    clearPendingTimeout();
    setConfirmationStep(0);
  }, [clearPendingTimeout]);

  const armOrConfirm = useCallback(
    (onConfirm: () => void | Promise<void>) => {
      if (confirmationStep === 0) {
        setConfirmationStep(1);
        clearPendingTimeout();
        timeoutRef.current = setTimeout(() => {
          timeoutRef.current = null;
          setConfirmationStep(0);
        }, timeoutMs);
      } else {
        clearPendingTimeout();
        setConfirmationStep(0);
        onConfirm();
      }
    },
    [confirmationStep, timeoutMs, clearPendingTimeout]
  );

  return {
    confirmationStep,
    armOrConfirm,
    resetConfirmation,
  };
}
