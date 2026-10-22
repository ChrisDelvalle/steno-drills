import type { ListeningOptions } from './types';

// Wire IDs are fixed in v5; do not reorder this table.
export const speechRates = [.5, .6, .7, .8, .9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2] as const;
export const listeningDefaults = (): ListeningOptions => ({ enabled: false, display: 'full', rate: 1 });
export function validateListening(value: unknown): ListeningOptions {
  if (value === undefined) return listeningDefaults();
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid audio settings.');
  const v = value as Record<string, unknown>;
  if (typeof v.enabled !== 'boolean' || !['full', 'current', 'hidden'].includes(String(v.display)) || !speechRates.includes(v.rate as typeof speechRates[number])) throw new Error('Invalid audio settings.');
  return { enabled: v.enabled, display: v.display as ListeningOptions['display'], rate: v.rate as number };
}
