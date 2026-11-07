// Watermark panel: switch it on, start from a preset, then edit layers (text or logo), where they go
// (one mark, a repeated pattern or a mark on every icon), how they look and which pages carry them.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, ImagePlus, MoreHorizontal, Plus, Save, Sparkles, Star, Type, Wand2 } from 'lucide-react';
import { FONT_FAMILIES } from '../../core/defaults';
import { ANCHORS, defaultLayer, markBox, presetLayers, suggestAnchor, WATERMARK_PRESETS, WM_TOKENS, wmAppliesTo, type WatermarkPreset } from '../../core/watermark';
import { contrastRatio } from '../../core/themes';
import type { StoredPreset, WatermarkLayer, WmAnchor } from '../../core/types';
import { visibleAABB } from '../../core/transform';
import { images } from '../../render/images';
import { drawWatermark, measureWmText, renderPage, watermarkMarks } from '../../render/renderer';
import { getAsset, getDoc, getPage, useDoc, usePage } from '../../state/doc';
import { addLayer, applyWatermarkPreset, duplicateLayer, getWatermark, moveLayer, removeLayer, setWatermark, updateLayer, wmVars } from '../../state/watermark';
import { deletePreset, savePreset, usePresets } from '../../state/presets';
import { duplicatePreset, renamePreset } from '../../state/customPresets';
import { usePrefs } from '../../state/prefs';
import { toast, useUI } from '../../state/ui';
import { openFilePicker } from '../App';
import { askConfirm, askText } from '../components/ask';
import { ColorField, PropRow, Section, Seg, Select, Slider, Toggle } from '../components/controls';
import { openMenu } from '../menus';
import { useFavorites } from '../left/libraryKit';

// ---------------------------------------------------------------------------
// Preset tiles: the open page, small, with the preset's watermark drawn over it
// ---------------------------------------------------------------------------

function PresetThumb({ layers }: { layers: WatermarkLayer[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const page = usePage();
  const name = useDoc((s) => s.doc.name);
  const brand = usePrefs((s) => s.brandName);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const t = setTimeout(() => {
      const W = 240;
      const k = W / Math.max(page.width, page.height);
      c.width = Math.round(page.width * k);
      c.height = Math.round(page.height * k);
      ctx.setTransform(k, 0, 0, k, 0, 0);
      const opts = { pxScale: k, getAsset, getImage: (id: string) => images.previews.get(id) ?? null };
      renderPage(ctx, page, opts);
      // the page is dimmed so the watermark itself is what the tile shows
      ctx.fillStyle = 'rgba(12,12,13,0.45)';
      ctx.fillRect(0, 0, page.width, page.height);
      drawWatermark(ctx, page, { watermark: { enabled: true, layers, scope: 'all', pageIds: [] }, vars: wmVars(getDoc()) }, opts);
    }, 60);
    return () => clearTimeout(t);
  }, [page, layers, name, brand]);
  return <canvas ref={ref} className="wm-preset-thumb" />;
}

// ---------------------------------------------------------------------------
// Nine-point position picker
// ---------------------------------------------------------------------------

function AnchorGrid({ value, onChange }: { value: WmAnchor; onChange: (a: WmAnchor) => void }) {
  const names: Record<WmAnchor, string> = { tl: 'Top left', tc: 'Top', tr: 'Top right', ml: 'Left', mc: 'Center', mr: 'Right', bl: 'Bottom left', bc: 'Bottom', br: 'Bottom right' };
  return (
    <div className="anchor-grid" role="radiogroup" aria-label="Position">
      {ANCHORS.map((a) => (
        <button key={a} role="radio" aria-checked={value === a} aria-label={names[a]} title={names[a]} className={value === a ? 'on' : ''} onClick={() => onChange(a)}>
          <span />
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function WatermarkPanel() {
  const doc = useDoc((s) => s.doc);
  const page = usePage();
  const wm = useMemo(() => getWatermark(doc), [doc]);
  const selId = useUI((s) => s.wmSel);
  const sel = wm.layers.find((l) => l.id === selId) ?? wm.layers[wm.layers.length - 1];
  const brand = usePrefs((s) => s.brandName);
  const logos = useMemo(() => doc.assets.filter((a) => a.kind === 'watermark'), [doc.assets]);
  const saved = usePresets<{ layers: WatermarkLayer[] }>('watermark');
  const favs = useFavorites('watermarks');
  // a logo imported from here becomes a new layer as soon as it arrives
  const awaitLogo = useRef<{ count: number; layer?: string } | null>(null);
  useEffect(() => {
    const a = awaitLogo.current;
    if (!a || logos.length <= a.count) return;
    const logo = logos[logos.length - 1];
    awaitLogo.current = null;
    if (a.layer) updateLayer(a.layer, { assetId: logo.id });
    else useUI.setState({ wmSel: addLayer('image', { assetId: logo.id, name: logo.name.replace(/\.[a-z0-9]+$/i, '') }).id });
  }, [logos]);
  const importLogo = (layer?: string) => {
    awaitLogo.current = { count: logos.length, layer };
    openFilePicker('watermark');
  };
  const setL = (patch: Partial<WatermarkLayer>, key?: string) => sel && updateLayer(sel.id, patch, key);
  const firstLogo = logos[0]?.id;

  const usePresetFn = (p: Pick<WatermarkPreset, 'layers' | 'name'>, mode: 'replace' | 'add') => {
    const needsLogo = p.layers.some((l) => l.kind === 'image' && !l.assetId);
    if (needsLogo && !firstLogo) {
      toast('This preset uses a logo — import one first (Add ▸ Logo)', 'info');
      return;
    }
    applyWatermarkPreset(p, mode, firstLogo);
    const w = getWatermark();
    useUI.setState({ wmSel: w.layers[w.layers.length - 1]?.id ?? null });
  };

  const suggest = () => {
    if (!sel) return;
    const pg = getPage();
    const c = document.createElement('canvas').getContext('2d')!;
    const vars = { ...wmVars(), page: pg.name };
    const text = sel.text.replace(/\{(\w+)\}/g, (m, k: string) => (vars as Record<string, string>)[k] ?? m);
    const asset = sel.assetId ? getAsset(sel.assetId) : undefined;
    const aspect = asset?.width && asset.height ? asset.width / asset.height : 1;
    const boxes = {
      text: pg.objects.filter((o) => o.type === 'text' && !o.hidden).map((o) => visibleAABB(o)),
      icons: pg.objects.filter((o) => o.type === 'image' && !o.hidden).map((o) => visibleAABB(o, o.type === 'image' ? getAsset(o.assetId) : undefined)),
    };
    const anchor = suggestAnchor(sel, pg, (px) => measureWmText(c, sel, text, px), aspect, boxes);
    // contrast: sample the page where the mark will sit and pick light or dark ink
    let color = sel.color;
    if (sel.kind === 'text') {
      const mk = watermarkMarks(c, pg, { watermark: { enabled: true, layers: [{ ...sel, anchor, dx: 0, dy: 0, mode: 'single', visible: true }], scope: 'all', pageIds: [] }, vars }, getAsset, (id) => images.previews.get(id) ?? null)[0]?.marks[0];
      if (mk) {
        const b = markBox(mk);
        const k = Math.min(1, 96 / Math.max(1, b.w));
        const cv = new OffscreenCanvas(Math.max(4, Math.round(b.w * k)), Math.max(4, Math.round(b.h * k)));
        const cx = cv.getContext('2d', { willReadFrequently: true })!;
        cx.setTransform(k, 0, 0, k, -b.x * k, -b.y * k);
        renderPage(cx, pg, { pxScale: k, getAsset, getImage: (id) => images.previews.get(id) ?? null });
        const d = cx.getImageData(0, 0, cv.width, cv.height).data;
        let r = 0,
          g = 0,
          bl = 0;
        for (let i = 0; i < d.length; i += 4) (r += d[i]), (g += d[i + 1]), (bl += d[i + 2]);
        const n = d.length / 4 || 1;
        const avg = '#' + [r / n, g / n, bl / n].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
        color = contrastRatio('#ffffff', avg) >= contrastRatio('#111111', avg) ? '#ffffff' : '#111111';
      }
    }
    updateLayer(sel.id, { anchor, dx: 0, dy: 0, mode: sel.mode === 'tile' ? 'tile' : sel.mode, color });
    const names: Record<WmAnchor, string> = { tl: 'top left', tc: 'top', tr: 'top right', ml: 'left', mc: 'center', mr: 'right', bl: 'bottom left', bc: 'bottom', br: 'bottom right' };
    toast(`Moved to the ${names[anchor]}, clear of the title and the focal region${sel.kind === 'text' ? `, ${color === '#ffffff' ? 'light' : 'dark'} text for contrast` : ''} — Ctrl+Z to undo`, 'success', 5000);
  };

  const pages = doc.pages;
  const inScope = (id: string) => (wm.scope === 'only' ? wm.pageIds.includes(id) : !wm.pageIds.includes(id));
  const togglePage = (id: string) => setWatermark((w) => ({ ...w, pageIds: w.pageIds.includes(id) ? w.pageIds.filter((x) => x !== id) : [...w.pageIds, id] }), 'Watermark pages');

  return (
    <div className="wm-panel">
      <Section title="Watermark" id="wm-main" right={<span onClick={(e) => e.stopPropagation()}><Toggle checked={wm.enabled} onChange={(enabled) => setWatermark((w) => ({ ...w, enabled }), enabled ? 'Watermark on' : 'Watermark off')} title="Draw the watermark in Review and exports" /></span>}>
        <PropRow label="Brand" title="Fills {brand} in watermark text. Kept in Settings ▸ Watermark for every project">
          <input className="input sm" value={brand} placeholder={doc.name} onChange={(e) => usePrefs.getState().setPrefs({ brandName: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
        </PropRow>
        <div className="hint">Drawn over your pages in Review and exports, never into them. Export can also save a clean copy next to each watermarked one.</div>
      </Section>

      <Section title="Presets" id="wm-presets" defaultOpen={!wm.layers.length}>
        <div className="wm-presets">
          {[...WATERMARK_PRESETS]
            .sort((a, b) => Number(favs.has('wm:' + b.id)) - Number(favs.has('wm:' + a.id)))
            .map((p) => (
              <div key={p.id} className="wm-preset">
                <button
                  title={`${p.name} — ${p.desc}\nClick to use · right-click to add to the current layers`}
                  onClick={() => usePresetFn(p, 'replace')}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    openMenu(e.clientX, e.clientY, [
                      { label: 'Use (replace layers)', onClick: () => usePresetFn(p, 'replace') },
                      { label: 'Add to current layers', onClick: () => usePresetFn(p, 'add') },
                      { label: favs.has('wm:' + p.id) ? 'Remove from favourites' : 'Add to favourites', onClick: () => favs.toggle('wm:' + p.id) },
                    ]);
                  }}
                >
                  <PresetThumb layers={presetLayers(p, firstLogo)} />
                  <span>
                    {favs.has('wm:' + p.id) && <Star size={10} className="fav-mark" />} {p.name}
                    {!firstLogo && p.layers.some((l) => l.kind === 'image') && <small className="wm-needs">needs a logo</small>}
                  </span>
                </button>
              </div>
            ))}
        </div>
        <div className="smart-label">My presets</div>
        {saved.length ? (
          <div className="wm-presets">
            {saved.map((p) => (
              <div key={p.id} className="wm-preset">
                <button
                  title={`${p.name} — click to use · right-click for more`}
                  onClick={() => usePresetFn({ name: p.name, layers: p.data.layers }, 'replace')}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    openMenu(e.clientX, e.clientY, [
                      { label: 'Use (replace layers)', onClick: () => usePresetFn({ name: p.name, layers: p.data.layers }, 'replace') },
                      { label: 'Add to current layers', onClick: () => usePresetFn({ name: p.name, layers: p.data.layers }, 'add') },
                      { label: 'Rename…', onClick: () => void askText({ title: 'Rename preset', value: p.name, okLabel: 'Rename' }).then((n) => n && void renamePreset(p as StoredPreset, n)) },
                      { label: 'Duplicate', onClick: () => void duplicatePreset(p as StoredPreset) },
                      { separator: true },
                      { label: 'Delete…', danger: true, onClick: () => void askConfirm({ title: `Delete preset “${p.name}”?`, message: 'Projects using it keep their watermark.', danger: true }).then((ok) => ok && void deletePreset(p.id)) },
                    ]);
                  }}
                >
                  <PresetThumb layers={p.data.layers} />
                  <span>{p.name}</span>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="hint">Save the layers you set up as a preset to reuse them in any project.</div>
        )}
        <button
          className="btn sm"
          disabled={!wm.layers.length}
          onClick={() =>
            void askText({ title: 'Save watermark preset', message: 'Saves the layers (text, logo, placement and look) on this computer for every project.', value: 'My watermark', okLabel: 'Save' }).then((n) => {
              if (n) void savePreset('watermark', n, { layers: wm.layers.map((l) => ({ ...l })) });
            })
          }
        >
          <Save size={12} /> Save as preset
        </button>
      </Section>

      <Section
        title="Layers"
        id="wm-layers"
        right={
          <span onClick={(e) => e.stopPropagation()}>
            <button
              className="btn ghost sm"
              title="Add a text or logo layer"
              onClick={(e) =>
                openMenu(e.clientX - 120, e.clientY + 12, [
                  { label: 'Text', onClick: () => useUI.setState({ wmSel: addLayer('text').id }) },
                  ...logos.map((a) => ({ label: `Logo: ${a.name}`, onClick: () => useUI.setState({ wmSel: addLayer('image', { assetId: a.id, name: a.name.replace(/\.[a-z0-9]+$/i, '') }).id }) })),
                  { label: 'Import a logo…', onClick: () => importLogo() },
                ])
              }
            >
              <Plus size={13} /> Add
            </button>
          </span>
        }
      >
        {wm.layers.length ? (
          <div className="wm-layers" role="listbox" aria-label="Watermark layers">
            {wm.layers
              .slice()
              .reverse()
              .map((l) => (
                <div key={l.id} role="option" aria-selected={sel?.id === l.id} className={`wm-layer ${sel?.id === l.id ? 'on' : ''}`} onClick={() => useUI.setState({ wmSel: l.id })}>
                  {l.kind === 'text' ? <Type size={14} /> : <ImagePlus size={14} />}
                  <span className="grow ellipsis" onDoubleClick={() => void askText({ title: 'Rename layer', value: l.name, okLabel: 'Rename' }).then((n) => n && updateLayer(l.id, { name: n }))}>
                    {l.name}
                  </span>
                  <small>{l.mode === 'tile' ? 'Repeat' : l.mode === 'icon' ? 'Each icon' : ''}</small>
                  <button className="icon-btn sm" title={l.visible ? 'Hide' : 'Show'} aria-label={l.visible ? 'Hide layer' : 'Show layer'} onClick={(e) => (e.stopPropagation(), updateLayer(l.id, { visible: !l.visible }))}>
                    {l.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>
                  <button
                    className="icon-btn sm"
                    title="More"
                    aria-label={`More for ${l.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      openMenu(e.clientX - 160, e.clientY + 10, [
                        { label: 'Rename…', onClick: () => void askText({ title: 'Rename layer', value: l.name, okLabel: 'Rename' }).then((n) => n && updateLayer(l.id, { name: n })) },
                        { label: 'Duplicate', onClick: () => useUI.setState({ wmSel: duplicateLayer(l.id) ?? l.id }) },
                        { label: 'Move up', onClick: () => moveLayer(l.id, 1) },
                        { label: 'Move down', onClick: () => moveLayer(l.id, -1) },
                        { label: l.locked ? 'Unlock' : 'Lock (no dragging)', onClick: () => updateLayer(l.id, { locked: !l.locked }) },
                        { separator: true },
                        { label: 'Delete', danger: true, onClick: () => removeLayer(l.id) },
                      ]);
                    }}
                  >
                    <MoreHorizontal size={13} />
                  </button>
                </div>
              ))}
          </div>
        ) : (
          <div className="hint">No layers. Start from a preset, or Add text or a logo.</div>
        )}
      </Section>

      {sel && <LayerProps l={sel} setL={setL} logos={logos} importLogo={importLogo} onSuggest={suggest} />}

      <Section title="Pages" id="wm-pages" defaultOpen={pages.length > 1}>
        <Seg
          small
          value={wm.scope}
          onChange={(scope) => setWatermark((w) => ({ ...w, scope, pageIds: [] }), 'Watermark pages')}
          options={[
            { value: 'all', label: 'All pages', title: 'Every page, except the ones you untick' },
            { value: 'only', label: 'Chosen pages', title: 'Only the pages you tick' },
          ]}
        />
        <div className="check-list">
          {pages.map((p) => (
            <label key={p.id}>
              <input type="checkbox" checked={inScope(p.id)} onChange={() => togglePage(p.id)} />
              <span className="grow ellipsis">{p.name}</span>
              <small>
                {p.width}×{p.height}
              </small>
            </label>
          ))}
        </div>
        <div className="hint">{wmAppliesTo(wm, page.id) ? `“${page.name}” carries the watermark.` : `“${page.name}” is exported without it.`} New pages follow “{wm.scope === 'all' ? 'All pages' : 'Chosen pages'}”.</div>
      </Section>
    </div>
  );
}

function LayerProps({ l, setL, logos, importLogo, onSuggest }: { l: WatermarkLayer; setL: (p: Partial<WatermarkLayer>, key?: string) => void; logos: { id: string; name: string }[]; importLogo: (layer?: string) => void; onSuggest: () => void }) {
  const fonts = useDoc((d) => d.doc.fonts);
  const families = [...new Set([...fonts.map((f) => f.family), ...FONT_FAMILIES])];
  const pct = (v: number) => Math.round(v * 1000) / 10;
  const [tokens, setTokens] = useState(false);
  return (
    <>
      <Section title={l.kind === 'text' ? 'Text' : 'Logo'} id="wm-content">
        {l.kind === 'text' ? (
          <>
            <input className="input" value={l.text} onChange={(e) => setL({ text: e.target.value }, 'text')} onKeyDown={(e) => e.stopPropagation()} aria-label="Watermark text" />
            <div className="chips">
              {(tokens ? WM_TOKENS : WM_TOKENS.slice(0, 4)).map((t) => (
                <button key={t.token} className="chip mono" title={t.label} onClick={() => setL({ text: `${l.text}${l.text && !l.text.endsWith(' ') ? ' ' : ''}${t.token}` })}>
                  {t.token}
                </button>
              ))}
              {!tokens && (
                <button className="btn ghost sm" onClick={() => setTokens(true)}>
                  More
                </button>
              )}
            </div>
            <PropRow label="Font">
              <Select value={l.font} onChange={(font) => setL({ font })} options={families.map((f) => ({ value: f, label: f }))} />
            </PropRow>
            <PropRow label="Weight">
              <Seg small value={l.weight} onChange={(weight) => setL({ weight })} options={[{ value: 400, label: 'Regular' }, { value: 600, label: 'Semibold' }, { value: 800, label: 'Bold' }]} />
            </PropRow>
            <PropRow label="Colour">
              <ColorField value={l.color} onChange={(color) => setL({ color }, 'color')} />
            </PropRow>
            <PropRow label="Spacing">
              <Slider value={l.spacing} min={-0.05} max={0.5} step={0.01} scale={100} unit="%" onChange={(spacing) => setL({ spacing }, 'sp')} />
            </PropRow>
            <PropRow label="Outline">
              <Toggle checked={l.outline.enabled} onChange={(enabled) => setL({ outline: { ...l.outline, enabled } })} />
              {l.outline.enabled && <ColorField value={l.outline.color} onChange={(color) => setL({ outline: { ...l.outline, color } }, 'oc')} />}
            </PropRow>
          </>
        ) : (
          <>
            <PropRow label="Image">
              <Select value={l.assetId ?? ''} onChange={(assetId) => setL({ assetId })} options={[...(l.assetId && !logos.some((a) => a.id === l.assetId) ? [{ value: l.assetId, label: 'Missing logo — import again' }] : []), ...logos.map((a) => ({ value: a.id, label: a.name }))]} />
            </PropRow>
            <button className="btn sm" onClick={() => importLogo(l.id)}>
              <ImagePlus size={13} /> Import another logo…
            </button>
            <PropRow label="Recolour" title="Draw the logo in one colour (keeps its transparency)">
              <Toggle checked={!!l.tint} onChange={(on) => setL({ tint: on ? '#ffffff' : null })} />
              {l.tint && <ColorField value={l.tint} onChange={(tint) => setL({ tint }, 'tint')} />}
            </PropRow>
          </>
        )}
        <PropRow label="Shadow" title="A soft shadow so the mark reads on light and dark areas">
          <Toggle checked={l.shadow.enabled} onChange={(enabled) => setL({ shadow: { ...l.shadow, enabled } })} />
          {l.shadow.enabled && <Slider value={l.shadow.opacity} min={0.05} max={1} step={0.01} scale={100} unit="%" onChange={(opacity) => setL({ shadow: { ...l.shadow, opacity } }, 'sh')} />}
        </PropRow>
      </Section>

      <Section title="Placement" id="wm-place">
        <Seg
          small
          value={l.mode}
          onChange={(mode) => setL({ mode })}
          options={[
            { value: 'single', label: 'One mark', title: 'One mark at a position you choose' },
            { value: 'tile', label: 'Repeat', title: 'A pattern across the whole page' },
            { value: 'icon', label: 'Each icon', title: 'A small mark on every icon' },
          ]}
        />
        {l.mode !== 'tile' && (
          <div className="wm-anchor-row">
            <AnchorGrid value={l.anchor} onChange={(anchor) => setL({ anchor, dx: 0, dy: 0 })} />
            <div className="grow">
              {l.mode === 'single' ? (
                <>
                  <PropRow label="Margin">
                    <Slider value={l.margin} min={0} max={0.2} step={0.005} scale={100} unit="%" onChange={(margin) => setL({ margin }, 'mg')} />
                  </PropRow>
                  {(l.dx || l.dy) ? (
                    <button className="link-btn small" onClick={() => setL({ dx: 0, dy: 0 })}>
                      Snap back to the {l.anchor === 'mc' ? 'center' : 'anchor'}
                    </button>
                  ) : (
                    <div className="hint">Or drag it on the page.</div>
                  )}
                </>
              ) : (
                <PropRow label="Size on icon">
                  <Slider value={l.iconSize} min={0.08} max={0.8} step={0.01} scale={100} unit="%" onChange={(iconSize) => setL({ iconSize }, 'is')} />
                </PropRow>
              )}
            </div>
          </div>
        )}
        {l.mode === 'tile' && (
          <>
            <PropRow label="Angle">
              <Slider value={l.tile.angle} min={-90} max={90} unit="°" onChange={(angle) => setL({ tile: { ...l.tile, angle } }, 'ta')} />
            </PropRow>
            <PropRow label="Gap across">
              <Slider value={l.tile.gapX} min={0.2} max={6} step={0.05} decimals={2} onChange={(gapX) => setL({ tile: { ...l.tile, gapX } }, 'tx')} />
            </PropRow>
            <PropRow label="Gap down">
              <Slider value={l.tile.gapY} min={0.2} max={10} step={0.05} decimals={2} onChange={(gapY) => setL({ tile: { ...l.tile, gapY } }, 'ty')} />
            </PropRow>
            <PropRow label="Stagger rows">
              <Toggle checked={l.tile.stagger} onChange={(stagger) => setL({ tile: { ...l.tile, stagger } })} />
            </PropRow>
          </>
        )}
        {l.mode === 'single' && (
          <button className="btn sm" onClick={onSuggest} title="Find a corner or edge clear of the title, the focal region and icons, and a text colour that reads there. You can undo it">
            <Wand2 size={13} /> Suggest placement
          </button>
        )}
      </Section>

      <Section title="Size and look" id="wm-look">
        <PropRow label="Size" title="Height as a share of the page's shorter side — stays in proportion on every page size">
          <Slider value={l.size} min={0.005} max={0.5} step={0.001} scale={100} decimals={1} unit="%" onChange={(size) => setL({ size }, 'sz')} />
        </PropRow>
        <PropRow label="Opacity">
          <Slider value={l.opacity} min={0.02} max={1} step={0.01} scale={100} unit="%" onChange={(opacity) => setL({ opacity }, 'op')} />
        </PropRow>
        <PropRow label="Rotation">
          <Slider value={l.rotation} min={-180} max={180} unit="°" onChange={(rotation) => setL({ rotation }, 'rot')} />
        </PropRow>
        <div className="row">
          <button className="btn ghost sm" onClick={() => setL({ ...defaultLayer(l.kind), id: l.id, name: l.name, text: l.text, assetId: l.assetId })} title="Placement and look back to the defaults; the text or logo stays">
            <Sparkles size={13} /> Reset look
          </button>
          <span className="muted small grow" style={{ textAlign: 'right' }}>
            {pct(l.size)}% of the shorter side
          </span>
        </div>
      </Section>
    </>
  );
}

