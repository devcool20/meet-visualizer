import { describe, it, expect } from 'vitest';
import {
  SENSITIVITY_STOPS,
  SENSITIVITY_LABELS,
  sensitivityToStopIndex,
  stopIndexToSensitivity,
} from './sensitivity';

describe('sensitivity mapping', () => {
  it('has a label for every stop', () => {
    for (const stop of SENSITIVITY_STOPS) {
      expect(SENSITIVITY_LABELS[stop]).toBeTruthy();
    }
  });

  it('round-trips every stop through index conversions', () => {
    for (let i = 0; i < SENSITIVITY_STOPS.length; i++) {
      const sensitivity = stopIndexToSensitivity(i);
      expect(sensitivity).toBe(SENSITIVITY_STOPS[i]);
      expect(sensitivityToStopIndex(sensitivity)).toBe(i);
    }
  });

  it('defaults unknown sensitivities to the balanced index', () => {
    // @ts-expect-error intentionally passing an invalid value
    expect(sensitivityToStopIndex('not-a-real-value')).toBe(1);
  });

  it('clamps out-of-range indices', () => {
    expect(stopIndexToSensitivity(-5)).toBe('certain');
    expect(stopIndexToSensitivity(99)).toBe('eager');
  });

  it('rounds fractional indices', () => {
    expect(stopIndexToSensitivity(0.4)).toBe('certain');
    expect(stopIndexToSensitivity(1.6)).toBe('eager');
  });
});
