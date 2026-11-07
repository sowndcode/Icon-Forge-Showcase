import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronRight, Info, XCircle, Layers as LayersIcon, Plus, PanelRightClose } from 'lucide-react';
import { analyzeComposition, type CompositionWarning } from '../../core/warnings';
import type { ExportSettings, Page, ProjectDoc } from '../../core/types';
import { markBox, wmAppliesTo } from '../../core/watermark';
import { visibleAABB } from '../../core/transform';
import { images } from '../../render/images';
import { watermarkMarks } from '../../render/renderer';
import { getWatermark, updateLayer, wmVars } from '../../state/watermark';
import { setStage } from '../../state/ui';
import { getAsset, useDoc, usePage } from '../../state/doc';
import { safeRect } from '../../layout/run';
import { usePrefs } from '../../state/prefs';
import { useUI, type InspectorTab } from '../../state/ui';
import { DesignInspector } from './Inspector';
import { ExportPanel } from './ExportPanel';
import { LayersPanel } from './LayersPanel';
import { LayoutPanel } from './LayoutPanel';
import { WatermarkPanel } from './WatermarkPanel';
import { groupSelection } from '../../state/objects';
import { selectionAABB } from '../../core/transform';
import { zoomToRect } from '../../state/ui';

export function RightPanel() {
  const tab = useUI((s) => s.inspectorTab);
  const stage = useUI((s) => s.stage);
  const layersH = usePrefs((s) => s.layersHeight);
  const [layersOpen, setLayersOpen] = useState(true);
  if (stage === 'review') return <WarningsPanel />;
  if (stage === 'watermark')
    return (
      <>
        <div className="panel-title">
          <h2>Watermark</h2>
          <span className="grow" />
          <button className="icon-btn" title="Hide panel" aria-label="Hide panel" onClick={() => usePrefs.getState().setPrefs({ rightCollapsed: true })}>
            <PanelRightClose size={16} />
          </button>
        </div>
        <div className="panel-body insp">
          <WatermarkPanel />
        </div>
      </>
    );
  const tabs: { id: InspectorTab; label: string }[] = [
    { id: 'design', label: 'Properties' },
    { id: 'arrange', label: 'Layout' },
    { id: 'export', label: 'Export' },
  ];
  return (
    <>
      <div className="panel-title">
        <div className="seg panel-tabs" role="tablist" aria-label="Inspector">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => useUI.setState({ inspectorTab: t.id })}>
              {t.label}
            </button>
          ))}
        </div>
        <button className="icon-btn" title="Hide inspector" aria-label="Hide inspector" onClick={() => usePrefs.getState().setPrefs({ rightCollapsed: true })}>
          <PanelRightClose size={16} />
        </button>
      </div>
      <div className="panel-body insp">
        {tab === 'design' && <DesignInspector />}
        {tab === 'arrange' && <LayoutPanel />}
        {tab === 'export' && <ExportPanel />}
      </div>
      {tab === 'design' && (
        <div className="layers" style={{ height: layersOpen ? layersH : 40 }}>
          {layersOpen && (
            <div
              className="hresizer"
              onPointerDown={(e) => {
                const y0 = e.clientY;
                const h0 = usePrefs.getState().layersHeight;
                const move = (ev: PointerEvent) => usePrefs.getState().setPrefs({ layersHeight: Math.max(100, Math.min(window.innerHeight - 300, h0 - (ev.clientY - y0))) });
                const up = () => {
                  window.removeEventListener('pointermove', move);
                  window.removeEventListener('pointerup', up);
                };
                window.addEventListener('pointermove', move);
                window.addEventListener('pointerup', up);
              }}
            />
          )}
          <div className="layers-head">
            <button className="btn ghost icon sm" onClick={() => setLayersOpen(!layersOpen)} title={layersOpen ? 'Collapse layers' : 'Expand layers'}>
              <ChevronRight size={13} style={{ transform: layersOpen ? 'rotate(90deg)' : undefined }} />
            </button>
            <LayersIcon size={14} /> <span className="grow">Layers</span>
            <button className="btn ghost sm" title="Group selection (Ctrl+G)" onClick={groupSelection}>
              <Plus size={14} /> Group
            </button>
          </div>
          {layersOpen && <LayersPanel />}
        </div>
      )}
    </>
  );
}

function WarningsPanel() {
  const page = usePage();
  const [ignored, setIgnored] = useState<string[]>([]);
  const doc = useDoc((d) => d.doc);
  const exportS = usePrefs((p) => p.exportSettings);
  const warnings = useMemo(() => [...analyzeComposition(page, getAsset, page.safeZone.enabled ? safeRect(page) : null), ...extraChecks(page, doc, exportS)], [page, doc, exportS]);
  const active = warnings.filter((w) => !ignored.includes(w.id));
  return (
    <>
      <div className="panel-title">
        <h2>Composition check</h2>
        <span className="grow" />
        <span className={`panel-count ${active.length ? 'warn' : 'ok'}`}>{active.length ? `${active.length} issue${active.length > 1 ? 's' : ''}` : 'All clear'}</span>
        <button className="icon-btn" title="Hide inspector" aria-label="Hide inspector" onClick={() => usePrefs.getState().setPrefs({ rightCollapsed: true })}>
          <PanelRightClose size={16} />
        </button>
      </div>
      <div className="panel-body">
        {!warnings.length && <div className="empty">No problems found. Looks ready to export.</div>}
        {warnings.map((w) => {
          const Icon = w.severity === 'error' ? XCircle : w.severity === 'warning' ? AlertTriangle : Info;
          const color = w.severity === 'error' ? 'var(--fail)' : w.severity === 'warning' ? 'var(--warn)' : 'var(--info)';
          const isIgnored = ignored.includes(w.id);
          return (
            <div
              key={w.id}
              className={`warn-item ${isIgnored ? 'ignored' : ''}`}
              title="Click to select the affected objects"
              onClick={() => {
                if (!w.objectIds.length) return;
                useUI.getState().setSelection(w.objectIds);
                const b = selectionAABB(page.objects.filter((o) => w.objectIds.includes(o.id)), getAsset);
                if (b && w.objectIds.length < 6) zoomToRect(b, 160);
              }}
            >
              <Icon size={15} style={{ color, flex: 'none', marginTop: 1 }} />
              <div className="grow">
                <div className="t">{w.title}</div>
                <div className="d">{w.detail}</div>
                {w.fix && (
                  <button className="btn sm warn-fix" onClick={(e) => (e.stopPropagation(), w.fix!.run())}>
                    {w.fix.label}
                  </button>
                )}
              </div>
              <button
                className="btn ghost sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setIgnored(isIgnored ? ignored.filter((x) => x !== w.id) : [...ignored, w.id]);
                }}
              >
                {isIgnored ? 'Restore' : 'Ignore'}
              </button>
            </div>
          );
        })}
        <div className="hint" style={{ padding: 12 }}>
          Warnings are hints, not rules — ignore anything that is intentional.
        </div>
      </div>
    </>
  );
}

/** Checks beyond the page itself: the watermark as exported and the export settings. */
function extraChecks(page: Page, doc: ProjectDoc, s: ExportSettings): CompositionWarning[] {
  const out: CompositionWarning[] = [];
  const wm = getWatermark(doc);
  if (wmAppliesTo(wm, page.id) && (s.watermark ?? 'project') !== 'none') {
    const ctx = document.createElement('canvas').getContext('2d')!;
    const marks = watermarkMarks(ctx, page, { watermark: wm, vars: wmVars(doc) }, getAsset, (id) => images.previews.get(id) ?? null);
    const S = Math.min(page.width, page.height);
    const edge = S * 0.012;
    const texts = page.objects.filter((o) => o.type === 'text' && !o.hidden).map((o) => visibleAABB(o));
    for (const { layer, marks: ms } of marks) {
      if (layer.mode !== 'single' || !ms.length) continue;
      const b = markBox(ms[0]);
      if (b.x < edge || b.y < edge || b.x + b.w > page.width - edge || b.y + b.h > page.height - edge)
        out.push({ id: 'wm-edge-' + layer.id, severity: 'warning', title: `Watermark “${layer.name}” at the very edge`, detail: 'Store pages and social sites often crop the edges, which would cut it off.', objectIds: [], fix: { label: 'Move it inward', run: () => updateLayer(layer.id, { margin: Math.max(layer.margin, 0.035), dx: 0, dy: 0 }) } });
      const hit = texts.some((t) => Math.min(b.x + b.w, t.x + t.w) - Math.max(b.x, t.x) > 0 && Math.min(b.y + b.h, t.y + t.h) - Math.max(b.y, t.y) > 0);
      if (hit) out.push({ id: 'wm-text-' + layer.id, severity: 'info', title: `Watermark “${layer.name}” covers text`, detail: 'It sits on a title or label of this page.', objectIds: [], fix: { label: 'Open Watermark', run: () => (useUI.setState({ wmSel: layer.id }), setStage('watermark')) } });
    }
    if (wm.layers.some((l) => l.visible && l.kind === 'image' && (!l.assetId || !getAsset(l.assetId) || getAsset(l.assetId)!.status === 'missing')))
      out.push({ id: 'wm-logo', severity: 'error', title: 'Watermark logo missing', detail: 'A logo layer has no image, so it is left out of the export. Import the logo again in Watermark.', objectIds: [], fix: { label: 'Open Watermark', run: () => setStage('watermark') } });
  }
  const hasAlpha = page.background.type === 'transparent' || (page.background.type === 'image' && page.background.image.opacity < 1);
  if (s.format === 'jpeg' && (s.transparent || hasAlpha))
    out.push({ id: 'export-jpg-alpha', severity: 'info', title: 'JPG has no transparency', detail: `Transparent areas of this page export filled with the matte colour ${s.matte}. Choose PNG or WebP to keep them.`, objectIds: [], fix: { label: 'Use PNG', run: () => usePrefs.getState().setPrefs({ exportSettings: { ...usePrefs.getState().exportSettings, format: 'png' } }) } });
  return out;
}
