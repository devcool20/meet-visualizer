/**
 * Sensitivity is a three-stop slider in the UI (plan §4.3 Settings) mapped
 * to `UserSettings['sensitivity']`. The raw match threshold used by the
 * matcher is never shown — this module is the ONLY place that maps between
 * the slider's 0/1/2 index and the enum, so no component can accidentally
 * leak or invent a raw number.
 */
import type { UserSettings } from '@stash/card-spec';

export const SENSITIVITY_STOPS: UserSettings['sensitivity'][] = ['certain', 'balanced', 'eager'];

export const SENSITIVITY_LABELS: Record<UserSettings['sensitivity'], string> = {
  certain: 'Only when I’m certain',
  balanced: 'Balanced',
  eager: 'Eager',
};

export function sensitivityToStopIndex(sensitivity: UserSettings['sensitivity']): number {
  const idx = SENSITIVITY_STOPS.indexOf(sensitivity);
  return idx === -1 ? 1 : idx;
}

export function stopIndexToSensitivity(index: number): UserSettings['sensitivity'] {
  const clamped = Math.min(Math.max(Math.round(index), 0), SENSITIVITY_STOPS.length - 1);
  return SENSITIVITY_STOPS[clamped];
}
