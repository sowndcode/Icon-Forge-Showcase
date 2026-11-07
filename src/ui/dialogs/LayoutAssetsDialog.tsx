// Choose which icons a layout uses. The choice belongs to the layout: Apply adds and removes only
// that layout's icons and runs it again; the page's background, theme and text stay as they are.
// Cancel changes nothing. Libraries of thousands of icons stay quick: the grids mount only what is
// on screen.

import { useMemo, useState } from 'react';
import { Dices, Search, Trash2 } from 'lucide-react';
import type { AssetRecord, AssetSelection, LayoutInstance, Page } from '../../core/types';
import { useDoc } from '../../state/doc';
import { deleteAssetSet, layoutSelection, newSeed, resolveSelection, saveAssetSet, selectableAssets, setLayoutAssets } from '../../state/assetSelection';
import { toast } from '../../state/ui';
import { Modal, NumberField, Seg } from '../components/controls';
import { askConfirm, askText } from '../components/ask';
import { categoryColor } from '../components/categoryColors';
import { VirtualGrid } from '../components/VirtualGrid';
import { StoredThumb } from './ProjectAssetPicker';

type Mode = AssetSelection['mode'] | 'saved';

const fmt = (n: number) => n.toLocaleString('en-US');

/** Short description of a layout's icon choice, for the Layout panel. */
export function selectionSummary(sel: AssetSelection, count: number, total: number): string {
  switch (sel.mode) {
    case 'all':
      return `All ${fmt(total)} icons`;
    case 'categories':
      return `${fmt(count)} icons from ${sel.categories?.length ?? 0} ${sel.categories?.length === 1 ? 'category' : 'categories'}`;
    case 'random':
      return `${fmt(count)} random of ${fmt(total)}`;
    default:
      return count === total ? `All ${fmt(total)} icons` : `${fmt(count)} of ${fmt(total)} icons`;
  }
}

function Tile({ a, on, onClick, readOnly }: { a: AssetRecord; on: boolean; onClick?: () => void; readOnly?: boolean }) {
  return (
    <button role="option" aria-selected={on} className={`pap-tile ${on ? 'on' : ''} ${readOnly ? 'ro' : ''}`} onClick={onClick} tabIndex={readOnly ? -1 : 0} title={`${a.name}${a.category ? ` · ${a.category}` : ''}`}>
      <StoredThumb id={a.id} w={a.width} h={a.height} />
      <span className="pap-name">{a.name}</span>
      {!readOnly && <input type="checkbox" tabIndex={-1} readOnly checked={on} aria-hidden />}
    </button>
  );
}

export function LayoutAssetsDialog({ page, inst, onClose }: { page: Page; inst: LayoutInstance; onClose: () => void }) {
  const assetsAll = useDoc((s) => s.doc.assets);
  const sets = useDoc((s) => s.doc.assetSets) ?? [];
  const all = useMemo(() => selectableAssets({ assets: assetsAll }), [assetsAll]);
  const start = useMemo(() => layoutSelection(page, inst), [page, inst]);
  const [mode, setMode] = useState<Mode>(start.mode);
  const [cats, setCats] = useState<string[]>(start.categories ?? []);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(start.mode === 'manual' ? start.ids ?? [] : resolveSelection(start, all).assets.map((a) => a.id)));
  const [count, setCount] = useState(start.count ?? Math.min(24, all.length));
  const [seed, setSeed] = useState(start.seed ?? newSeed());
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const categories = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of all) m.set(a.category, (m.get(a.category) ?? 0) + 1);
    return [...m].sort((a, b) => a[0].localeCompare(b[0]));
  }, [all]);

  const sel: AssetSelection | null =
    mode === 'all' ? { mode: 'all' } : mode === 'categories' ? { mode: 'categories', categories: cats } : mode === 'random' ? { mode: 'random', count, seed, categories: cats.length ? cats : undefined } : mode === 'manual' ? { mode: 'manual', ids: all.filter((a) => picked.has(a.id)).map((a) => a.id) } : null;
  const resolved = useMemo(() => (sel ? resolveSelection(sel, all).assets : []), [JSON.stringify(sel), all]); // eslint-disable-line react-hooks/exhaustive-deps
  const unavailable = start.mode === 'manual' ? resolveSelection(start, all).unavailable.length : 0;

  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => all.filter((a) => (!cat || a.category === cat) && (!needle || a.name.toLowerCase().includes(needle) || a.category.toLowerCase().includes(needle))), [all, cat, needle]);
  const togglePick = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const pickAll = () => setPicked((p) => new Set([...p, ...shown.map((a) => a.id)]));
  const pickNone = () => {
    const drop = new Set(shown.map((a) => a.id));
    setPicked((p) => new Set([...p].filter((id) => !drop.has(id))));
  };
  const pickInvert = () =>
    setPicked((p) => {
      const n = new Set(p);
      for (const a of shown) if (n.has(a.id)) n.delete(a.id);
      else n.add(a.id);
      return n;
    });
  const toggleCat = (c: string) => setCats((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]));
  const pool = cats.length ? all.filter((a) => cats.includes(a.category)) : all;

  const apply = () => {
    if (!sel || !resolved.length) return;
    const n = setLayoutAssets(page.id, inst.id, sel);
    if (n) toast(`The layout now uses ${fmt(n)} icon${n === 1 ? '' : 's'}. The rest of the project is unchanged.`, 'success');
    onClose();
  };
  const saveSet = () =>
    void askText({ title: 'Save this choice of icons', message: 'Saved choices can be used for any layout in this project.', value: mode === 'categories' && cats.length ? cats.join(', ') : `${resolved.length} icons`, okLabel: 'Save' }).then((name) => {
      if (!name) return;
      saveAssetSet(name, resolved.map((a) => a.id));
      toast(`Saved “${name}”`, 'success');
    });

  const catChips = (onlyFilter: boolean) => (
    <div className="chips">
      {onlyFilter && (
        <button className={`chip ${!cat ? 'on' : ''}`} onClick={() => setCat(null)}>
          All <small>{fmt(all.length)}</small>
        </button>
      )}
      {categories.map(([c, n], i) => {
        const on = onlyFilter ? cat === c : cats.includes(c);
        return (
          <button key={c} className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => (onlyFilter ? setCat(cat === c ? null : c) : toggleCat(c))}>
            <span className="cat-dot" style={{ background: categoryColor(i) }} />
            {c || 'Uncategorized'} <small>{fmt(n)}</small>
          </button>
        );
      })}
    </div>
  );

  return (
    <Modal
      title="Icons in this layout"
      onClose={onClose}
      width={920}
      footer={
        <>
          <button className="btn ghost sm" onClick={saveSet} disabled={!resolved.length || mode === 'saved'} title="Keep this choice to reuse it for other layouts in this project">
            Save choice…
          </button>
          <span className="muted small grow las-summary">
            {mode === 'saved' ? 'Pick a saved choice' : `${fmt(resolved.length)} of ${fmt(all.length)} icons`}
            {inst.objectIds.length ? ` · now ${fmt(inst.objectIds.length)}` : ''}
          </span>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!sel || !resolved.length} onClick={apply}>
            Apply
          </button>
        </>
      }
    >
      <div className="las">
        <div className="las-modes">
          <Seg<Mode>
            value={mode}
            onChange={setMode}
            options={[
              { value: 'all', label: 'All', title: 'Every icon in the project' },
              { value: 'categories', label: 'Categories', title: 'Every icon of the categories you choose' },
              { value: 'manual', label: 'Pick', title: 'Exactly the icons you tick' },
              { value: 'random', label: 'Random', title: 'A repeatable random subset' },
              { value: 'saved', label: `Saved${sets.length ? ` (${sets.length})` : ''}`, title: 'Choices saved in this project' },
            ]}
          />
          <span className="muted small">Only this layout changes. Its theme, background and text stay as they are.</span>
        </div>

        {mode === 'all' && (
          <div className="las-note">
            <p>
              This layout uses all {fmt(all.length)} icons of the project. Icons imported later can be added from the Layout panel with <b>Update</b>.
            </p>
          </div>
        )}

        {mode === 'categories' && (
          <div className="las-body">
            <div className="pap-bar">
              {catChips(false)}
              <span className="grow" />
              <button className="btn ghost sm" onClick={() => setCats(categories.map(([c]) => c))}>
                Select all
              </button>
              <button className="btn ghost sm" onClick={() => setCats([])}>
                Select none
              </button>
            </div>
            <VirtualGrid className="pap-grid las-grid" label="Icons of the chosen categories" items={resolved} render={(a) => <Tile a={a} on readOnly />} empty={<div className="pap-empty">Choose one or more categories.</div>} />
          </div>
        )}

        {mode === 'manual' && (
          <div className="las-body">
            <div className="pap-bar">
              <div className="search">
                <Search size={13} />
                <input className="input sm" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} aria-label="Search icons" />
              </div>
              <span className="grow" />
              <button className="btn ghost sm" onClick={pickAll} disabled={!shown.length}>
                Select all
              </button>
              <button className="btn ghost sm" onClick={pickNone} disabled={!shown.length}>
                Select none
              </button>
              <button className="btn ghost sm" onClick={pickInvert} disabled={!shown.length}>
                Invert
              </button>
              <span className="muted small pap-count">{fmt(picked.size)} selected</span>
            </div>
            {categories.length > 1 && <div className="pap-bar">{catChips(true)}</div>}
            {unavailable > 0 && <div className="hint warn">{unavailable} icon{unavailable === 1 ? ' this layout used is' : 's this layout used are'} no longer in the project and will be left out.</div>}
            <VirtualGrid className="pap-grid las-grid" label="Icons to use" items={shown} render={(a) => <Tile a={a} on={picked.has(a.id)} onClick={() => togglePick(a.id)} />} empty={<div className="pap-empty">Nothing matches.</div>} />
          </div>
        )}

        {mode === 'random' && (
          <div className="las-body">
            <div className="pap-bar">
              <span className="small">How many</span>
              <NumberField value={count} min={1} max={Math.max(1, pool.length)} width={80} onChange={(v) => setCount(Math.max(1, Math.round(v)))} />
              <span className="muted small">of {fmt(pool.length)}</span>
              <button className="btn sm" onClick={() => setSeed(newSeed())} title="Another random pick of the same size">
                <Dices size={13} /> New pick
              </button>
              <span className="muted small mono" title="The same seed always gives the same pick">
                seed {seed}
              </span>
            </div>
            <div className="pap-bar">
              <span className="small muted">From</span>
              {catChips(false)}
              {cats.length > 0 && (
                <button className="btn ghost sm" onClick={() => setCats([])}>
                  Any category
                </button>
              )}
            </div>
            <VirtualGrid className="pap-grid las-grid" label="The random pick" items={resolved} render={(a) => <Tile a={a} on readOnly />} empty={<div className="pap-empty">No icons in the chosen categories.</div>} />
          </div>
        )}

        {mode === 'saved' && (
          <div className="las-body">
            {sets.length ? (
              <div className="las-sets">
                {sets.map((s) => {
                  const ok = s.ids.filter((id) => all.some((a) => a.id === id)).length;
                  return (
                    <div key={s.id} className="las-set">
                      <span className="grow ellipsis">{s.name}</span>
                      <span className="muted small">
                        {fmt(ok)} icon{ok === 1 ? '' : 's'}
                        {ok < s.ids.length ? ` · ${s.ids.length - ok} no longer in the project` : ''}
                      </span>
                      <button
                        className="btn sm"
                        disabled={!ok}
                        onClick={() => {
                          setPicked(new Set(s.ids));
                          setMode('manual');
                        }}
                      >
                        Use
                      </button>
                      <button className="icon-btn sm" aria-label={`Delete ${s.name}`} title="Delete this saved choice (layouts using these icons keep them)" onClick={() => void askConfirm({ title: `Delete “${s.name}”?`, danger: true }).then((y) => y && deleteAssetSet(s.id))}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="pap-empty">No saved choices yet. Choose icons in another tab and press Save choice…</div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
