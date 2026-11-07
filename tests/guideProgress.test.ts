// Guide progress: action lessons complete only when the action really happens in the app; reading
// lessons only when marked as read. Opening, switching or closing projects never completes anything,
// and progress is global (kept with the preferences), so it survives all of that.

import './helpers/canvasStub';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPage, createProject, createText } from '../src/core/defaults';
import type { AssetRecord } from '../src/core/types';
import { commit, getDoc, loadDoc, unloadDoc, withPage } from '../src/state/doc';
import { completeLesson, guideAction, lessonDone, resetGuideProgress, startGuideTracking, unmarkRead } from '../src/state/guideProgress';
import { applyLayout } from '../src/state/layoutActions';
import { newImageObject } from '../src/state/objects';
import { usePrefs } from '../src/state/prefs';

const icon = (i: number): AssetRecord => ({ id: 'as' + i, name: `i${i}.png`, format: 'png', kind: 'asset', folder: '', category: '', width: 64, height: 64, bytes: 1, importIndex: i, addedAt: 1, status: 'ready', alpha: { bounds: { x: 4, y: 4, w: 56, h: 56 }, occupancy: 0.6, fill: 0.8, hasAlpha: true, empty: false, centroid: { x: 32, y: 32 } } });
const done = () => Object.keys(usePrefs.getState().guideProgress).sort();

let stop: (() => void) | null = null;
beforeEach(() => {
  stop?.();
  resetGuideProgress();
  unloadDoc();
  stop = startGuideTracking();
});

function projectWith(n: number, texts = 0) {
  const d = createProject('P');
  d.assets = Array.from({ length: n }, (_, i) => icon(i));
  const p = createPage('Page', 1920, 1080);
  p.objects = [...d.assets.map((a) => newImageObject(a.id, { x: 960, y: 540 }, p, 0.05)), ...Array.from({ length: texts }, (_, i) => createText(`T${i}`, 960, 100 + i * 50))];
  d.pages = [p];
  d.activePageId = p.id;
  return d;
}

describe('guide progress', () => {
  it('a first-time user has nothing complete', () => {
    expect(done()).toEqual([]);
  });

  it('opening a project that already has icons, layouts and text completes nothing', () => {
    loadDoc(projectWith(10, 2));
    loadDoc(projectWith(5, 1));
    unloadDoc();
    expect(done()).toEqual([]);
  });

  it('action lessons complete when the action happens', () => {
    loadDoc(projectWith(0));
    // import: icons added to the open project
    commit('Import', (d) => ({ ...d, assets: [icon(1), icon(2)] }));
    expect(lessonDone('import')?.how).toBe('action');
    // a layout applied
    commit('Add', (d) => withPage(d, (p) => ({ ...p, objects: d.assets.map((a) => newImageObject(a.id, { x: 100, y: 100 }, p, 0.05)) })));
    expect(lessonDone('arrange')).toBeUndefined();
    applyLayout('grid');
    expect(lessonDone('arrange')?.how).toBe('action');
    // a text added
    commit('Text', (d) => withPage(d, (p) => ({ ...p, objects: [...p.objects, createText('Title', 960, 100)] })));
    expect(lessonDone('title')?.how).toBe('action');
    // the background changed
    commit('Background', (d) => withPage(d, (p) => ({ ...p, background: { ...p.background, type: 'solid', color: '#123456' } })));
    expect(lessonDone('background')?.how).toBe('action');
    // export and generators report themselves
    expect(lessonDone('export')).toBeUndefined();
    guideAction('export');
    expect(lessonDone('export')?.how).toBe('action');
  });

  it('moving or editing existing text does not count as adding a title', () => {
    loadDoc(projectWith(2, 1));
    commit('Move', (d) => withPage(d, (p) => ({ ...p, objects: p.objects.map((o) => ({ ...o, x: o.x + 10 })) })));
    expect(lessonDone('title')).toBeUndefined();
  });

  it('reading lessons complete only when marked as read, and can be undone', () => {
    expect(lessonDone('faq')).toBeUndefined();
    completeLesson('faq', 'read');
    expect(lessonDone('faq')?.how).toBe('read');
    unmarkRead('faq');
    expect(lessonDone('faq')).toBeUndefined();
    // an action lesson is never undone by "unmark"
    guideAction('export');
    unmarkRead('export');
    expect(lessonDone('export')?.how).toBe('action');
  });

  it('progress is global: switching and closing projects keeps it', () => {
    loadDoc(projectWith(0));
    commit('Import', (d) => ({ ...d, assets: [icon(1)] }));
    completeLesson('keys', 'read');
    loadDoc(projectWith(3));
    unloadDoc();
    expect(done()).toEqual(['import', 'keys']);
    // and it is what gets saved with the preferences
    expect(Object.keys(usePrefs.getState().guideProgress)).toContain('import');
    expect(getDoc().id).toBe('');
  });
});
