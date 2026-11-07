// Guide progress. Two kinds of lessons:
//   - action lessons complete when you actually do the thing in the app (an import that added icons,
//     a layout applied, a text added, a background changed, a successful export…);
//   - reading lessons complete when you mark them as read.
// Progress is global (not per project), kept with the preferences, so it survives switching projects,
// closing and restarting the app. Scrolling never completes anything.

import { useDoc, activePageOf } from './doc';
import { usePrefs } from './prefs';

export type GuideAction = 'import' | 'arrange' | 'title' | 'background' | 'export' | 'storeset' | 'catalog' | 'template' | 'page' | 'project';

export interface LessonDone {
  how: 'action' | 'read';
  at: number;
}

export const lessonDone = (id: string): LessonDone | undefined => usePrefs.getState().guideProgress[id];

/** A lesson is complete (by doing it or by reading it). */
export function completeLesson(id: string, how: LessonDone['how']) {
  const p = usePrefs.getState();
  if (p.guideProgress[id]) return;
  p.setPrefs({ guideProgress: { ...p.guideProgress, [id]: { how, at: Date.now() } } });
}

/** Undo "Mark as read" (action lessons stay done: they record something you did). */
export function unmarkRead(id: string) {
  const p = usePrefs.getState();
  if (p.guideProgress[id]?.how !== 'read') return;
  const next = { ...p.guideProgress };
  delete next[id];
  p.setPrefs({ guideProgress: next });
}

export function resetGuideProgress() {
  usePrefs.getState().setPrefs({ guideProgress: {} });
}

/** Which lessons an action completes (lesson ids in the Guide). */
const ACTION_LESSONS: Record<GuideAction, string[]> = {
  import: ['import'],
  arrange: ['arrange'],
  title: ['title'],
  background: ['background'],
  export: ['export'],
  storeset: ['storeset'],
  catalog: ['catalog'],
  template: ['templates'],
  page: ['pages'],
  project: ['projects'],
};

/** Something the Guide teaches was done in the app. */
export function guideAction(a: GuideAction) {
  for (const id of ACTION_LESSONS[a]) completeLesson(id, 'action');
}

/**
 * Notice actions in the open project as they happen: icons imported, a layout applied, a text added,
 * the background changed, pages added. Opening, closing or switching projects is not an action.
 */
export function startGuideTracking(): () => void {
  return useDoc.subscribe((s, prev) => {
    if (!s.open || !prev.open || s.doc.id !== prev.doc.id || s.doc === prev.doc) return;
    const a = s.doc,
      b = prev.doc;
    if (a.assets !== b.assets && a.assets.filter((x) => x.kind === 'asset').length > b.assets.filter((x) => x.kind === 'asset').length) guideAction('import');
    if (a.pages.length > b.pages.length) guideAction('page');
    const pa = activePageOf(a),
      pb = activePageOf(b);
    if (!pa || !pb || pa.id !== pb.id || pa === pb) return;
    if (pa.layouts.some((l) => !pb.layouts.some((x) => x.id === l.id))) guideAction('arrange');
    if (pa.objects !== pb.objects) {
      const before = new Set(pb.objects.filter((o) => o.type === 'text').map((o) => o.id));
      if (pa.objects.some((o) => o.type === 'text' && !before.has(o.id))) guideAction('title');
    }
    if (pa.background !== pb.background && JSON.stringify(pa.background) !== JSON.stringify(pb.background)) guideAction('background');
  });
}
