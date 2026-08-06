import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ONBOARDING_STEPS,
  nextOnboardingStep,
  saveOnboardingStep,
  loadOnboardingStep,
} from './onboarding';

describe('onboarding step machine', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('advances through each step in order', () => {
    expect(nextOnboardingStep('welcome')).toBe('rehearse');
    expect(nextOnboardingStep('rehearse')).toBe('notion');
    expect(nextOnboardingStep('notion')).toBe('meet');
  });

  it('returns null after the last step', () => {
    expect(nextOnboardingStep('meet')).toBeNull();
  });

  it('returns null for an unrecognized step', () => {
    // @ts-expect-error intentionally invalid step
    expect(nextOnboardingStep('not-a-step')).toBeNull();
  });

  it('covers every declared step exactly once', () => {
    expect(ONBOARDING_STEPS).toEqual(['welcome', 'rehearse', 'notion', 'meet']);
  });

  it('persists and reloads the current step', () => {
    expect(loadOnboardingStep()).toBeNull();
    saveOnboardingStep('rehearse');
    expect(loadOnboardingStep()).toBe('rehearse');
  });

  it('ignores garbage previously stored under the key', () => {
    window.localStorage.setItem('stash_onboarding_step', 'garbage');
    expect(loadOnboardingStep()).toBeNull();
  });

  it('does not throw when localStorage access fails', () => {
    const spy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('locked down');
    });
    expect(() => saveOnboardingStep('meet')).not.toThrow();
    spy.mockRestore();
  });
});
