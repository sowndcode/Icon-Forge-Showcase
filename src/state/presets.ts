// Reusable styles / layouts / templates / export presets (global, IndexedDB).

import { create } from 'zustand';
import { uid } from '../core/ids';
import type { PresetKind, StoredPreset } from '../core/types';
import { db } from '../services/db';
import { toast } from './ui';

interface PresetState {
  list: StoredPreset[];
  loaded: boolean;
}

export const usePresetStore = create<PresetState>(() => ({ list: [], loaded: false }));

export async function refreshPresets() {
  try {
    const list = await db.listPresets();
    usePresetStore.setState({ list: list.sort((a, b) => b.createdAt - a.createdAt), loaded: true });
  } catch {
    usePresetStore.setState({ loaded: true });
  }
}

export function usePresets<T = unknown>(kind: PresetKind): StoredPreset<T>[] {
  const list = usePresetStore((s) => s.list);
  const loaded = usePresetStore((s) => s.loaded);
  if (!loaded) void refreshPresets();
  return list.filter((p) => p.kind === kind) as StoredPreset<T>[];
}

export async function savePreset<T>(kind: PresetKind, name: string, data: T) {
  await db.putPreset({ id: uid('pre'), kind, name, createdAt: Date.now(), data });
  await refreshPresets();
  toast(`Saved “${name}”`, 'success');
}

export async function deletePreset(id: string) {
  await db.deletePreset(id);
  await refreshPresets();
}
