import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SETUP_STEPS,
  nextSetupStep,
  firstIncompleteStep,
  isSetupComplete,
  saveSetupStep,
  loadSetupStep,
  markRehearsed,
  hasRehearsed,
  LEGACY_STEP_MAP,
  type SetupSignals,
} from './setup';

describe('setup state machine', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('has the correct step order', () => {
    expect(SETUP_STEPS).toEqual(['welcome', 'extension', 'data', 'rehearse', 'meet']);
  });

  it('advances through each step in order', () => {
    expect(nextSetupStep('welcome')).toBe('extension');
    expect(nextSetupStep('extension')).toBe('data');
    expect(nextSetupStep('data')).toBe('rehearse');
    expect(nextSetupStep('rehearse')).toBe('meet');
  });

  it('returns null after the last step', () => {
    expect(nextSetupStep('meet')).toBeNull();
  });

  it('returns null for an unrecognized step', () => {
    expect(nextSetupStep('garbage' as any)).toBeNull();
  });

  describe('firstIncompleteStep', () => {
    const allDone: SetupSignals = {
      extensionPaired: true,
      aiProviderAvailable: true,
      notionConnected: false,
      rehearsed: true,
    };

    it('returns null when all required steps are done', () => {
      expect(firstIncompleteStep(allDone)).toBeNull();
    });

    it('returns extension when not paired', () => {
      expect(firstIncompleteStep({ ...allDone, extensionPaired: false })).toBe('extension');
    });

    it('returns data when no AI provider and no notion', () => {
      expect(firstIncompleteStep({ ...allDone, aiProviderAvailable: false })).toBe('data');
    });

    it('returns data when notion is connected (aiProviderAvailable false but notion true) is done', () => {
      expect(firstIncompleteStep({ ...allDone, aiProviderAvailable: false, notionConnected: true })).toBeNull();
    });

    it('returns rehearse when not rehearsed', () => {
      expect(firstIncompleteStep({ ...allDone, rehearsed: false })).toBe('rehearse');
    });

    it('returns the first missing step when multiple are incomplete', () => {
      expect(firstIncompleteStep({ extensionPaired: false, aiProviderAvailable: false, notionConnected: false, rehearsed: false })).toBe('extension');
    });
  });

  describe('isSetupComplete', () => {
    it('returns true when all required done', () => {
      expect(isSetupComplete({ extensionPaired: true, aiProviderAvailable: true, notionConnected: false, rehearsed: true })).toBe(true);
    });

    it('returns false when any required step is not done', () => {
      expect(isSetupComplete({ extensionPaired: false, aiProviderAvailable: false, notionConnected: false, rehearsed: false })).toBe(false);
    });
  });

  describe('persistence', () => {
    it('saves and loads a step', () => {
      expect(loadSetupStep()).toBeNull();
      saveSetupStep('extension');
      expect(loadSetupStep()).toBe('extension');
    });

    it('ignores garbage under the new key', () => {
      window.localStorage.setItem('stash_setup_step_v1', 'garbage');
      expect(loadSetupStep()).toBeNull();
    });

    it('does not throw when localStorage access fails', () => {
      const spy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
        throw new Error('locked down');
      });
      expect(() => saveSetupStep('meet')).not.toThrow();
      spy.mockRestore();
    });
  });

  describe('legacy migration', () => {
    it('maps legacy onboarding steps correctly', () => {
      expect(LEGACY_STEP_MAP).toEqual({
        welcome: 'welcome',
        rehearse: 'rehearse',
        notion: 'data',
        meet: 'meet',
      });
    });

    it('migrates a legacy stash_onboarding_step value on first load', () => {
      window.localStorage.setItem('stash_onboarding_step', 'notion');
      expect(loadSetupStep()).toBe('data');
      // New key is set; legacy is removed.
      expect(window.localStorage.getItem('stash_onboarding_step')).toBeNull();
      expect(window.localStorage.getItem('stash_setup_step_v1')).toBe('data');
    });

    it('prefers the new key over legacy', () => {
      window.localStorage.setItem('stash_setup_step_v1', 'rehearse');
      window.localStorage.setItem('stash_onboarding_step', 'meet');
      expect(loadSetupStep()).toBe('rehearse');
      // Legacy should still be removed.
      expect(window.localStorage.getItem('stash_onboarding_step')).toBeNull();
    });

    it('returns null when neither key exists', () => {
      expect(loadSetupStep()).toBeNull();
    });
  });

  describe('rehearsed flag', () => {
    it('defaults to false', () => {
      expect(hasRehearsed()).toBe(false);
    });

    it('returns true after markRehearsed', () => {
      markRehearsed();
      expect(hasRehearsed()).toBe(true);
    });

    it('tolerates disabled storage', () => {
      // Simulate locked-down storage: spy on both setItem and getItem.
      const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('locked down');
      });
      const getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('locked down');
      });
      expect(() => markRehearsed()).not.toThrow();
      expect(hasRehearsed()).toBe(false);
      setSpy.mockRestore();
      getSpy.mockRestore();
    });
  });
});
