// Settings: restoring defaults (all or one section) never touches collected things, and new-object
// defaults read from preferences leave saved work alone.

import './helpers/canvasStub';
import { describe, expect, it } from 'vitest';
import { KEPT_ON_RESET, prefDefault, resetPrefs, usePrefs } from '../src/state/prefs';
import { newParams } from '../src/state/layoutActions';
import { getAlgorithm, defaultParams } from '../src/layout/registry';
import { newProjectWatermark } from '../src/state/watermark';

describe('Settings reset', () => {
  it('restore all keeps favourites, recents, pinned projects and the brand name', () => {
    const { setPrefs } = usePrefs.getState();
    setPrefs({ theme: 'light', historyLimit: 40, favLayouts: ['grid'], recentLayouts: ['floor'], favTextStyles: ['x'], favExports: ['b:PNG'], brandName: 'Studio', pinnedProjects: ['p1'] });
    resetPrefs();
    const p = usePrefs.getState();
    expect(p.theme).toBe(prefDefault('theme'));
    expect(p.historyLimit).toBe(prefDefault('historyLimit'));
    expect(p.favLayouts).toEqual(['grid']);
    expect(p.recentLayouts).toEqual(['floor']);
    expect(p.favTextStyles).toEqual(['x']);
    expect(p.favExports).toEqual(['b:PNG']);
    expect(p.brandName).toBe('Studio');
    expect(p.pinnedProjects).toEqual(['p1']);
    for (const k of KEPT_ON_RESET) expect(k in p).toBe(true);
  });

  it('a section reset only restores its own keys', () => {
    const { setPrefs } = usePrefs.getState();
    setPrefs({ theme: 'light', autosaveDelay: 3, startScreen: 'last' });
    resetPrefs(['autosaveDelay', 'startScreen']);
    const p = usePrefs.getState();
    expect(p.autosaveDelay).toBe(prefDefault('autosaveDelay'));
    expect(p.startScreen).toBe(prefDefault('startScreen'));
    expect(p.theme).toBe('light');
    resetPrefs(['theme']);
  });

  it('reset does not share nested objects with the defaults', () => {
    resetPrefs(['snap']);
    usePrefs.getState().setSnap({ gridSize: 77 });
    expect(prefDefault('snap').gridSize).not.toBe(77);
    resetPrefs(['snap']);
  });
});

describe('Defaults for new work', () => {
  it('new grids use the grid cap from settings; saved defaults stay uncapped', () => {
    const alg = getAlgorithm('grid');
    expect(defaultParams(alg).maxCell).toBe(0);
    usePrefs.getState().setPrefs({ gridMaxCell: 0.5 });
    expect(newParams(alg).maxCell).toBe(0.5);
    usePrefs.getState().setPrefs({ gridMaxCell: 0 });
    expect(newParams(alg).maxCell).toBe(0);
    resetPrefs(['gridMaxCell']);
  });

  it('new projects get no watermark unless turned on, and then only text layers', () => {
    expect(newProjectWatermark()).toBeUndefined();
    usePrefs.getState().setPrefs({ wmDefaults: { newProjects: true, preset: 'small-logo' } });
    const w = newProjectWatermark();
    expect(w === undefined || w.layers.every((l) => l.kind === 'text')).toBe(true);
    usePrefs.getState().setPrefs({ wmDefaults: { newProjects: true, preset: 'corner-signature' } });
    expect(newProjectWatermark()?.layers.length).toBeGreaterThan(0);
    resetPrefs(['wmDefaults']);
    expect(newProjectWatermark()).toBeUndefined();
  });
});
