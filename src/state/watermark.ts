// Watermark editing. The watermark belongs to the project (not to a page) and is undoable like any
// other edit; slider drags merge into one undo step. Nothing here touches pages or images.

import { cleanWatermark, defaultLayer, emptyWatermark, presetLayers, WATERMARK_PRESETS, type WatermarkPreset } from '../core/watermark';
import type { ProjectDoc, WatermarkLayer, WatermarkSettings } from '../core/types';
import { uid } from '../core/ids';
import { commit, getDoc } from './doc';
import { usePrefs } from './prefs';

export const getWatermark = (d: ProjectDoc = getDoc()): WatermarkSettings => cleanWatermark(d.watermark);

export function setWatermark(fn: (w: WatermarkSettings) => WatermarkSettings, label = 'Watermark', key?: string) {
  commit(label, (d) => ({ ...d, watermark: fn(getWatermark(d)) }), { key: key ? 'wm:' + key : undefined });
}

export function updateLayer(id: string, patch: Partial<WatermarkLayer>, key?: string) {
  setWatermark((w) => ({ ...w, layers: w.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) }), 'Watermark layer', key ? `${id}:${key}` : undefined);
}

export function addLayer(kind: 'text' | 'image', patch: Partial<WatermarkLayer> = {}): WatermarkLayer {
  const layer = defaultLayer(kind, patch);
  setWatermark((w) => ({ ...w, enabled: true, layers: [...w.layers, layer] }), kind === 'text' ? 'Add watermark text' : 'Add watermark logo');
  return layer;
}

export function removeLayer(id: string) {
  setWatermark((w) => ({ ...w, layers: w.layers.filter((l) => l.id !== id) }), 'Delete watermark layer');
}

export function duplicateLayer(id: string): string | undefined {
  const l = getWatermark().layers.find((x) => x.id === id);
  if (!l) return;
  const copy = { ...structuredClone(l), id: uid('wm'), name: `${l.name} copy` };
  setWatermark((w) => {
    const i = w.layers.findIndex((x) => x.id === id);
    const layers = w.layers.slice();
    layers.splice(i + 1, 0, copy);
    return { ...w, layers };
  }, 'Duplicate watermark layer');
  return copy.id;
}

/** Move a layer one step up (drawn later, on top) or down. */
export function moveLayer(id: string, dir: 1 | -1) {
  setWatermark((w) => {
    const i = w.layers.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= w.layers.length) return w;
    const layers = w.layers.slice();
    [layers[i], layers[j]] = [layers[j], layers[i]];
    return { ...w, layers };
  }, 'Reorder watermark layers');
}

/** Replace the layers with a preset's (scope and on/off stay). `logoId` fills image layers. */
export function applyWatermarkPreset(p: Pick<WatermarkPreset, 'layers' | 'name'>, mode: 'replace' | 'add' = 'replace', logoId?: string) {
  const layers = presetLayers(p, logoId);
  setWatermark((w) => ({ ...w, enabled: true, layers: mode === 'replace' ? layers : [...w.layers, ...layers] }), `Watermark: ${p.name}`);
}

/** Watermark for a new project, from Settings ▸ Watermark (off unless the user turned it on). */
export function newProjectWatermark(): WatermarkSettings | undefined {
  const d = usePrefs.getState().wmDefaults;
  if (!d.newProjects) return undefined;
  const preset = WATERMARK_PRESETS.find((p) => p.id === d.preset) ?? WATERMARK_PRESETS[0];
  // a logo preset needs a logo the new project does not have yet: keep only its text layers
  const layers = presetLayers({ layers: preset.layers.filter((l) => l.kind !== 'image') });
  return layers.length ? { ...emptyWatermark(), enabled: true, layers } : undefined;
}

/** Token values for a project (the page name is filled in per page). */
export function wmVars(d: ProjectDoc = getDoc()): Record<string, string> {
  const now = new Date();
  const brand = usePrefs.getState().brandName.trim() || d.name;
  return {
    brand,
    project: d.name,
    year: String(now.getFullYear()),
    date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    count: String(d.assets.filter((a) => a.kind === 'asset').length),
  };
}
