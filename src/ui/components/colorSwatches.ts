// Swatches offered by every colour field: colours found in the project's icons (kept in sync by
// <PaletteSync/>), the colours used most recently, and a fixed set of basics.

import { create } from 'zustand';

export const BASIC_SWATCHES = [
  '#ffffff', '#e5e7eb', '#9ca3af', '#4b5563', '#1f2937', '#000000',
  '#ef4444', '#f97316', '#f59e0b', '#facc15', '#84cc16', '#22c55e',
  '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef',
  '#ec4899', '#f43f5e', '#7c2d12', '#78350f', '#fde68a', '#fbcfe8',
];

const RECENT_KEY = 'asset-forge-showcase:recent-colors';

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((c): c is string => typeof c === 'string').slice(0, 12) : [];
  } catch {
    return [];
  }
}

export const useSwatches = create<{ icon: string[]; match: string[]; recent: string[] }>(() => ({ icon: [], match: [], recent: readRecent() }));

export function pushRecentColor(c: string) {
  if (!/^#[0-9a-f]{6}$/i.test(c)) return;
  const recent = [c.toLowerCase(), ...useSwatches.getState().recent.filter((x) => x !== c.toLowerCase())].slice(0, 12);
  useSwatches.setState({ recent });
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
  } catch {
    /* recent colours are a convenience */
  }
}
