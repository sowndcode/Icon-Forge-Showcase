// Generate Variations and Color vs Grayscale dialogs.

import { useEffect, useMemo, useState } from 'react';
import { Check as CheckIcon, Download, Plus, Shuffle } from 'lucide-react';
import type { AssetRecord, Page } from '../../core/types';
import { getAlgorithm } from '../../layout/registry';
import { getPage } from '../../state/doc';
import { buildComparePage, createComparePage, libraryAssets, workingAssets, type CompareLook } from '../../state/generators';
import { addPages } from '../../state/pages';
import { usePrefs } from '../../state/prefs';
import { toast } from '../../state/ui';
import { generateVariations, VARIATION_LAYOUTS, type VariationOptions } from '../../state/variations';
import { Modal, NumberField, PropRow, Seg, Slider, Toggle } from '../components/controls';
import { PagePreview } from '../components/PagePreview';
import { exportPages } from '../right/ExportPanel';

const newSeed = () => Math.floor(Math.random() * 1e9);

// ---------------------------------------------------------------------------
// Generate Variations
// ---------------------------------------------------------------------------

export function VariationsDialog({ onClose }: { onClose: () => void }) {
  const base = useMemo(() => getPage(), []);
  const pool = useMemo(() => workingAssets(), []);
  const onPage = base.objects.filter((o) => o.type === 'image').length;
  const total = onPage || pool.length;
  const [countMode, setCountMode] = useState<number>(10);
  const [custom, setCustom] = useState(30);
  const count = countMode > 0 ? countMode : Math.max(1, Math.min(100, custom));
  const [mix, setMix] = useState<'mix' | 'same'>('mix');
  const [layouts, setLayouts] = useState<string[]>(VARIATION_LAYOUTS.slice(0, 10));
  const [iconMode, setIconMode] = useState<'all' | 'some'>('all');
  const [iconCount, setIconCount] = useState(Math.min(24, total));
  const [randomness, setRandomness] = useState(0.35);
  const [look, setLook] = useState<VariationOptions['look']>('keep');
  const [protectText, setProtectText] = useState(true);
  const [seed, setSeed] = useState(newSeed);
  const [pages, setPages] = useState<Page[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  const opts: VariationOptions = { count, layouts: mix === 'same' ? [] : layouts, iconCount: iconMode === 'all' ? 0 : iconCount, randomness, look, protectText, seed };
  const key = JSON.stringify(opts);
  useEffect(() => {
    if (!total) return;
    setBusy(true);
    // let the dialog paint before the (synchronous) layout work
    const t = setTimeout(() => {
      try {
        setPages(generateVariations(opts, pool, base));
        setPicked(new Set());
      } finally {
        setBusy(false);
      }
    }, 30);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const chosen = pages.filter((_, i) => picked.has(i));
  const toggle = (i: number) => setPicked((s) => {
    const n = new Set(s);
    if (n.has(i)) n.delete(i);
    else n.add(i);
    return n;
  });
  const addChosen = (list: Page[]) => {
    if (!list.length) return;
    addPages(list.map((p) => ({ ...p, name: `${base.name} · ${p.name}` })), list.length > 1 ? `Add ${list.length} variations` : 'Add variation');
    toast(`Added ${list.length} page${list.length > 1 ? 's' : ''}`, 'success');
    onClose();
  };
  const exportChosen = async () => {
    const s = usePrefs.getState().exportSettings;
    await exportPages(
      chosen.map((p) => ({ ...p, name: `${base.exportName || base.name}_${p.name.replace(/\s+/g, '_')}` })),
      { ...s, saveAs: chosen.length > 1 ? s.saveAs ?? 'zip' : s.saveAs },
    );
  };

  if (!total)
    return (
      <Modal title="Generate Variations" onClose={onClose} width={440}>
        <div className="muted">Import some icons first — variations rearrange the icons of this page (or your library).</div>
      </Modal>
    );

  return (
    <Modal
      title="Generate Variations"
      onClose={onClose}
      width={1100}
      footer={
        <>
          <button className="btn" onClick={() => setPicked(picked.size === pages.length ? new Set() : new Set(pages.map((_, i) => i)))}>
            {picked.size === pages.length && pages.length ? 'Select none' : 'Select all'}
          </button>
          <span className="muted small">{picked.size ? `${picked.size} selected` : 'Click previews to select them'}</span>
          <span className="grow" />
          <button className="btn" disabled={!chosen.length} onClick={() => void exportChosen()} title="Export the selected variations with your export settings (a ZIP for several)">
            <Download size={14} /> Export {chosen.length || ''}
          </button>
          <button className="btn primary" disabled={!chosen.length} onClick={() => addChosen(chosen)}>
            <Plus size={14} /> Add {chosen.length || ''} as pages
          </button>
        </>
      }
    >
      <div className="var-dialog">
        <div className="var-side">
          <div className="var-help">Makes different compositions from {onPage ? `the ${onPage} icons on “${base.name}”` : `${pool.length} library icons`}, keeping its size, text and background.</div>
          <PropRow label="Variations">
            <Seg small value={countMode} onChange={setCountMode} options={[{ value: 5, label: '5' }, { value: 10, label: '10' }, { value: 20, label: '20' }, { value: 0, label: 'Custom' }]} />
          </PropRow>
          {countMode === 0 && (
            <PropRow label="How many">
              <NumberField value={custom} min={1} max={100} onChange={setCustom} />
            </PropRow>
          )}
          <PropRow label="Layouts">
            <Seg small value={mix} onChange={setMix} options={[{ value: 'mix', label: 'Mix types' }, { value: 'same', label: base.layouts[0] ? `Keep ${getAlgorithm(base.layouts[0].algorithm).label}` : 'Keep current' }]} />
          </PropRow>
          {mix === 'mix' && (
            <div className="chip-wrap">
              {VARIATION_LAYOUTS.map((id) => (
                <button key={id} className={`chip ${layouts.includes(id) ? 'on' : ''}`} onClick={() => setLayouts((l) => (l.includes(id) ? (l.length > 1 ? l.filter((x) => x !== id) : l) : [...l, id]))}>
                  {getAlgorithm(id).label}
                </button>
              ))}
            </div>
          )}
          <PropRow label="Icons each">
            <Seg small value={iconMode} onChange={setIconMode} options={[{ value: 'all', label: `All ${total}` }, { value: 'some', label: 'Random pick' }]} />
          </PropRow>
          {iconMode === 'some' && (
            <PropRow label="Count">
              <Slider value={iconCount} min={1} max={Math.max(1, total)} onChange={setIconCount} />
            </PropRow>
          )}
          <PropRow label="Randomness" title="Extra scale, rotation and position variation">
            <Slider value={randomness} min={0} max={1} step={0.01} scale={100} unit="%" onChange={setRandomness} />
          </PropRow>
          <PropRow label="Look">
            <Seg small value={look} onChange={setLook} options={[{ value: 'keep', label: 'Keep my theme' }, { value: 'themes', label: 'Try game themes' }]} />
          </PropRow>
          <PropRow label="Keep text clear" title="Icons stay out of the area of your title and labels">
            <Toggle checked={protectText} onChange={setProtectText} />
          </PropRow>
          <button className="btn block" onClick={() => setSeed(newSeed())} disabled={busy}>
            <Shuffle size={14} /> Shuffle again
          </button>
        </div>
        <div className={`var-gallery ${busy ? 'busy' : ''}`}>
          {pages.map((p, i) => (
            <button key={`${seed}-${i}`} className={`var-card ${picked.has(i) ? 'on' : ''}`} onClick={() => toggle(i)} onDoubleClick={() => addChosen([p])} title="Click to select · double-click to add just this one">
              <PagePreview cacheKey={`var|${key}|${i}`} width={330} delay={20 * i} build={() => p} className="fill" />
              <span className="var-meta">
                <span className="var-check">{picked.has(i) && <CheckIcon size={12} />}</span>
                {p.name} · {getAlgorithm(p.layouts[0]?.algorithm ?? '').label}
              </span>
            </button>
          ))}
          {busy && !pages.length && <div className="muted">Composing…</div>}
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Color vs Grayscale
// ---------------------------------------------------------------------------

export function CompareDialog({ onClose }: { onClose: () => void }) {
  const all = useMemo(() => workingAssets(), []);
  const lib = libraryAssets().length;
  const page = getPage();
  const [look, setLook] = useState<CompareLook>('gray');
  const [axis, setAxis] = useState<'side' | 'stack'>(page.width >= page.height ? 'side' : 'stack');
  const [count, setCount] = useState(Math.min(24, all.length));
  const [strength, setStrength] = useState(1);
  const [labels, setLabels] = useState(true);
  const [size, setSize] = useState<'page' | 'hd' | 'square'>('page');
  const dims = size === 'hd' ? { w: 1920, h: 1080 } : size === 'square' ? { w: 1080, h: 1080 } : { w: page.width, h: page.height };
  const names: Record<CompareLook, [string, string]> = { gray: ['COLOR', 'GRAYSCALE'], locked: ['UNLOCKED', 'LOCKED'], silhouette: ['ITEMS', 'UNDISCOVERED'] };
  const pick: AssetRecord[] = all.slice(0, count);
  const opts = { ...dims, axis, look, labels: labels ? names[look] : (['', ''] as [string, string]), strength };
  const pkey = JSON.stringify({ opts, ids: pick.map((a) => a.id).join(',').length, n: pick.length });
  return (
    <Modal
      title="Color vs Grayscale"
      onClose={onClose}
      width={760}
      footer={
        <>
          <span className="muted small">{all.length < lib ? `Uses the ${all.length} selected assets.` : `Uses the first ${count} of ${all.length} assets.`}</span>
          <span className="grow" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={!pick.length}
            onClick={() => {
              createComparePage(pick, opts);
              onClose();
            }}
          >
            <Plus size={14} /> Add page
          </button>
        </>
      }
    >
      <div className="cmp-dialog">
        <div className="var-side">
          <PropRow label="Second half">
            <Seg small value={look} onChange={setLook} options={[{ value: 'gray', label: 'Grayscale' }, { value: 'locked', label: 'Locked' }, { value: 'silhouette', label: 'Silhouette' }]} />
          </PropRow>
          {look !== 'silhouette' && (
            <PropRow label="Gray amount">
              <Slider value={strength} min={0.2} max={1} step={0.01} scale={100} unit="%" onChange={setStrength} />
            </PropRow>
          )}
          <PropRow label="Arrange">
            <Seg small value={axis} onChange={setAxis} options={[{ value: 'side', label: 'Side by side' }, { value: 'stack', label: 'Stacked' }]} />
          </PropRow>
          <PropRow label="Icons">
            <Slider value={count} min={1} max={Math.max(1, all.length)} onChange={setCount} />
          </PropRow>
          <PropRow label="Size">
            <Seg small value={size} onChange={setSize} options={[{ value: 'page', label: `${page.width}×${page.height}` }, { value: 'hd', label: '1920×1080' }, { value: 'square', label: '1080²' }]} />
          </PropRow>
          <PropRow label="Headings">
            <Toggle checked={labels} onChange={setLabels} />
          </PropRow>
          <div className="var-help">PNG transparency is kept. Every effect stays editable afterwards in Design ▸ Colour.</div>
        </div>
        <div className="cmp-preview">{pick.length ? <PagePreview cacheKey={`cmp|${pkey}`} width={460} build={() => buildComparePage(pick, opts, structuredClone(page.background))} className="fill" /> : <div className="muted">Import icons first.</div>}</div>
      </div>
    </Modal>
  );
}

