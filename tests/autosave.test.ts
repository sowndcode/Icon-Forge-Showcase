// Autosave keeps trying after a failed write (full disk, locked file) and says so once, not on every try.

import './helpers/canvasStub';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '../src/core/defaults';
import { db } from '../src/services/db';
import { commit, loadDoc } from '../src/state/doc';
import { autosaveFailing, saveNow } from '../src/state/project';
import { useUI } from '../src/state/ui';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('autosave failures', () => {
  it('retries until the write succeeds, with one error and one recovery notice', async () => {
    vi.useFakeTimers();
    loadDoc(createProject('Retry'));
    commit('Rename', (d) => ({ ...d, name: 'Retry 2' }));
    let fail = 3;
    const put = vi.spyOn(db, 'putProject').mockImplementation(async () => {
      if (fail-- > 0) throw new Error('the disk is full');
    });
    vi.spyOn(db, 'setKV').mockResolvedValue(undefined);
    useUI.setState({ toasts: [] });
    const seen = new Map<number, string>();
    const unsub = useUI.subscribe((st) => st.toasts.forEach((t) => seen.set(t.id, t.kind)));
    await saveNow();
    expect(autosaveFailing()).toBe(true);
    for (let i = 0; i < 4; i++) await vi.advanceTimersByTimeAsync(5000);
    expect(put).toHaveBeenCalledTimes(4);
    expect(autosaveFailing()).toBe(false);
    unsub();
    const kinds = [...seen.values()];
    expect(kinds.filter((k) => k === 'error')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'success')).toHaveLength(1);
    // nothing left to save: no further writes
    await vi.advanceTimersByTimeAsync(20000);
    expect(put).toHaveBeenCalledTimes(4);
  });
});
