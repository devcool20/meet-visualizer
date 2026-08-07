/**
 * V1 setup funnel state machine (plan §4).
 *
 * Lives alongside the legacy onboarding machine (`src/lib/onboarding.ts`)
 * without modifying it, so `src/lib/onboarding.test.ts` passes unchanged.
 * Setup completion is derived from live signals (D2), not from the
 * persisted step alone. The persisted step is a resume hint.
 */

export type SetupStep = 'welcome' | 'extension' | 'data' | 'rehearse' | 'meet';

export const SETUP_STEPS: SetupStep[] = ['welcome', 'extension', 'data', 'rehearse', 'meet'];

export const SETUP_STEP_ROUTES: Record<SetupStep, string> = {
  welcome: '/welcome',
  extension: '/setup/extension',
  data: '/setup/data',
  rehearse: '/rehearse',
  meet: '/meet',
};

export interface SetupSignals {
  extensionPaired: boolean;
  aiProviderAvailable: boolean;
  notionConnected: boolean;
  rehearsed: boolean;
}

export interface SetupItemStatus {
  step: SetupStep;
  done: boolean;
  required: boolean;
}

export function nextSetupStep(step: SetupStep): SetupStep | null {
  const idx = SETUP_STEPS.indexOf(step);
  if (idx === -1 || idx === SETUP_STEPS.length - 1) return null;
  return SETUP_STEPS[idx + 1];
}

export function setupItems(signals: SetupSignals): SetupItemStatus[] {
  return [
    { step: 'welcome', done: true, required: true },
    { step: 'extension', done: signals.extensionPaired, required: true },
    { step: 'data', done: signals.aiProviderAvailable || signals.notionConnected, required: true },
    { step: 'rehearse', done: signals.rehearsed, required: true },
    { step: 'meet', done: false, required: false },
  ];
}

export function firstIncompleteStep(signals: SetupSignals): SetupStep | null {
  for (const item of setupItems(signals)) {
    if (item.required && !item.done) return item.step;
  }
  return null;
}

export function isSetupComplete(signals: SetupSignals): boolean {
  return firstIncompleteStep(signals) === null;
}

const SETUP_STEP_KEY = 'stash_setup_step_v1';
const LEGACY_KEY = 'stash_onboarding_step';

/** Maps legacy onboarding step values to the new setup equivalents. */
export const LEGACY_STEP_MAP: Record<string, SetupStep> = {
  welcome: 'welcome',
  rehearse: 'rehearse',
  notion: 'data',
  meet: 'meet',
};

export function saveSetupStep(step: SetupStep): void {
  try {
    window.localStorage.setItem(SETUP_STEP_KEY, step);
  } catch {
    // localStorage unavailable — setup still works, just not resumable.
  }
}

export function loadSetupStep(): SetupStep | null {
  try {
    // Try the new key first.
    const raw = window.localStorage.getItem(SETUP_STEP_KEY);
    if (raw && (SETUP_STEPS as string[]).includes(raw)) {
      // Clean up legacy key if it exists.
      try {
        window.localStorage.removeItem(LEGACY_KEY);
      } catch {
        // Non-critical.
      }
      return raw as SetupStep;
    }
    // Fall through to legacy migration.
  } catch {
    // Ignore and try legacy.
  }
  // One-way migration from legacy key.
  try {
    const legacy = window.localStorage.getItem(LEGACY_KEY);
    if (legacy && LEGACY_STEP_MAP[legacy]) {
      const mapped = LEGACY_STEP_MAP[legacy];
      saveSetupStep(mapped);
      try {
        window.localStorage.removeItem(LEGACY_KEY);
      } catch {
        // Non-critical cleanup.
      }
      return mapped;
    }
  } catch {
    // Ignore.
  }
  return null;
}

const REHEARSED_KEY = 'stash_setup_rehearsed';

export function markRehearsed(): void {
  try {
    window.localStorage.setItem(REHEARSED_KEY, '1');
  } catch {
    // Non-critical.
  }
}

export function hasRehearsed(): boolean {
  try {
    return window.localStorage.getItem(REHEARSED_KEY) === '1';
  } catch {
    return false;
  }
}
