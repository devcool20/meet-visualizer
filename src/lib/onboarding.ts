/**
 * Onboarding funnel step machine (plan §4.2). Kept as a pure, tiny state
 * machine — separate from the page components — so the funnel's order and
 * transitions are unit-testable, and so a page reload (step 5, "silent
 * pairing") can rehydrate from a single persisted string instead of complex
 * component state.
 */
export type OnboardingStep =
  | 'welcome' // 3 sample cards seeded and shown
  | 'rehearse' // extension detection + pairing + camera/mic + first card
  | 'notion' // "now use your real data" — skippable
  | 'meet'; // "join a real Google Meet"

export const ONBOARDING_STEPS: OnboardingStep[] = ['welcome', 'rehearse', 'notion', 'meet'];

export function nextOnboardingStep(step: OnboardingStep): OnboardingStep | null {
  const idx = ONBOARDING_STEPS.indexOf(step);
  if (idx === -1 || idx === ONBOARDING_STEPS.length - 1) return null;
  return ONBOARDING_STEPS[idx + 1];
}

const STORAGE_KEY = 'stash_onboarding_step';

/** Persists the current step across the automatic reload in step 5. */
export function saveOnboardingStep(step: OnboardingStep): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, step);
  } catch {
    // localStorage can throw in locked-down contexts; onboarding still
    // works, it just won't survive a reload.
  }
}

export function loadOnboardingStep(): OnboardingStep | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw && (ONBOARDING_STEPS as string[]).includes(raw) ? (raw as OnboardingStep) : null;
  } catch {
    return null;
  }
}
