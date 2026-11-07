// Smart Layout panel (Arrange tab). Every control re-runs the layout live; a slider drag is a
// single undo step. Pinned objects are never moved by re-runs.

import { LayoutAssetsDialog, selectionSummary } from '../dialogs/LayoutAssetsDialog';
import { layoutAssetIds, layoutSelection, selectableAssets, selectionDrift, setLayoutAssets } from '../../state/assetSelection';
import {
  Circle,
  Dices,
  Fan,
  Footprints,
  Frame,
  Grid2x2,
  Grid3x3,
  Layers,
  LayoutPanelTop,
  Rows3,
  Columns3,
  Spline,
  Orbit,
  Sparkles,
  Star,
  Shrink,
  Unlink,
  PinOff,
  RefreshCw,
  Trash2,
  MousePointerClick,
  Save,
  Wand2,
  Rainbow,
  BoxSelect,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Shuffle,
  Hexagon,
  CircleDot,
  LayoutDashboard,
  LayoutGrid,
  LayoutPanelLeft,
  Heart,
  PanelLeftRightDashed,
  Triangle,
} from 'lucide-react';
import type { LayoutInstance, LayoutPresetData, OverlapMode, Page, ParamValue } from '../../core/types';
import { allParams, getAlgorithm, withDefaults } from '../../layout/registry';
import { instancePath } from '../../layout/run';
import type { ParamDef } from '../../layout/types';
import type { PlanePreset } from '../../layout/perspective';
import type { PathPreset } from '../../layout/path';
import { useDoc, usePage } from '../../state/doc';
import { fillActiveTemplate } from '../../state/generators';
import {
  applyLayout,
  applyLayoutPreset,
  deleteLayout,
  detachObjects,
  findLayout,
  randomizeLayout,
  reapplyLayout,
  reorganizeLayout,
  resetLayoutParams,
  setLayoutSeed,
  seedHistoryOf,
  onSeedHistory,
  saveLayoutPreset,
  selectionLayout,
  setLayoutParam,
  setPathPreset,
  setPlane,
  setPlanePreset,
  unpinAll,
  updateLayout,
} from '../../state/layoutActions';
import { select, setHero } from '../../state/objects';
import { deletePreset, usePresets } from '../../state/presets';
import { useUI } from '../../state/ui';
import { NumberField, PropRow, Section, Seg, Select, Slider, Toggle } from '../components/controls';
import { FocalSection } from './Inspector';
import { pageLayoutId } from '../../state/pages';
import { LayoutGallery, LayoutPickerButton } from './LayoutPicker';
import { useEffect, useMemo, useState } from 'react';
import { askConfirm, askText } from '../components/ask';

const ICONS: Record<string, typeof Grid2x2> = {
  grid: Grid3x3,
  packed: Grid2x2,
  rows: Rows3,
  columns: Columns3,
  circle: Circle,
  arc: Rainbow,
  spiral: Orbit,
  scatter: Sparkles,
  cluster: Shrink,
  hero: Star,
  fan: Fan,
  cascade: Layers,
  edgeframe: Frame,
  floor: Footprints,
  wall: LayoutPanelTop,
  path: Spline,
  honeycomb: Hexagon,
  bands: PanelLeftRightDashed,
  pyramid: Triangle,
  roundcluster: CircleDot,
  feature: LayoutDashboard,
  catblocks: LayoutGrid,
  masonry: LayoutPanelLeft,
  shapefill: Heart,
};

export function LayoutPanel() {
  const page = usePage();
  const selIds = useUI((s) => s.selection);
  const activeId = useUI((s) => s.activeLayoutId);
  const selImages = page.objects.filter((o) => selIds.includes(o.id) && o.type === 'image');
  const shared = selectionLayout(page, selIds);
  // With nothing selected, the panel keeps showing the page's layout (the active one, else the
  // last one used) so a chosen layout stays put; selecting images outside it starts a new one.
  const inst = shared ?? (selIds.length === 0 ? findLayout(page, activeId) ?? findLayout(page, pageLayoutId(page)) : undefined) ?? null;
  const targetIds = selImages.length ? selImages.map((o) => o.id) : page.objects.filter((o) => o.type === 'image' && !o.locked && !o.hidden).map((o) => o.id);
  const targetCount = targetIds.length;
  return (
    <>
      {page.templateLayout && (
        <div className="callout layout" style={{ margin: '10px 12px 0' }}>
          <b>Template layout: {getAlgorithm(page.templateLayout.algorithm).label}</b>
          <span>This page came from a template. Fill it with the selected library assets (or all).</span>
          <button className="btn sm primary" onClick={() => fillActiveTemplate()}>
            <Wand2 size={12} /> Fill template
          </button>
        </div>
      )}
      {inst ? (
        <>
          <InstanceControls inst={inst} page={page} onSwitch={(id) => applyLayout(id, selImages.length ? selImages.map((o) => o.id) : inst.objectIds)} />
        </>
      ) : (
        <>
          <AlgorithmPicker page={page} objectIds={targetIds} count={targetCount} onPick={(id) => applyLayout(id, selImages.length ? selImages.map((o) => o.id) : undefined)} hasSelection={!!selImages.length} />
          <NoLayoutHelp page={page} />
        </>
      )}
      <FocalSection />
    </>
  );
}

function AlgorithmPicker({ page, objectIds, count, onPick, hasSelection }: { page: Page; objectIds: string[]; count: number; onPick: (id: string) => void; hasSelection: boolean }) {
  return (
    <Section title="Choose a layout" id="lay-pick">
      <div className="muted small">{count ? `Previews show your ${count} ${hasSelection ? 'selected ' : ''}image${count === 1 ? '' : 's'} — click one to apply it.` : 'Add assets to the canvas first.'}</div>
      <LayoutGallery page={page} objectIds={objectIds} onPick={onPick} disabled={!count} />
    </Section>
  );
}

function NoLayoutHelp({ page }: { page: Page }) {
  const presets = usePresets<LayoutPresetData>('layout');
  return (
    <>
      {page.layouts.length > 0 && (
        <Section title="Layouts on this page" id="lay-list">
          {page.layouts.map((l) => (
            <button
              key={l.id}
              className="list-btn"
              onClick={() => {
                useUI.setState({ activeLayoutId: l.id });
                select(l.objectIds);
              }}
            >
              <span className="ico">{(() => { const I = ICONS[l.algorithm] ?? BoxSelect; return <I size={14} />; })()}</span>
              {getAlgorithm(l.algorithm).label}
              <small>{l.objectIds.length} objects</small>
            </button>
          ))}
        </Section>
      )}
      <PresetList presets={presets} />
      <div className="callout" style={{ margin: 12 }}>
        <b>Tip</b>
        <span>Select images on the canvas (or none for all), pick a layout, then refine: drag any asset by hand — it gets pinned and stays put when you randomize or change settings.</span>
      </div>
    </>
  );
}

function PresetList({ presets }: { presets: { id: string; name: string; data: LayoutPresetData }[] }) {
  if (!presets.length) return null;
  return (
    <Section title="My layout presets" id="lay-presets">
      {presets.map((p) => (
        <div key={p.id} className="row">
          <button className="list-btn" onClick={() => applyLayoutPreset(p.data)} title="Apply to the selection (or all images)">
            <span className="ico">{(() => { const I = ICONS[p.data.algorithm] ?? BoxSelect; return <I size={14} />; })()}</span>
            {p.name}
            <small>{getAlgorithm(p.data.algorithm).label}</small>
          </button>
          <button className="btn ghost icon sm" title="Delete preset" onClick={() => void askConfirm({ title: `Delete layout preset “${p.name}”?`, danger: true }).then((ok) => {
            if (ok) void deletePreset(p.id);
          })}>
            <Trash2 size={12} />
          </button>
        </div>
      ))}
    </Section>
  );
}

/** Show / hide this layout's guides and handles on the canvas (the layout itself always stays). */
function GuidesToggle({ inst }: { inst: LayoutInstance }) {
  const on = useUI((s) => s.activeLayoutId === inst.id);
  return (
    <button
      className={`btn icon sm ${on ? 'active' : ''}`}
      title={on ? 'Hide layout guides on the canvas' : 'Show layout guides on the canvas'}
      aria-label="Layout guides"
      aria-pressed={on}
      onClick={() => useUI.setState({ activeLayoutId: on ? null : inst.id })}
    >
      {on ? <Eye size={14} /> : <EyeOff size={14} />}
    </button>
  );
}

/** Switch between several layouts on one page, or start another one for a selection. */
function LayoutSwitcher({ page, inst }: { page: Page; inst: LayoutInstance }) {
  if (page.layouts.length < 2) return null;
  return (
    <div className="layout-switch">
      <span className="muted small">On this page</span>
      <Select
        value={inst.id}
        onChange={(id) => {
          useUI.getState().setSelection([]);
          useUI.setState({ activeLayoutId: id });
        }}
        options={page.layouts.map((l, i) => ({ value: l.id, label: `${i + 1}. ${getAlgorithm(l.algorithm).label} · ${l.objectIds.length} objects` }))}
      />
    </div>
  );
}

/** Which icons the layout uses: a one-line summary and the picker (Layout ▸ Icons). */
function LayoutIcons({ page, inst }: { page: Page; inst: LayoutInstance }) {
  const [open, setOpen] = useState(false);
  const assets = useDoc((s) => s.doc.assets);
  const all = useMemo(() => selectableAssets({ assets }), [assets]);
  const sel = layoutSelection(page, inst);
  const count = layoutAssetIds(page, inst).length;
  const drift = selectionDrift(page, inst, all);
  const changed = drift.add + drift.remove;
  return (
    <div className="layout-icons">
      <span className="muted small">Icons</span>
      <span className="grow ellipsis small" title="Which of the project's icons this layout uses">
        {selectionSummary(sel, count, all.length)}
      </span>
      {changed > 0 && (
        <button className="btn ghost sm" title={`${drift.add ? `${drift.add} new matching icon${drift.add === 1 ? '' : 's'}` : ''}${drift.add && drift.remove ? ', ' : ''}${drift.remove ? `${drift.remove} no longer matching` : ''} — update the layout`} onClick={() => setLayoutAssets(page.id, inst.id, inst.assetSelection!)}>
          Update
        </button>
      )}
      <button className="btn sm" onClick={() => setOpen(true)}>
        Choose…
      </button>
      {open && <LayoutAssetsDialog page={page} inst={inst} onClose={() => setOpen(false)} />}
    </div>
  );
}

function LayoutHeader({ inst, page, onSwitch }: { inst: LayoutInstance; page: Page; onSwitch: (id: string) => void }) {
  const Icon = ICONS[inst.algorithm] ?? BoxSelect;
  return (
    <div className="layout-head">
      <Icon size={16} style={{ color: 'var(--layout)', flex: 'none' }} />
      <LayoutPickerButton page={page} inst={inst} onPick={onSwitch} />
      <GuidesToggle inst={inst} />
    </div>
  );
}

const PERSPECTIVE_STYLES: { label: string; hint: string; params: Record<string, ParamValue> }[] = [
  { label: 'Organic', hint: 'Lively, slightly random, gentle overlap', params: { arrange: 'organic', rowSort: 'order', noOverlap: false, randPos: 0.18, randScale: 0.08, randRot: 4, overlap: 0.15, stagger: true, density: 0.86 } },
  { label: 'Perfect grid', hint: 'Equal columns converging to the vanishing point, no overlap', params: { arrange: 'grid', rowSort: 'order', noOverlap: true, density: 0.9 } },
  { label: 'Fitted rows', hint: 'Clean rows, more items toward the back, no overlap', params: { arrange: 'rows', rowSort: 'order', noOverlap: true, density: 0.92 } },
  { label: 'Category rows', hint: 'One category per row, first category in front', params: { arrange: 'rows', rowSort: 'category', noOverlap: true, density: 0.92, rows: 0 } },
  { label: 'Big in front', hint: 'Largest assets in the front rows', params: { arrange: 'organic', rowSort: 'sizeFront', noOverlap: true, near: 1.35, far: 0.38, randPos: 0.12, randRot: 3 } },
  { label: 'Dense pile', hint: 'Tightly packed, overlapping showcase', params: { arrange: 'organic', rowSort: 'sizeFront', noOverlap: false, density: 1.15, overlap: 0.45, randPos: 0.3, randRot: 8 } },
];

/** Settings that make an arrangement vary with the seed — shown first, next to the seed controls. */
const RANDOM_KEYS = ['randPos', 'randScale', 'randRot', 'overlap', 'rotation', 'variation', 'sizeMin', 'sizeMax', 'jPos', 'jScale', 'jRot'];

function InstanceControls({ inst, page, onSwitch }: { inst: LayoutInstance; page: Page; onSwitch: (id: string) => void }) {
  const alg = getAlgorithm(inst.algorithm);
  const params = withDefaults(alg, inst.params);
  const defs = allParams(alg).filter((d) => !d.when || d.when(params));
  const random = defs.filter((d) => RANDOM_KEYS.includes(d.key)).sort((x, y) => RANDOM_KEYS.indexOf(x.key) - RANDOM_KEYS.indexOf(y.key));
  const orderDef = defs.find((d) => d.key === 'order');
  const basic = defs.filter((d) => !d.advanced && d.key !== 'order' && !RANDOM_KEYS.includes(d.key));
  const adv = defs.filter((d) => d.advanced && !RANDOM_KEYS.includes(d.key));
  const noRandomness = random.every((d) => !Number(params[d.key]) || (d.key === 'sizeMin' || d.key === 'sizeMax'));
  const history = useSeedHistory(inst.id);
  const members = page.objects.filter((o) => o.layoutId === inst.id);
  const pinned = members.filter((o) => o.pinned).length;
  const presets = usePresets<LayoutPresetData>('layout');
  const selIds = useUI((s) => s.selection);
  const set = (k: string, v: ParamValue) => setLayoutParam(inst.id, k, v);
  return (
    <>
      <LayoutHeader inst={inst} page={page} onSwitch={onSwitch} />
      <LayoutSwitcher page={page} inst={inst} />
      <div className="layout-tip muted small">Pick another type above to change it — your objects, seed and rules carry over. To lay out only some assets separately, select them on the canvas first.</div>
      <LayoutIcons page={page} inst={inst} />
      {alg.plane && (
        <Section title="Showcase style" id="lay-style">
          <div className="row wrap">
            {PERSPECTIVE_STYLES.map((st) => {
              const on = Object.entries(st.params).every(([k, v]) => params[k] === v);
              return (
                <button key={st.label} className={`chip ${on ? 'on' : ''}`} title={st.hint} onClick={() => updateLayout(inst.id, { params: { ...inst.params, ...st.params } }, { label: `Style: ${st.label}` })}>
                  {st.label}
                </button>
              );
            })}
          </div>
        </Section>
      )}
      {alg.styles && (
        <Section title="Quick styles" id="lay-qstyle">
          <div className="row wrap">
            {alg.styles.map((st) => {
              const on = Object.entries(st.params).every(([k, v]) => params[k] === v);
              return (
                <button key={st.label} className={`chip ${on ? 'on' : ''}`} title={st.hint} onClick={() => updateLayout(inst.id, { params: { ...inst.params, ...st.params } }, { label: `Style: ${st.label}` })}>
                  {st.label}
                </button>
              );
            })}
          </div>
        </Section>
      )}
      <Section title="Arrangement" id="lay-arr">
        <div className="seed-row">
          <span className="seed-label">Seed</span>
          <button className="btn icon sm" title="Previous seed" aria-label="Previous seed" onClick={() => setLayoutSeed(inst.id, Math.max(1, inst.seed - 1))}>
            <ChevronLeft size={13} />
          </button>
          <NumberField value={inst.seed} min={1} max={9999999} onChange={(seed) => setLayoutSeed(inst.id, seed)} />
          <button className="btn icon sm" title="Next seed" aria-label="Next seed" onClick={() => setLayoutSeed(inst.id, inst.seed + 1)}>
            <ChevronRight size={13} />
          </button>
          <button className="btn sm primary" title="New random arrangement (Ctrl+R). Pinned objects stay." onClick={() => randomizeLayout(inst.id)}>
            <Dices size={13} /> Shuffle
          </button>
        </div>
        {history.length > 0 && (
          <div className="seed-history">
            <span className="muted small">Recent</span>
            {history.map((sd) => (
              <button key={sd} className="chip mono" title="Go back to this seed" onClick={() => setLayoutSeed(inst.id, sd)}>
                {sd}
              </button>
            ))}
          </div>
        )}
        <div className="row arr-actions">
          <button className="btn sm" title="Shuffle which asset goes in which spot — the arrangement stays" onClick={() => reorganizeLayout(inst.id)}>
            <Shuffle size={13} /> Reorganize
          </button>
          <button className="btn sm" title="Re-run the layout (pinned objects stay)" onClick={() => reapplyLayout(inst.id)}>
            <RefreshCw size={13} /> Reapply
          </button>
          <button className="btn sm" title="Reset all settings of this layout to their defaults" onClick={() => resetLayoutParams(inst.id)}>
            <RotateCcw size={13} /> Reset
          </button>
        </div>
        {orderDef && <ParamControl def={{ ...orderDef, label: 'Sort assets by' }} value={params.order} onChange={(v) => set('order', v)} />}
        {random.map((d) => (
          <ParamControl key={d.key} def={d} value={params[d.key]} onChange={(v) => set(d.key, v)} />
        ))}
        {random.length > 0 && noRandomness && <div className="hint">All randomness is at 0, so the seed can't change positions. Raise a slider above, or use Reorganize to swap assets around.</div>}
      </Section>
      <Section
        title={`${alg.label} settings`}
        id="lay-inst"
        right={
          <span className="row">
            <button className="btn ghost icon sm" title="Select all objects in this layout" onClick={() => { select(inst.objectIds); useUI.setState({ activeLayoutId: inst.id }); }}>
              <MousePointerClick size={13} />
            </button>
            <button className="btn ghost icon sm" title="Reapply (re-run, pinned stay)" onClick={() => reapplyLayout(inst.id)}>
              <RefreshCw size={13} />
            </button>
          </span>
        }
      >
        <div className="row wrap small">
          <span className="status-pill layout">{members.length} objects</span>
          {pinned > 0 && <span className="status-pill pinned">{pinned} pinned</span>}
          <span className="grow" />
          {pinned > 0 && (
            <button className="btn ghost sm" onClick={() => unpinAll(inst.id)} title="Unpin all and re-run">
              <PinOff size={12} /> Unpin all
            </button>
          )}
        </div>
        <div className="muted small">{alg.description}</div>
        {basic.map((d) => (
          <ParamControl key={d.key} def={d} value={params[d.key]} onChange={(v) => set(d.key, v)} />
        ))}
        {alg.id === 'hero' && (
          <div className="row wrap">
            <button className="btn sm" disabled={!selIds.length} onClick={() => setHero(selIds, true)} title="Mark the selected objects as heroes">
              <Star size={12} /> Set selected as heroes
            </button>
            <button className="btn sm" onClick={() => setHero(inst.objectIds, false)}>
              Clear heroes
            </button>
          </div>
        )}
      </Section>
      {alg.plane && <PlaneSection inst={inst} />}
      {alg.usesPath && <PathSection inst={inst} />}
      {adv.length > 0 && (
        <Section title="Advanced" id="lay-adv" defaultOpen={false}>
          {adv.map((d) => (
            <ParamControl key={d.key} def={d} value={params[d.key]} onChange={(v) => set(d.key, v)} />
          ))}
        </Section>
      )}
      <Section title="Rules" id="lay-rules">
        <PropRow label="Overlap" title="Strict: no visible overlap · Relaxed: minor · Showcase: intentional">
          <Seg<OverlapMode>
            small
            value={inst.overlap}
            onChange={(overlap) => updateLayout(inst.id, { overlap }, { label: 'Overlap mode' })}
            options={[
              { value: 'strict', label: 'Strict' },
              { value: 'relaxed', label: 'Relaxed' },
              { value: 'showcase', label: 'Showcase' },
            ]}
          />
        </PropRow>
        {inst.overlap === 'showcase' && (
          <PropRow label="Max overlap">
            <Slider value={inst.maxOverlap} min={0} max={0.9} step={0.01} scale={100} unit="%" onChange={(maxOverlap) => updateLayout(inst.id, { maxOverlap }, { key: 'mo' + inst.id })} />
          </PropRow>
        )}
        <PropRow label="Avoid focal region" title={page.focal.enabled ? 'Keep assets out of the focal region' : 'Enable the focal region below first'}>
          <Toggle checked={inst.avoidFocal} onChange={(avoidFocal) => updateLayout(inst.id, { avoidFocal })} />
          {!page.focal.enabled && <span className="muted small">(region off)</span>}
        </PropRow>
        <PropRow label="Respect safe zone">
          <Toggle checked={inst.respectSafe} onChange={(respectSafe) => updateLayout(inst.id, { respectSafe })} />
          {!page.safeZone.enabled && <span className="muted small">(safe zone off)</span>}
        </PropRow>
      </Section>
      <Section title="Layout actions" id="lay-actions" defaultOpen={false}>
        <div className="row wrap">
          <button
            className="btn sm"
            onClick={() => {
              void askText({ title: 'Save layout preset', message: 'Saves the layout type and all its settings.', value: `My ${alg.label}`, okLabel: 'Save' }).then((name) => {
            if (name) void saveLayoutPreset(inst.id, name);
          });
            }}
          >
            <Save size={12} /> Save as preset
          </button>
          <button className="btn sm" onClick={() => detachObjects(inst.objectIds)} title="Objects become fully manual">
            <Unlink size={12} /> Detach all
          </button>
          <button className="btn sm danger" onClick={() => deleteLayout(inst.id)} title="Remove the layout (objects stay where they are)">
            <Trash2 size={12} /> Remove layout
          </button>
        </div>
      </Section>
      <PresetList presets={presets} />
    </>
  );
}

function useSeedHistory(instId: string): number[] {
  const [, force] = useState(0);
  useEffect(() => onSeedHistory(() => force((n) => n + 1)), []);
  return seedHistoryOf(instId);
}

function ParamControl({ def, value, onChange }: { def: ParamDef; value: ParamValue; onChange: (v: ParamValue) => void }) {
  const label = <span title={def.hint}>{def.label}</span>;
  if (def.type === 'bool') {
    return (
      <PropRow label={label}>
        <Toggle checked={!!value} onChange={onChange} />
      </PropRow>
    );
  }
  if (def.type === 'select') {
    return (
      <PropRow label={label}>
        <Select value={String(value)} onChange={onChange} options={def.options ?? []} />
      </PropRow>
    );
  }
  if (def.type === 'int') {
    const v = Number(value) || 0;
    return (
      <PropRow label={label}>
        {def.autoZero && (
          <button className={`btn sm ${v === 0 ? 'active' : ''}`} title="Choose automatically" onClick={() => onChange(0)}>
            Auto
          </button>
        )}
        <input type="range" min={def.autoZero ? 1 : def.min ?? 0} max={def.max ?? 50} step={1} value={v || (def.autoZero ? 1 : 0)} onChange={(e) => onChange(+e.target.value)} style={{ opacity: def.autoZero && v === 0 ? 0.45 : 1 }} />
        <NumberField value={v === 0 && def.autoZero ? null : v} placeholder="Auto" min={def.min} max={def.max} onChange={onChange} width={52} />
      </PropRow>
    );
  }
  if (def.zeroLabel) {
    const v = Number(value) || 0;
    const mid = ((def.min ?? 0) + (def.max ?? 1)) / 2;
    return (
      <PropRow label={label}>
        <button className={`btn sm ${v === 0 ? 'active' : ''}`} title={v === 0 ? 'Turned off' : 'Turn off'} onClick={() => onChange(v === 0 ? Math.round(mid * 100) / 100 : 0)}>
          {def.zeroLabel}
        </button>
        <Slider value={v || (def.min ?? 0)} min={def.min ?? 0} max={def.max ?? 1} step={def.step ?? 1} scale={def.scale} unit={def.unit} decimals={def.decimals ?? 0} onChange={onChange} />
      </PropRow>
    );
  }
  return (
    <PropRow label={label}>
      <Slider value={Number(value)} min={def.min ?? 0} max={def.max ?? 1} step={def.step ?? 1} scale={def.scale} unit={def.unit} decimals={def.decimals ?? 0} onChange={onChange} />
    </PropRow>
  );
}

function PlaneSection({ inst }: { inst: LayoutInstance }) {
  const presets: { id: PlanePreset; label: string }[] = [
    { id: 'centered', label: 'Centered' },
    { id: 'left', label: 'Left VP' },
    { id: 'right', label: 'Right VP' },
    { id: 'strong', label: 'Strong' },
    { id: 'subtle', label: 'Subtle' },
  ];
  return (
    <Section title="Perspective plane" id="lay-plane">
      <div className="row wrap">
        {presets.map((p) => (
          <button key={p.id} className="chip" onClick={() => setPlanePreset(inst.id, p.id)}>
            {p.label}
          </button>
        ))}
        <button className="chip" onClick={() => setPlane(inst.id, undefined)} title="Reset the plane to the default for this canvas">
          Reset
        </button>
      </div>
      <div className="hint">Drag the four violet corner handles on the canvas. Grid lines and the vanishing point are editor guides only.</div>
    </Section>
  );
}

function PathSection({ inst }: { inst: LayoutInstance }) {
  const page = usePage();
  const path = instancePath(page, inst) ?? [];
  const presets: { id: PathPreset; label: string }[] = [
    { id: 'arc', label: 'Arc' },
    { id: 'wave', label: 'Wave' },
    { id: 'diagonal', label: 'Diagonal' },
    { id: 'scurve', label: 'S-curve' },
    { id: 'smile', label: 'Smile' },
    { id: 'line', label: 'Line' },
  ];
  const n = path.length;
  return (
    <Section title="Path" id="lay-path">
      <div className="row wrap">
        {presets.map((p) => (
          <button key={p.id} className="chip" onClick={() => setPathPreset(inst.id, p.id)}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="row">
        <span className="muted small grow">{n} control points — drag them on the canvas</span>
        <button
          className="btn sm"
          onClick={() => {
            const pts = path;
            if (pts.length < 2) return;
            // insert a point in the middle of the longest segment
            let best = 0,
              bl = -1;
            for (let i = 0; i < pts.length - 1; i++) {
              const l = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
              if (l > bl) {
                bl = l;
                best = i;
              }
            }
            const mid = { x: (pts[best].x + pts[best + 1].x) / 2, y: (pts[best].y + pts[best + 1].y) / 2 };
            updateLayout(inst.id, { path: [...pts.slice(0, best + 1), mid, ...pts.slice(best + 1)] }, { label: 'Add path point' });
          }}
        >
          + Point
        </button>
        <button className="btn sm" disabled={path.length <= 2} onClick={() => updateLayout(inst.id, { path: path.filter((_, i) => i !== Math.floor(path.length / 2)) }, { label: 'Remove path point' })}>
          − Point
        </button>
      </div>
    </Section>
  );
}
