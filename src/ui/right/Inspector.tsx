// Contextual inspector (Design tab): page settings with no selection, transform + type-specific
// properties for one object, group transform / align / distribute / normalise for many.

import { useState } from 'react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  Copy,
  FlipHorizontal2,
  FlipVertical2,
  Pin,
  PinOff,
  RotateCcw,
  Trash2,
  Unlink,
  Wand2,
  Save,
  Target,
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ArrowDown,
  ArrowUp,
  BringToFront,
  Eye,
  EyeOff,
  Lock,
  SendToBack,
  Unlock,
} from 'lucide-react';
import { applyTextLook, CANVAS_PRESETS, FONT_FAMILIES, type SavedElement } from '../../core/defaults';
import { round } from '../../core/geometry';
import { selectionAABB, scaleAbout } from '../../core/transform';
import type { ImageObject, SceneObject, ShapeEffect, ShapeObject, TextBadge, TextObject, TextStyle } from '../../core/types';
import { getAlgorithm } from '../../layout/registry';
import { images } from '../../render/images';
import { TEXT_TOKENS, withTextDefaults } from '../../render/text';
import { getAsset, useDoc, usePage } from '../../state/doc';
import { detachObjects, rerunFocalLayouts, setDepthOverride, updateLayout } from '../../state/layoutActions';
import {
  alignSelection,
  centerSelection,
  deleteSelection,
  distributeSelection,
  duplicateSelection,
  flipSelection,
  normalizeSelection,
  patchObjects,
  reorderSelection,
  replaceImageAsset,
  resetTransform,
  setObjectsFlag,
  setPinned,
  updateText,
  updateTextStyle,
} from '../../state/objects';
import { clearGuides, removeFocal, setFocal, setPageProp, setPageSize, setSafeZone } from '../../state/pages';
import { usePrefs } from '../../state/prefs';
import { savePreset, usePresets } from '../../state/presets';
import { SmartText } from './SmartText';
import { TextStylePicker } from './TextStylePicker';
import { setStage, toast, useUI } from '../../state/ui';
import { humanBytes } from '../../services/formats';
import { Check, ColorField, Labeled, NumberField, PropRow, Section, Seg, Select, Slider, Toggle } from '../components/controls';
import { BackgroundEditor } from './BackgroundEditor';
import { ImageEffects } from './ImageEffects';
import { askText } from '../components/ask';

export function DesignInspector() {
  const page = usePage();
  const selIds = useUI((s) => s.selection);
  const sel = page.objects.filter((o) => selIds.includes(o.id));
  if (!sel.length) return <PageInspector />;
  if (sel.length === 1) return <SingleInspector o={sel[0]} />;
  return <MultiInspector objs={sel} />;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function PageInspector() {
  const page = usePage();
  const [w, setW] = useState(page.width);
  const [h, setH] = useState(page.height);
  const [mode, setMode] = useState<'scale' | 'center'>('scale');
  const preset = CANVAS_PRESETS.find((p) => p.w === page.width && p.h === page.height);
  return (
    <>
      <Section title="Canvas" id="page-canvas">
        <PropRow label="Page name">
          <input className="input sm" value={page.name} onChange={(e) => setPageProp({ name: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
        </PropRow>
        <PropRow label="Preset">
          <Select
            value={preset ? preset.label : 'custom'}
            onChange={(v) => {
              const pr = CANVAS_PRESETS.find((p) => p.label === v);
              if (!pr) return;
              const [pw, ph] = [pr.w, pr.h];
              setW(pw);
              setH(ph);
              setPageSize(pw, ph, mode);
            }}
            options={[{ value: 'custom', label: `Custom (${page.width}×${page.height})` }, ...CANVAS_PRESETS.map((p) => ({ value: p.label, label: p.label, group: p.group }))]}
          />
        </PropRow>
        <div className="grid2">
          <Labeled label="W">
            <NumberField value={page.width} min={16} max={16384} onChange={(v) => { setW(v); setPageSize(v, h, mode); }} unit="px" />
          </Labeled>
          <Labeled label="H">
            <NumberField value={page.height} min={16} max={16384} onChange={(v) => { setH(v); setPageSize(w, v, mode); }} unit="px" />
          </Labeled>
        </div>
        <PropRow label="On resize" title="What happens to the content when the canvas size changes">
          <Seg small value={mode} onChange={setMode} options={[{ value: 'scale', label: 'Scale content' }, { value: 'center', label: 'Keep size' }]} />
        </PropRow>
      </Section>
      <Section title="Background" id="page-bg">
        <BackgroundEditor />
      </Section>
      <Section title="Safe zone" id="page-safe" right={<Toggle checked={page.safeZone.enabled} onChange={(enabled) => setSafeZone({ enabled })} />}>
        <div className="row wrap">
          {[5, 10, 15].map((v) => (
            <button key={v} className="chip" onClick={() => setSafeZone({ enabled: true, top: v, right: v, bottom: v, left: v })}>
              {v}%
            </button>
          ))}
        </div>
        <div className="grid2">
          {(['top', 'right', 'bottom', 'left'] as const).map((k) => (
            <Labeled key={k} label={k[0].toUpperCase()} title={k}>
              <NumberField value={page.safeZone[k]} min={0} max={45} step={0.5} decimals={1} unit="%" onChange={(v) => setSafeZone({ [k]: v, enabled: true }, k)} />
            </Labeled>
          ))}
        </div>
        <div className="hint">Editor guide only — never exported. Layouts can respect it.</div>
      </Section>
      <FocalSection />
      <Section title="Guides & export name" id="page-guides" defaultOpen={false}>
        <PropRow label="Guides">
          <span className="muted small grow">{page.guides.length} guide{page.guides.length === 1 ? '' : 's'} — drag from the rulers</span>
          <button className="btn sm" disabled={!page.guides.length} onClick={clearGuides}>
            Clear
          </button>
        </PropRow>
        <PropRow label="File name" title="Used by batch export as {page}">
          <input className="input sm" placeholder={page.name} value={page.exportName ?? ''} onChange={(e) => setPageProp({ exportName: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
        </PropRow>
      </Section>
    </>
  );
}

export function FocalSection() {
  const page = usePage();
  const f = page.focal;
  const W = page.width,
    H = page.height;
  const upd = (p: Partial<typeof f>, key?: string) => {
    setFocal(p, { key });
    rerunFocalLayouts(true);
  };
  const avoiding = page.layouts.length > 0 && page.layouts.every((l) => l.avoidFocal);
  const presets: { label: string; title: string; region: () => Partial<typeof f> | null }[] = [
    { label: 'Center', title: 'Oval in the middle, for a centered title', region: () => ({ shape: 'ellipse', x: W / 2, y: H / 2, w: W * 0.46, h: H * 0.32 }) },
    { label: 'Top band', title: 'Strip across the top', region: () => ({ shape: 'rect', x: W / 2, y: H * 0.13, w: W * 0.9, h: H * 0.22 }) },
    { label: 'Bottom band', title: 'Strip across the bottom', region: () => ({ shape: 'rect', x: W / 2, y: H * 0.87, w: W * 0.9, h: H * 0.22 }) },
    { label: 'Left', title: 'Left half', region: () => ({ shape: 'rect', x: W * 0.27, y: H / 2, w: W * 0.44, h: H * 0.8 }) },
    { label: 'Right', title: 'Right half', region: () => ({ shape: 'rect', x: W * 0.73, y: H / 2, w: W * 0.44, h: H * 0.8 }) },
    {
      label: 'Around text',
      title: 'Fit around the selected text (or all text on the page), with a little room',
      region: () => {
        const sel = useUI.getState().selection;
        const texts = page.objects.filter((o) => o.type === 'text' && !o.hidden);
        const pick = texts.filter((o) => sel.includes(o.id));
        const box = selectionAABB(pick.length ? pick : texts, getAsset, false);
        if (!box) return null;
        const pad = Math.min(W, H) * 0.035;
        return { shape: 'rect', x: box.x + box.w / 2, y: box.y + box.h / 2, w: box.w + pad * 2, h: box.h + pad * 2 };
      },
    },
  ];
  const pct = (v: number, of: number) => v / of;
  return (
    <Section title="Focal safe region" id="page-focal" right={<Toggle checked={f.enabled} onChange={(enabled) => upd({ enabled })} title="An area layouts keep free — usually for your title" />}>
      <div className="hint">An area your layouts keep clear, so the title stays readable. Guide only — never exported.</div>
      <div className="chips">
        {presets.map((p) => (
          <button
            key={p.label}
            className="chip"
            title={p.title}
            onClick={() => {
              const r = p.region();
              if (!r) return toast('Add a text object first', 'info');
              upd({ ...r, enabled: true });
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      {f.enabled && (
        <>
          <PropRow label="Shape">
            <Seg small value={f.shape} onChange={(shape) => upd({ shape })} options={[{ value: 'ellipse', label: 'Oval' }, { value: 'rect', label: 'Rectangle' }]} />
          </PropRow>
          <PropRow label="Width">
            <Slider value={pct(f.w, W)} min={0.05} max={1} step={0.005} scale={100} unit="%" onChange={(v) => upd({ w: v * W }, 'w')} />
          </PropRow>
          <PropRow label="Height">
            <Slider value={pct(f.h, H)} min={0.05} max={1} step={0.005} scale={100} unit="%" onChange={(v) => upd({ h: v * H }, 'h')} />
          </PropRow>
          <PropRow label="Horizontal">
            <Slider value={pct(f.x, W)} min={0} max={1} step={0.005} scale={100} unit="%" onChange={(v) => upd({ x: v * W }, 'x')} />
          </PropRow>
          <PropRow label="Vertical">
            <Slider value={pct(f.y, H)} min={0} max={1} step={0.005} scale={100} unit="%" onChange={(v) => upd({ y: v * H }, 'y')} />
          </PropRow>
          <PropRow label="Layouts avoid it" title="Turn “Avoid focal region” on for every layout on this page">
            <Toggle
              checked={avoiding}
              disabled={!page.layouts.length}
              onChange={(on) => {
                for (const l of page.layouts) updateLayout(l.id, { avoidFocal: on }, { label: on ? 'Avoid focal region' : 'Ignore focal region' });
              }}
            />
            {!page.layouts.length && <span className="muted small">(no layouts yet)</span>}
          </PropRow>
        </>
      )}
      <div className="row">
        <button className="btn sm" onClick={() => useUI.setState({ tool: 'focal' })} title="Drag a region on the canvas (F)">
          <Target size={12} /> Draw on canvas
        </button>
        {f.enabled && (
          <button className="btn sm" onClick={() => upd({ x: W / 2, y: H / 2 })}>
            Center it
          </button>
        )}
        {f.enabled && (
          <button className="btn sm danger" onClick={removeFocal} title="Remove the focal region (Delete while the focal tool is active)">
            <Trash2 size={12} /> Remove
          </button>
        )}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Shared: status, transform
// ---------------------------------------------------------------------------

export function LayoutStatus({ objs }: { objs: SceneObject[] }) {
  const page = usePage();
  const inLayout = objs.filter((o) => o.layoutId);
  const pinned = inLayout.filter((o) => o.pinned);
  let pill: React.ReactNode;
  if (!inLayout.length) pill = <span className="status-pill manual">Manual</span>;
  else if (inLayout.length !== objs.length) pill = <span className="status-pill mixed">Mixed</span>;
  else if (pinned.length === inLayout.length) pill = <span className="status-pill pinned"><Pin size={11} /> Pinned</span>;
  else pill = <span className="status-pill layout">Layout controlled{pinned.length ? ` · ${pinned.length} pinned` : ''}</span>;
  const inst = inLayout[0] ? page.layouts.find((l) => l.id === inLayout[0].layoutId) : undefined;
  return (
    <div className="row wrap" style={{ padding: '10px 12px 0' }}>
      {pill}
      {inst && <span className="muted small">{getAlgorithm(inst.algorithm).label}</span>}
      <span className="grow" />
      {inLayout.length > 0 && (
        <>
          <button className="btn ghost icon sm" title={pinned.length === inLayout.length ? 'Unpin (P)' : 'Pin — keep position when the layout re-runs (P)'} onClick={() => setPinned(inLayout.map((o) => o.id), pinned.length !== inLayout.length)}>
            {pinned.length === inLayout.length ? <PinOff size={13} /> : <Pin size={13} />}
          </button>
          <button className="btn ghost icon sm" title="Detach from layout (fully manual)" onClick={() => detachObjects(inLayout.map((o) => o.id))}>
            <Unlink size={13} />
          </button>
          <button className="btn ghost sm" title="Open layout settings" onClick={() => { useUI.setState({ activeLayoutId: inst?.id ?? null }); setStage('arrange'); }}>
            Layout…
          </button>
        </>
      )}
    </div>
  );
}

function ActionsRow() {
  return (
    <div className="iconbar" style={{ padding: '6px 10px 0' }}>
      <button className="btn ghost icon" title="Flip horizontal (Shift+H)" onClick={() => flipSelection('x')}>
        <FlipHorizontal2 size={15} />
      </button>
      <button className="btn ghost icon" title="Flip vertical (Shift+V)" onClick={() => flipSelection('y')}>
        <FlipVertical2 size={15} />
      </button>
      <button className="btn ghost icon" title="Reset transform (rotation, flips, aspect)" onClick={resetTransform}>
        <RotateCcw size={15} />
      </button>
      <button className="btn ghost icon" title="Duplicate (Ctrl+D)" onClick={() => duplicateSelection()}>
        <Copy size={15} />
      </button>
      <span className="grow" />
      <button className="btn ghost icon danger" title="Delete (Del)" onClick={deleteSelection}>
        <Trash2 size={15} />
      </button>
    </div>
  );
}

function SingleTransform({ o }: { o: SceneObject }) {
  const [lock, setLock] = useState(true);
  const asset = o.type === 'image' ? getAsset(o.assetId) : undefined;
  const p = (patch: Partial<SceneObject>, key: string) => patchObjects({ [o.id]: maybePin(o, patch) }, 'Transform', { key: `tf:${o.id}:${key}` });
  const setW = (w: number) => {
    if (o.type === 'text') return p({ w }, 'w');
    const h = lock && o.w ? (o.h * w) / o.w : o.h;
    p({ w, h }, 'w');
  };
  const setH = (h: number) => {
    const w = lock && o.h ? (o.w * h) / o.h : o.w;
    p({ w, h }, 'h');
  };
  return (
    <Section title="Transform" id="tf">
      <div className="grid2">
        <Labeled label="X" title="Center X">
          <NumberField value={round(o.x, 1)} decimals={1} onChange={(x) => p({ x }, 'x')} />
        </Labeled>
        <Labeled label="Y" title="Center Y">
          <NumberField value={round(o.y, 1)} decimals={1} onChange={(y) => p({ y }, 'y')} />
        </Labeled>
        <Labeled label="W">
          <NumberField value={round(o.w, 1)} decimals={1} min={0.5} onChange={setW} />
        </Labeled>
        <Labeled label="H">
          <NumberField value={round(o.h, 1)} decimals={1} min={0.5} disabled={o.type === 'text'} onChange={setH} />
        </Labeled>
        {asset && (
          <>
            <Labeled label="SX" title="Scale X (% of source pixels)">
              <NumberField value={round((o.w / (asset.width || 1)) * 100, 1)} decimals={1} unit="%" onChange={(v) => p({ w: (asset.width * v) / 100, ...(lock ? { h: (asset.height * v) / 100 } : {}) }, 'sx')} />
            </Labeled>
            <Labeled label="SY" title="Scale Y (% of source pixels)">
              <NumberField value={round((o.h / (asset.height || 1)) * 100, 1)} decimals={1} unit="%" onChange={(v) => p({ h: (asset.height * v) / 100, ...(lock ? { w: (asset.width * v) / 100 } : {}) }, 'sy')} />
            </Labeled>
          </>
        )}
        <Labeled label="R" title="Rotation">
          <NumberField value={round(o.rotation, 1)} decimals={1} unit="°" onChange={(rotation) => p({ rotation }, 'r')} />
        </Labeled>
        <Labeled label="α" title="Opacity">
          <NumberField value={Math.round(o.opacity * 100)} min={0} max={100} unit="%" onChange={(v) => p({ opacity: v / 100 }, 'op')} />
        </Labeled>
      </div>
      <Check checked={lock} onChange={setLock} label={<span className="small">Lock aspect ratio</span>} />
    </Section>
  );
}

function maybePin(o: SceneObject, patch: Partial<SceneObject>): Partial<SceneObject> {
  if (o.layoutId && usePrefs.getState().autoPin && ('x' in patch || 'y' in patch || 'w' in patch || 'rotation' in patch)) return { ...patch, pinned: true };
  return patch;
}

// ---------------------------------------------------------------------------
// Single object
// ---------------------------------------------------------------------------

function SingleInspector({ o }: { o: SceneObject }) {
  return (
    <>
      <LayoutStatus objs={[o]} />
      <ActionsRow />
      <SingleTransform o={o} />
      {o.type === 'image' && <ImageProps o={o} />}
      {o.type === 'text' && <TextProps o={o} />}
      {o.type === 'shape' && <ShapeProps o={o} />}
      {o.layoutId && <DepthSection objs={[o]} />}
    </>
  );
}

function DepthSection({ objs }: { objs: SceneObject[] }) {
  const page = usePage();
  const inst = page.layouts.find((l) => l.id === objs[0].layoutId);
  if (!inst || !getAlgorithm(inst.algorithm).plane) return null;
  const manual = objs.every((o) => o.depthMode === 'manual');
  const depth = objs[0].depth ?? 0.5;
  const ids = objs.map((o) => o.id);
  return (
    <Section title="Perspective depth" id="depth">
      <Seg small value={manual ? 'manual' : 'auto'} onChange={(m) => setDepthOverride(ids, m, depth)} options={[{ value: 'auto', label: 'Auto depth' }, { value: 'manual', label: 'Manual depth' }]} />
      {manual && (
        <PropRow label="Depth" title="0 = far (back, small), 100 = near (front, large)">
          <Slider value={depth} min={0} max={1} step={0.01} scale={100} unit="%" onChange={(d) => setDepthOverride(ids, 'manual', d)} />
        </PropRow>
      )}
      <div className="hint">Auto: paint order and scale follow the position on the plane. Manual: override depth (affects scale and layer order when the layout runs).</div>
    </Section>
  );
}

function ImageProps({ o }: { o: ImageObject }) {
  const a = getAsset(o.assetId);
  const libSel = useUI((s) => s.librarySel);
  const url = images.thumbs.get(o.assetId);
  return (
    <>
      <Section title="Appearance" id="img-appear">
        <PropRow label="Opacity">
          <Slider value={o.opacity} min={0} max={1} step={0.01} scale={100} unit="%" onChange={(opacity) => patchObjects({ [o.id]: { opacity } }, 'Opacity', { key: 'op' + o.id })} />
        </PropRow>
      </Section>
      <ImageEffects objs={[o]} />
      <Section title="Image" id="img-info">
        {a ? (
          <>
            {url && a.alpha && (
              <div className="alpha-viz checker">
                <AlphaViz url={url} w={a.width} h={a.height} b={a.alpha.bounds} />
              </div>
            )}
            <div className="kv">
              <span>File</span>
              <span title={a.name} style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</span>
              <span>Source</span>
              <span>
                {a.width}×{a.height} {a.format.toUpperCase()}
              </span>
              <span>Size</span>
              <span>{humanBytes(a.bytes)}</span>
              <span>Transparency</span>
              <span>{a.alpha?.hasAlpha ? 'Yes (alpha)' : 'Opaque'}</span>
              {a.alpha && !a.alpha.empty && (
                <>
                  <span>Visible bounds</span>
                  <span>
                    {a.alpha.bounds.w}×{a.alpha.bounds.h} @ {a.alpha.bounds.x},{a.alpha.bounds.y}
                  </span>
                  <span>Occupancy</span>
                  <span>{Math.round(a.alpha.occupancy * 100)}%</span>
                </>
              )}
              <span>On canvas</span>
              <span>{Math.round((o.w / (a.width || 1)) * 100)}% of source</span>
              <span>Category</span>
              <span>{a.category || '—'}</span>
            </div>
            {a.error && <div className="hint warn">{a.error}</div>}
          </>
        ) : (
          <div className="hint warn">Source asset missing.</div>
        )}
        <button
          className="btn sm"
          disabled={libSel.length !== 1}
          title="Swap this image for the asset selected in the library (keeps position and visual size)"
          onClick={() => replaceImageAsset(o.id, libSel[0])}
        >
          Replace with library selection
        </button>
      </Section>
    </>
  );
}

function AlphaViz({ url, w, h, b }: { url: string; w: number; h: number; b: { x: number; y: number; w: number; h: number } }) {
  const k = Math.min(260 / w, 132 / h);
  return (
    <div style={{ position: 'relative', width: w * k, height: h * k }}>
      <img src={url} alt="" style={{ width: '100%', height: '100%' }} />
      <div className="bb" style={{ left: b.x * k, top: b.y * k, width: b.w * k, height: b.h * k }} title="Visible (alpha) bounds" />
    </div>
  );
}

function TextProps({ o }: { o: TextObject }) {
  const s = withTextDefaults(o.style);
  const set = (p: Partial<TextStyle>, key?: string) => updateTextStyle(o.id, p, key ? `ts:${o.id}:${key}` : undefined);
  const setBadge = (p: Partial<TextBadge>, key?: string) => updateTextStyle(o.id, (cur) => ({ badge: { ...withTextDefaults(cur).badge, ...p } }), key ? `ts:${o.id}:b${key}` : undefined);
  const setLook = (look: Partial<TextStyle>, name: string) => updateTextStyle(o.id, (cur) => applyTextLook(withTextDefaults(cur), look), undefined, `Text look: ${name}`);
  const saved = usePresets<SavedElement>('text');
  const fonts = useDoc((d) => d.doc.fonts);
  const families = [...fonts.map((f) => f.family), ...FONT_FAMILIES];
  const textMode = usePrefs((p) => p.textMode);
  const insertToken = (t: string) => updateText(o.id, { text: o.text + (o.text && !o.text.endsWith(' ') ? ' ' : '') + t });
  return (
    <>
      <Section title="Text" id="txt-content">
        <textarea className="input" rows={3} value={o.text} onChange={(e) => updateText(o.id, { text: e.target.value, name: e.target.value.split('\n')[0].slice(0, 32) || 'Text' }, 'txt' + o.id)} onKeyDown={(e) => e.stopPropagation()} />
        <div className="chips">
          {TEXT_TOKENS.map((t) => (
            <button key={t.token} className="chip mono" title={`Insert ${t.label}`} onClick={() => insertToken(t.token)}>
              {t.token}
            </button>
          ))}
        </div>
        <div className="hint">Double-click the text on the canvas to edit it in place. {'{count}'} always shows your current number of assets.</div>
      </Section>
      <SmartText o={o} />
      {textMode === 'advanced' && (
        <>
      <Section title="Typography" id="txt-type">
        <PropRow label="Font">
          <Select value={s.fontFamily} onChange={(fontFamily) => set({ fontFamily })} options={[...new Set(families)].map((f) => ({ value: f, label: f, group: fonts.some((x) => x.family === f) ? 'Imported' : 'System' }))} />
        </PropRow>
        <div className="grid2">
          <Labeled label="Size" wide>
            <NumberField value={round(s.fontSize, 1)} min={1} max={2000} decimals={1} onChange={(fontSize) => set({ fontSize }, 'size')} unit="px" />
          </Labeled>
          <Labeled label="Weight" wide>
            <NumberField value={s.fontWeight} min={100} max={1000} step={100} onChange={(fontWeight) => set({ fontWeight }, 'weight')} />
          </Labeled>
          <Labeled label="Spacing" wide>
            <NumberField value={round(s.letterSpacing, 1)} decimals={1} onChange={(letterSpacing) => set({ letterSpacing }, 'ls')} unit="px" />
          </Labeled>
          <Labeled label="Line" wide>
            <NumberField value={s.lineHeight} min={0.5} max={3} step={0.05} decimals={2} onChange={(lineHeight) => set({ lineHeight }, 'lh')} />
          </Labeled>
        </div>
        <div className="row">
          <button className={`btn icon sm ${s.fontWeight >= 700 ? 'active' : ''}`} title="Bold" onClick={() => set({ fontWeight: s.fontWeight >= 700 ? 400 : 800 })}>
            <Bold size={13} />
          </button>
          <button className={`btn icon sm ${s.italic ? 'active' : ''}`} title="Italic" onClick={() => set({ italic: !s.italic })}>
            <Italic size={13} />
          </button>
          <span className="sep" />
          {(['left', 'center', 'right'] as const).map((al) => (
            <button key={al} className={`btn icon sm ${s.align === al ? 'active' : ''}`} title={`Align ${al}`} onClick={() => set({ align: al })}>
              {al === 'left' ? <AlignLeft size={13} /> : al === 'center' ? <AlignCenter size={13} /> : <AlignRight size={13} />}
            </button>
          ))}
          <span className="sep" />
          <button className={`btn sm ${s.uppercase ? 'active' : ''}`} title="All caps" onClick={() => set({ uppercase: !s.uppercase })}>
            AA
          </button>
        </div>
        <PropRow label="Curve" title="Bend the text along an arc (single lines look best)">
          <Slider value={s.curve} min={-1} max={1} step={0.01} scale={100} unit="%" onChange={(curve) => set({ curve }, 'curve')} />
        </PropRow>
        <PropRow label="Opacity">
          <Slider value={o.opacity} min={0} max={1} step={0.01} scale={100} unit="%" onChange={(opacity) => patchObjects({ [o.id]: { opacity } }, 'Opacity', { key: 'op' + o.id })} />
        </PropRow>
      </Section>
      <Section title="Fill" id="txt-fill">
        <Seg small value={s.fillMode} onChange={(fillMode) => set({ fillMode })} options={[{ value: 'solid', label: 'Solid' }, { value: 'gradient', label: 'Gradient' }]} />
        <PropRow label={s.fillMode === 'gradient' ? 'Colors' : 'Color'}>
          <ColorField value={s.fill} onChange={(fill) => set({ fill }, 'fill')} />
          {s.fillMode === 'gradient' && <ColorField value={s.fill2} onChange={(fill2) => set({ fill2 }, 'fill2')} />}
        </PropRow>
        {s.fillMode === 'gradient' && (
          <PropRow label="Direction">
            <Slider value={s.gradientAngle} min={0} max={360} unit="°" onChange={(gradientAngle) => set({ gradientAngle }, 'ga')} />
          </PropRow>
        )}
      </Section>
      <Section title="Effects" id="txt-fx">
        <FxHead label="Pixel art" on={(s.pixel ?? 0) > 0} onToggle={(on) => set({ pixel: on ? Math.max(2, Math.round(s.fontSize / 14)) : 0 })} />
        {(s.pixel ?? 0) > 0 && (
          <PropRow label="Pixel size" title="Size of one pixel block. About a fourteenth of the font size gives a classic 16-px look.">
            <Slider value={s.pixel ?? 0} min={1} max={32} step={0.5} unit="px" onChange={(pixel) => set({ pixel }, 'px')} />
          </PropRow>
        )}
        <FxHead label="Outline" on={s.stroke.enabled} onToggle={(enabled) => set({ stroke: { ...s.stroke, enabled } })} />
        {s.stroke.enabled && (
          <PropRow label="Color · width">
            <ColorField value={s.stroke.color} onChange={(color) => set({ stroke: { ...s.stroke, color } }, 'sc')} />
            <NumberField width={64} value={s.stroke.width} min={0} max={200} step={0.5} decimals={1} unit="px" onChange={(width) => set({ stroke: { ...s.stroke, width } }, 'sw')} />
          </PropRow>
        )}
        <FxHead label="Second outline" on={s.stroke2.enabled} onToggle={(enabled) => set({ stroke2: { ...s.stroke2, enabled } })} />
        {s.stroke2.enabled && (
          <PropRow label="Color · width">
            <ColorField value={s.stroke2.color} onChange={(color) => set({ stroke2: { ...s.stroke2, color } }, 's2c')} />
            <NumberField width={64} value={s.stroke2.width} min={0} max={200} step={0.5} decimals={1} unit="px" onChange={(width) => set({ stroke2: { ...s.stroke2, width } }, 's2w')} />
          </PropRow>
        )}
        <FxHead label="3D depth" on={s.extrude.enabled} onToggle={(enabled) => set({ extrude: { ...s.extrude, enabled } })} />
        {s.extrude.enabled && (
          <>
            <PropRow label="Color">
              <ColorField value={s.extrude.color} onChange={(color) => set({ extrude: { ...s.extrude, color } }, 'exc')} />
            </PropRow>
            <PropRow label="Depth">
              <Slider value={s.extrude.depth} min={1} max={Math.max(40, s.fontSize * 0.3)} unit="px" onChange={(depth) => set({ extrude: { ...s.extrude, depth } }, 'exd')} />
            </PropRow>
            <PropRow label="Direction">
              <Slider value={s.extrude.angle} min={0} max={360} unit="°" onChange={(angle) => set({ extrude: { ...s.extrude, angle } }, 'exa')} />
            </PropRow>
          </>
        )}
        <FxHead label="Glow" on={s.glow.enabled} onToggle={(enabled) => set({ glow: { ...s.glow, enabled } })} />
        {s.glow.enabled && (
          <>
            <PropRow label="Color">
              <ColorField value={s.glow.color} onChange={(color) => set({ glow: { ...s.glow, color } }, 'gc')} />
            </PropRow>
            <PropRow label="Size">
              <Slider value={s.glow.blur} min={2} max={120} unit="px" onChange={(blur) => set({ glow: { ...s.glow, blur } }, 'gb')} />
            </PropRow>
            <PropRow label="Strength">
              <Slider value={s.glow.opacity} min={0} max={1} step={0.01} scale={100} unit="%" onChange={(opacity) => set({ glow: { ...s.glow, opacity } }, 'go')} />
            </PropRow>
          </>
        )}
        <FxHead label="Drop shadow" on={s.shadow.enabled} onToggle={(enabled) => set({ shadow: { ...s.shadow, enabled } })} />
        {s.shadow.enabled && (
          <>
            <PropRow label="Color">
              <ColorField value={s.shadow.color} onChange={(color) => set({ shadow: { ...s.shadow, color } }, 'shc')} />
            </PropRow>
            <PropRow label="Blur">
              <Slider value={s.shadow.blur} min={0} max={100} unit="px" onChange={(blur) => set({ shadow: { ...s.shadow, blur } }, 'shb')} />
            </PropRow>
            <PropRow label="Distance">
              <Slider value={s.shadow.dy} min={-60} max={60} unit="px" onChange={(dy) => set({ shadow: { ...s.shadow, dy } }, 'shd')} />
            </PropRow>
            <PropRow label="Opacity">
              <Slider value={s.shadow.opacity} min={0} max={1} step={0.01} scale={100} unit="%" onChange={(opacity) => set({ shadow: { ...s.shadow, opacity } }, 'sho')} />
            </PropRow>
          </>
        )}
      </Section>
      <Section title="Badge" id="txt-badge" right={<Toggle checked={s.badge.enabled} onChange={(enabled) => setBadge({ enabled })} title="Put the text on a shape: pill, burst, ribbon…" />}>
        {!s.badge.enabled ? (
          <div className="hint">Turn on to put the text on a label shape — pill, starburst, ribbon, price tag — for “FREE DEMO!”, “NEW” or “{'{count}'} ICONS” callouts.</div>
        ) : (
          <>
            <div className="shape-picker">
              {BADGE_SHAPES.map((b) => (
                <button key={b.value} className={s.badge.shape === b.value ? 'on' : ''} title={b.label} onClick={() => setBadge({ shape: b.value })}>
                  <svg viewBox="0 0 40 24" width="34" height="20">
                    <path d={b.icon} />
                  </svg>
                </button>
              ))}
            </div>
            <PropRow label="Color">
              <ColorField value={s.badge.color} onChange={(color) => setBadge({ color }, 'c')} />
              <Check checked={s.badge.gradient} onChange={(gradient) => setBadge({ gradient })} label={<span className="small">Gradient</span>} />
            </PropRow>
            {s.badge.gradient && (
              <PropRow label="Bottom color">
                <ColorField value={s.badge.color2} onChange={(color2) => setBadge({ color2 }, 'c2')} />
              </PropRow>
            )}
            <PropRow label="Padding X">
              <Slider value={s.badge.padX} min={0} max={240} unit="px" onChange={(padX) => setBadge({ padX }, 'px')} />
            </PropRow>
            <PropRow label="Padding Y">
              <Slider value={s.badge.padY} min={0} max={240} unit="px" onChange={(padY) => setBadge({ padY }, 'py')} />
            </PropRow>
            {s.badge.shape === 'rect' && (
              <PropRow label="Corner radius">
                <Slider value={s.badge.radius} min={0} max={120} unit="px" onChange={(radius) => setBadge({ radius }, 'r')} />
              </PropRow>
            )}
            {s.badge.shape === 'burst' && (
              <PropRow label="Spikes">
                <Slider value={s.badge.points} min={5} max={32} onChange={(points) => setBadge({ points }, 'pt')} />
              </PropRow>
            )}
            <PropRow label="Border">
              <Toggle checked={s.badge.stroke.enabled} onChange={(enabled) => setBadge({ stroke: { ...s.badge.stroke, enabled } })} />
              {s.badge.stroke.enabled && (
                <>
                  <ColorField value={s.badge.stroke.color} onChange={(color) => setBadge({ stroke: { ...s.badge.stroke, color } }, 'sc')} />
                  <NumberField width={58} value={s.badge.stroke.width} min={0} max={60} unit="px" onChange={(width) => setBadge({ stroke: { ...s.badge.stroke, width } }, 'sw')} />
                </>
              )}
            </PropRow>
          </>
        )}
      </Section>
      <Section title="Text styles" id="txt-styles" defaultOpen={false}>
        <TextStylePicker saved={saved} onApply={setLook} />
        <button
          className="btn sm"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => {
            void askText({ title: 'Save as element', message: 'Its words and look appear under “My elements” in the Elements tab, in every project.', value: o.text.split('\n')[0].slice(0, 32) || 'My element', okLabel: 'Save' }).then((name) => {
            if (name) void savePreset('text', name, { ...o.style, sampleText: o.text });
          });
          }}
        >
          <Save size={12} /> Save as element
        </button>
      </Section>
        </>
      )}
    </>
  );
}

const BADGE_SHAPES: { value: TextBadge['shape']; label: string; icon: string }[] = [
  { value: 'pill', label: 'Pill', icon: 'M10 4h20a8 8 0 0 1 0 16H10a8 8 0 0 1 0-16z' },
  { value: 'rect', label: 'Rectangle', icon: 'M4 4h32v16H4z' },
  { value: 'circle', label: 'Circle', icon: 'M20 2a10 10 0 1 1 0 20a10 10 0 1 1 0-20z' },
  { value: 'burst', label: 'Starburst', icon: 'M20 1l3 5 6-2-1 6 6 2-5 4 4 5-6 1 0 6-5-3-2 5-2-5-5 3 0-6-6-1 4-5-5-4 6-2-1-6 6 2z' },
  { value: 'ribbon', label: 'Ribbon', icon: 'M2 4h36l-6 8 6 8H2l6-8z' },
  { value: 'slant', label: 'Slanted', icon: 'M9 4h29l-7 16H2z' },
  { value: 'tag', label: 'Price tag', icon: 'M12 4h26v16H12L2 12z' },
];

function FxHead({ label, on, onToggle }: { label: string; on: boolean; onToggle: (v: boolean) => void }) {
  return (
    <div className="subhead">
      <span>{label}</span>
      <Toggle checked={on} onChange={onToggle} />
    </div>
  );
}

function ShapeProps({ o }: { o: ShapeObject }) {
  const set = (p: Partial<ShapeObject>, key?: string) => patchObjects({ [o.id]: p }, 'Shape', { key: key ? `shp:${o.id}:${key}` : undefined });
  return (
    <>
    <Section title="Shape" id="shape">
      {o.shape !== 'line' && (
        <PropRow label="Fill">
          <Toggle checked={o.fillEnabled} onChange={(fillEnabled) => set({ fillEnabled })} />
          {o.fillEnabled && <ColorField value={o.fill} onChange={(fill) => set({ fill }, 'fill')} />}
        </PropRow>
      )}
      {o.shape !== 'line' && o.fillEnabled && (
        <PropRow label="Gradient" title="Fade the fill into a second color, top to bottom">
          <Toggle checked={!!o.fill2} onChange={(on) => set({ fill2: on ? '#000000' : undefined })} />
          {o.fill2 && <ColorField value={o.fill2} onChange={(fill2) => set({ fill2 }, 'fill2')} />}
        </PropRow>
      )}
      <PropRow label="Soft edges" title="Blur the shape — for glows and floor shadows">
        <Slider value={o.blur ?? 0} min={0} max={Math.round(Math.max(40, Math.min(o.w, o.h || o.w) * 0.3))} unit="px" onChange={(blur) => set({ blur }, 'blur')} />
      </PropRow>
      <PropRow label="Stroke">
        <ColorField value={o.stroke} onChange={(stroke) => set({ stroke }, 'stroke')} />
      </PropRow>
      <PropRow label="Stroke width">
        <Slider value={o.strokeWidth} min={0} max={80} step={0.5} decimals={1} unit="px" onChange={(strokeWidth) => set({ strokeWidth }, 'sw')} />
      </PropRow>
      {o.shape === 'rect' && (
        <PropRow label="Corner radius">
          <Slider value={o.radius} min={0} max={Math.round(Math.min(o.w, o.h) / 2)} onChange={(radius) => set({ radius }, 'r')} unit="px" />
        </PropRow>
      )}
      <PropRow label="Opacity">
        <Slider value={o.opacity} min={0} max={1} step={0.01} scale={100} unit="%" onChange={(opacity) => set({ opacity }, 'op')} />
      </PropRow>
    </Section>
    {o.shape !== 'line' && <ShapeEffectSection o={o} />}
    </>
  );
}

const EFFECT_DEFAULT: ShapeEffect = { enabled: false, look: 'silhouette', amount: 0.75, color: '#16181d', scope: 'area', targets: 'icons' };

/** A shape can restyle the objects below it — only where it covers them, or the whole objects it touches. */
function ShapeEffectSection({ o }: { o: ShapeObject }) {
  const e = { ...EFFECT_DEFAULT, ...o.effect };
  const set = (p: Partial<ShapeEffect>, key?: string) => patchObjects({ [o.id]: { effect: { ...e, ...p } } as Partial<ShapeObject> }, 'Shape effect', { key: key ? `shfx:${o.id}:${key}` : undefined });
  const amountLabel = { silhouette: 'Silhouette opacity', fade: 'Fade', grayscale: 'Gray amount', darken: 'Darken', blur: 'Blur' }[e.look];
  return (
    <Section title="Effect on what's below" id="shape-fx" right={<Toggle checked={e.enabled} onChange={(enabled) => set({ enabled })} title="Restyle the icons under this shape" />}>
      {e.enabled ? (
        <>
          <Seg
            small
            value={e.look}
            onChange={(look) => set({ look })}
            options={[
              { value: 'silhouette', label: 'Silhouette' },
              { value: 'fade', label: 'Fade' },
              { value: 'grayscale', label: 'Gray' },
              { value: 'darken', label: 'Darken' },
              { value: 'blur', label: 'Blur' },
            ]}
          />
          <PropRow label={amountLabel}>
            <Slider value={e.amount} min={0} max={1} step={0.01} scale={100} unit="%" onChange={(amount) => set({ amount }, 'a')} />
          </PropRow>
          {e.look === 'silhouette' && (
            <PropRow label="Colour">
              <ColorField value={e.color} onChange={(color) => set({ color }, 'c')} />
            </PropRow>
          )}
          <PropRow label="Applies to" title="Only the covered part of each icon, or every icon the shape touches">
            <Seg small value={e.scope} onChange={(scope) => set({ scope })} options={[{ value: 'area', label: 'Covered part', title: 'Cut exactly at the shape edge' }, { value: 'whole', label: 'Whole icons', title: 'Every icon the shape touches changes completely' }]} />
          </PropRow>
          <PropRow label="Affects">
            <Seg small value={e.targets} onChange={(targets) => set({ targets })} options={[{ value: 'icons', label: 'Icons' }, { value: 'all', label: 'Icons, text & shapes' }]} />
          </PropRow>
          <div className="hint">Only objects below this shape in the layer list change. Turn its fill off or down to make the shape itself invisible.</div>
        </>
      ) : (
        <div className="hint">Turn icons under this shape into silhouettes, fade them, gray them out or blur them.</div>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Multiple objects
// ---------------------------------------------------------------------------

/** The shared value of `get` over objects, or null when they differ ("Mixed"). */
function shared<T>(objs: SceneObject[], get: (o: SceneObject) => T): T | null {
  const v = get(objs[0]);
  return objs.every((o) => get(o) === v) ? v : null;
}

/** Operations that apply to every selected object; differing values show as Mixed. */
function MultiShared({ objs }: { objs: SceneObject[] }) {
  const ids = objs.map((o) => o.id);
  const op = shared(objs, (o) => Math.round(o.opacity * 100) / 100);
  const rot = shared(objs, (o) => Math.round(o.rotation * 10) / 10);
  const hidden = shared(objs, (o) => !!o.hidden);
  const locked = shared(objs, (o) => !!o.locked);
  const mixed = <span className="mixed-tag" title="The selected objects have different values">Mixed</span>;
  const each = (label: string, key: string, fn: (o: SceneObject) => Partial<SceneObject> | null) =>
    patchObjects(new Map(objs.flatMap((o) => (o.locked ? [] : [[o.id, fn(o)] as const])).filter((e): e is [string, Partial<SceneObject>] => !!e[1]).map(([id, p]) => [id, maybePin(objs.find((o) => o.id === id)!, p)])), label, { key });
  const scaleEach = (k: number) =>
    each('Scale', 'multiscaleeach', (o) => scaleAbout(o, { x: o.x, y: o.y }, k) as Partial<SceneObject>);
  return (
    <Section title="Appearance" id="multi-appear">
      <PropRow label={<>Opacity {op === null && mixed}</>} title={`Opacity of all ${objs.length} selected objects`}>
        <Slider
          value={op ?? objs.reduce((m, o) => m + o.opacity, 0) / objs.length}
          min={0}
          max={1}
          step={0.01}
          scale={100}
          unit="%"
          onChange={(opacity) => patchObjects(Object.fromEntries(objs.map((o) => [o.id, { opacity }])), 'Opacity', { key: 'multiop' })}
        />
      </PropRow>
      <PropRow label={<>Rotation {rot === null && mixed}</>} title="Sets the same angle on every selected object (each turns around its own center)">
        <NumberField value={rot} placeholder="Mixed" unit="°" decimals={1} width={84} onChange={(rotation) => each('Rotate', 'multirot', () => ({ rotation }))} />
        <button className="btn ghost sm" title="Turn each object 15° left" onClick={() => each('Rotate', 'multirot', (o) => ({ rotation: o.rotation - 15 }))}>
          −15°
        </button>
        <button className="btn ghost sm" title="Turn each object 15° right" onClick={() => each('Rotate', 'multirot', (o) => ({ rotation: o.rotation + 15 }))}>
          +15°
        </button>
      </PropRow>
      <PropRow label="Scale each" title="Scales every object around its own center; the arrangement keeps its positions">
        {[0.9, 1.1].map((k) => (
          <button key={k} className="btn ghost sm" onClick={() => scaleEach(k)}>
            {k < 1 ? `−${Math.round((1 - k) * 100)}%` : `+${Math.round((k - 1) * 100)}%`}
          </button>
        ))}
      </PropRow>
      <PropRow label="Order">
        <button className="btn ghost icon sm" title="Bring to front (Ctrl+Shift+])" aria-label="Bring to front" onClick={() => reorderSelection('front')}>
          <BringToFront size={14} />
        </button>
        <button className="btn ghost icon sm" title="Bring forward (Ctrl+])" aria-label="Bring forward" onClick={() => reorderSelection('forward')}>
          <ArrowUp size={14} />
        </button>
        <button className="btn ghost icon sm" title="Send backward (Ctrl+[)" aria-label="Send backward" onClick={() => reorderSelection('backward')}>
          <ArrowDown size={14} />
        </button>
        <button className="btn ghost icon sm" title="Send to back (Ctrl+Shift+[)" aria-label="Send to back" onClick={() => reorderSelection('back')}>
          <SendToBack size={14} />
        </button>
      </PropRow>
      <PropRow label={<>Visibility {hidden === null && mixed}</>}>
        <button className="btn ghost sm" onClick={() => setObjectsFlag(ids, { hidden: !(hidden ?? false) }, hidden ? 'Show' : 'Hide')}>
          {hidden ? <Eye size={13} /> : <EyeOff size={13} />} {hidden ? 'Show all' : 'Hide all'}
        </button>
        <button className="btn ghost sm" onClick={() => setObjectsFlag(ids, { locked: !(locked ?? false) }, locked ? 'Unlock' : 'Lock')}>
          {locked ? <Unlock size={13} /> : <Lock size={13} />} {locked ? 'Unlock all' : 'Lock all'}
        </button>
      </PropRow>
    </Section>
  );
}

function MultiInspector({ objs }: { objs: SceneObject[] }) {
  const box = selectionAABB(objs, getAsset)!;
  const visible = usePrefs((s) => s.alignVisible);
  const setPrefs = usePrefs((s) => s.setPrefs);
  const [mode, setMode] = useState<'median' | 'largest' | 'smallest' | 'reference' | 'occupancy'>('median');
  const [metric, setMetric] = useState<'area' | 'longest'>('area');
  const [occ, setOcc] = useState(0.8);
  const imgs = objs.filter((o): o is ImageObject => o.type === 'image');
  const moveBox = (dx: number, dy: number) => patchObjects(new Map(objs.map((o) => [o.id, maybePin(o, { x: o.x + dx, y: o.y + dy })])), 'Move', { key: 'multimove' });
  const scaleBox = (k: number) => {
    const c = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    patchObjects(new Map(objs.map((o) => [o.id, maybePin(o, scaleAbout(o, c, k))])), 'Scale', { key: 'multiscale' });
  };
  return (
    <>
      <LayoutStatus objs={objs} />
      <div className="muted small" style={{ padding: '6px 12px 0' }}>
        {objs.length} objects selected{imgs.length !== objs.length ? ` (${imgs.length} images)` : ''}
      </div>
      <ActionsRow />
      <Section title="Selection bounds" id="multi-tf">
        <div className="grid2">
          <Labeled label="X">
            <NumberField value={round(box.x, 1)} decimals={1} onChange={(x) => moveBox(x - box.x, 0)} />
          </Labeled>
          <Labeled label="Y">
            <NumberField value={round(box.y, 1)} decimals={1} onChange={(y) => moveBox(0, y - box.y)} />
          </Labeled>
          <Labeled label="W">
            <NumberField value={round(box.w, 1)} decimals={1} min={1} onChange={(w) => scaleBox(w / box.w)} />
          </Labeled>
          <Labeled label="H">
            <NumberField value={round(box.h, 1)} decimals={1} min={1} onChange={(h) => scaleBox(h / box.h)} />
          </Labeled>
        </div>
      </Section>
      <MultiShared objs={objs} />
      <Section title="Align & distribute" id="multi-align" right={<Check checked={visible} onChange={(v) => setPrefs({ alignVisible: v })} label={<span className="small" title="Use visible alpha bounds instead of the full image box">Visible bounds</span>} />}>
        <div className="iconbar">
          <button className="btn ghost icon" title="Align left" onClick={() => alignSelection('left')}>
            <AlignStartVertical size={15} />
          </button>
          <button className="btn ghost icon" title="Align center horizontally" onClick={() => alignSelection('hcenter')}>
            <AlignCenterVertical size={15} />
          </button>
          <button className="btn ghost icon" title="Align right" onClick={() => alignSelection('right')}>
            <AlignEndVertical size={15} />
          </button>
          <button className="btn ghost icon" title="Align top" onClick={() => alignSelection('top')}>
            <AlignStartHorizontal size={15} />
          </button>
          <button className="btn ghost icon" title="Align center vertically" onClick={() => alignSelection('vcenter')}>
            <AlignCenterHorizontal size={15} />
          </button>
          <button className="btn ghost icon" title="Align bottom" onClick={() => alignSelection('bottom')}>
            <AlignEndHorizontal size={15} />
          </button>
        </div>
        <div className="iconbar">
          <button className="btn ghost icon" title="Distribute horizontally (centers)" onClick={() => distributeSelection('x', 'centers')}>
            <AlignHorizontalDistributeCenter size={15} />
          </button>
          <button className="btn ghost icon" title="Distribute vertically (centers)" onClick={() => distributeSelection('y', 'centers')}>
            <AlignVerticalDistributeCenter size={15} />
          </button>
          <button className="btn ghost icon" title="Equal horizontal gaps" onClick={() => distributeSelection('x', 'gaps')}>
            <AlignHorizontalSpaceAround size={15} />
          </button>
          <button className="btn ghost icon" title="Equal vertical gaps" onClick={() => distributeSelection('y', 'gaps')}>
            <AlignVerticalSpaceAround size={15} />
          </button>
        </div>
        <div className="row wrap">
          <button className="btn sm" onClick={() => centerSelection('both')}>
            Center on canvas
          </button>
          <button className="btn sm" onClick={() => centerSelection('x')}>
            Center H
          </button>
          <button className="btn sm" onClick={() => centerSelection('y')}>
            Center V
          </button>
        </div>
      </Section>
      {imgs.length > 1 && (
        <Section title="Normalize visual size" id="multi-norm">
          <PropRow label="Match">
            <Select
              value={mode}
              onChange={setMode}
              options={[
                { value: 'median', label: 'Median' },
                { value: 'largest', label: 'Largest' },
                { value: 'smallest', label: 'Smallest' },
                { value: 'reference', label: 'Reference (last selected)' },
                { value: 'occupancy', label: 'Target occupancy' },
              ]}
            />
          </PropRow>
          <PropRow label="Measure">
            <Seg small value={metric} onChange={setMetric} options={[{ value: 'area', label: 'Visual area' }, { value: 'longest', label: 'Longest side' }]} />
          </PropRow>
          {mode === 'occupancy' && (
            <PropRow label="Occupancy">
              <Slider value={occ} min={0.2} max={1} step={0.01} scale={100} unit="%" onChange={setOcc} />
            </PropRow>
          )}
          <button className="btn sm primary" style={{ alignSelf: 'flex-start' }} onClick={() => normalizeSelection(mode, { refId: imgs[imgs.length - 1].id, occupancy: occ, metric })}>
            <Wand2 size={12} /> Normalize {imgs.length} images
          </button>
          <div className="hint">Uses alpha bounds, so padding inside the PNGs doesn't count. AI-generated icons with inconsistent framing end up visually even.</div>
        </Section>
      )}
      {imgs.length > 0 && <ImageEffects objs={imgs} />}
      {objs.some((o) => o.layoutId) && <DepthSection objs={objs.filter((o) => o.layoutId)} />}
      <div style={{ padding: 12 }}>
        <button className="btn layout-btn block" onClick={() => setStage('arrange')}>
          <Wand2 size={14} /> Smart Layout for {imgs.length} images…
        </button>
      </div>
    </>
  );
}
