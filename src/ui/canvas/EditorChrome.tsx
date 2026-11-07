// Editor chrome: the floating tool dock at the bottom of the canvas and the options bar above it
// (page info or active layout, overlay toggles, zoom).

import { Circle, Crosshair, Frame, Grid3x3, Hand, Magnet, Maximize, Minus, MousePointer2, Plus, Ruler, Shapes, Slash, Square, Type, LayoutGrid, Focus, SlidersHorizontal, Dices, X, ScanSearch, RefreshCw } from 'lucide-react';
import { selectionAABB } from '../../core/transform';
import { getAlgorithm } from '../../layout/registry';
import { getAsset, getPage, usePage } from '../../state/doc';
import { randomizeLayout, reapplyLayout } from '../../state/layoutActions';
import { selectedObjects } from '../../state/objects';
import { usePrefs } from '../../state/prefs';
import { fitView, setStage, useUI, useViewport, zoomTo, zoomToRect, type Tool } from '../../state/ui';
import { openMenu } from '../menus';
import { useEffect, useRef, useState } from 'react';
import { addShape } from '../../state/placement';
import { SHAPE_BUTTONS } from '../shapeIcons';

const TOOLS: { id: Tool; icon: typeof Hand; label: string; key: string }[] = [
  { id: 'select', icon: MousePointer2, label: 'Select / move', key: 'V' },
  { id: 'hand', icon: Hand, label: 'Hand (pan)', key: 'H · or hold Space' },
  { id: 'text', icon: Type, label: 'Text', key: 'T' },
  { id: 'rect', icon: Square, label: 'Rectangle', key: 'R' },
  { id: 'ellipse', icon: Circle, label: 'Ellipse', key: 'E' },
  { id: 'line', icon: Slash, label: 'Line', key: 'L' },
  { id: 'focal', icon: Focus, label: 'Focal safe region — drag to draw', key: 'F' },
];

export function ToolDock() {
  const tool = useUI((s) => s.tool);
  const snap = usePrefs((s) => s.snap);
  const setSnap = usePrefs((s) => s.setSnap);
  return (
    <div className="tool-dock" role="toolbar" aria-label="Tools">
      {TOOLS.map((t, i) => (
        <span key={t.id} className="dock-slot">
          {i === 2 && <span className="dock-sep" />}
          <button className={`dock-btn ${tool === t.id ? 'on' : ''}`} title={`${t.label} (${t.key})`} aria-label={t.label} aria-pressed={tool === t.id} onClick={() => useUI.setState({ tool: tool === t.id ? 'select' : t.id })}>
            <t.icon size={16} strokeWidth={1.75} />
          </button>
        </span>
      ))}
      <ShapesButton />
      <span className="dock-sep" />
      <button className={`dock-btn toggle ${snap.enabled ? 'on' : ''}`} title="Snapping (hold Ctrl while dragging to bypass)" aria-label="Snapping" aria-pressed={snap.enabled} onClick={() => setSnap({ enabled: !snap.enabled })}>
        <Magnet size={16} strokeWidth={1.75} />
      </button>
    </div>
  );
}

/** Tool-rail button with a small flyout of every shape; picking one adds it to the page. */
function ShapesButton() {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', away, true);
      window.removeEventListener('keydown', key);
    };
  }, [open]);
  return (
    <div className="rail-pop-wrap" ref={ref}>
      <button
        ref={btn}
        className={`dock-btn ${open ? 'on' : ''}`}
        title="More shapes"
        aria-label="More shapes"
        aria-expanded={open}
        onClick={() => {
          // fixed position above the button, so the editor's clipping never cuts the menu off
          const r = btn.current?.getBoundingClientRect();
          if (r) setPos({ left: Math.max(8, Math.min(r.left + r.width / 2 - 124, window.innerWidth - 256)), top: Math.max(8, r.top - 8 - 196) });
          setOpen(!open);
        }}
      >
        <Shapes size={16} strokeWidth={1.75} />
      </button>
      {open && (
        <div className="rail-pop" role="menu" aria-label="Shapes" style={pos}>
          <div className="rail-pop-title">Shapes</div>
          <div className="rail-pop-grid">
            {SHAPE_BUTTONS.map((b) => (
              <button
                key={b.kind}
                className="rail-pop-btn"
                role="menuitem"
                title={`Add ${b.label.toLowerCase()}`}
                aria-label={b.label}
                onClick={() => {
                  addShape(b.kind);
                  useUI.setState({ tool: 'select' });
                  setOpen(false);
                }}
              >
                <svg viewBox="0 0 24 24" width="20" height="20">
                  <path d={b.icon} fillRule="evenodd" fill={b.stroke ? 'none' : 'currentColor'} stroke={b.stroke ? 'currentColor' : 'none'} strokeWidth={2} strokeLinecap="round" />
                </svg>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function OptionsBar() {
  const zoom = useViewport((s) => s.zoom);
  const ov = usePrefs((s) => s.overlays);
  const snap = usePrefs((s) => s.snap);
  const setOverlay = usePrefs((s) => s.setOverlay);
  const setSnap = usePrefs((s) => s.setSnap);
  const page = usePage();
  const activeId = useUI((s) => s.activeLayoutId);
  const inst = page.layouts.find((l) => l.id === activeId);
  const toggle = (on: boolean, title: string, onClick: () => void, Icon: typeof Ruler) => (
    <button className={`opt-btn ov ${on ? 'on' : ''}`} title={title} aria-label={title} aria-pressed={on} onClick={onClick}>
      <Icon size={14} />
    </button>
  );
  return (
    <div className="options-bar">
      {inst ? (
        <div className="opt-group">
          <span className="opt-label">Layout</span>
          <b className="opt-title layout-name">{getAlgorithm(inst.algorithm).label}</b>
          <span className="opt-dims">{inst.objectIds.length} objects</span>
          <span className="opt-sep" />
          <button className="opt-text" title="Open layout settings" onClick={() => setStage('arrange')}>
            <SlidersHorizontal size={13} /> Settings
          </button>
          {getAlgorithm(inst.algorithm).random && (
            <button className="opt-text" title="New random arrangement (Ctrl+R)" onClick={() => randomizeLayout(inst.id)}>
              <Dices size={13} /> Shuffle
            </button>
          )}
          <button className="opt-text" title="Re-run the layout (pinned objects stay)" onClick={() => reapplyLayout(inst.id)}>
            <RefreshCw size={13} /> Reapply
          </button>
          <button className="opt-btn" title="Hide layout guides" aria-label="Hide layout guides" onClick={() => useUI.setState({ activeLayoutId: null })}>
            <X size={13} />
          </button>
        </div>
      ) : (
        <div className="opt-group">
          <b className="opt-title">{page.name || 'Untitled page'}</b>
          <span className="opt-dims">
            {page.width} × {page.height}
          </span>
        </div>
      )}
      <span className="grow" />
      <div className="opt-group">
        {toggle(ov.rulers, 'Rulers (drag from a ruler to create a guide)', () => setOverlay({ rulers: !ov.rulers }), Ruler)}
        {toggle(ov.thirds, 'Rule of thirds', () => setOverlay({ thirds: !ov.thirds }), Grid3x3)}
        {toggle(ov.compGrid, 'Composition grid', () => setOverlay({ compGrid: !ov.compGrid }), LayoutGrid)}
        {toggle(ov.center, 'Center lines', () => setOverlay({ center: !ov.center }), Crosshair)}
        {toggle(ov.safe, 'Safe zone', () => setOverlay({ safe: !ov.safe }), Frame)}
        {toggle(ov.perspective, 'Layout guides (perspective plane, path, safe zone)', () => setOverlay({ perspective: !ov.perspective }), Shapes)}
        {toggle(ov.focal, 'Focal region', () => setOverlay({ focal: !ov.focal }), Focus)}
        <button
          className="opt-btn"
          title="More view and snapping options"
          aria-label="More view options"
          onClick={(e) =>
            openMenu(e.clientX - 200, e.clientY + 12, [
              { label: `Pixel grid (zoom ≥ 800%)`, checked: ov.pixelGrid, onClick: () => setOverlay({ pixelGrid: !ov.pixelGrid }) },
              { label: `Composition grid: ${ov.compDivs} divisions`, checked: false, onClick: () => setOverlay({ compDivs: ov.compDivs >= 12 ? 4 : ov.compDivs + 2 }) },
              { separator: true },
              { label: `Snap to canvas`, checked: snap.canvas, onClick: () => setSnap({ canvas: !snap.canvas }) },
              { label: `Snap to objects`, checked: snap.objects, onClick: () => setSnap({ objects: !snap.objects }) },
              { label: `Snap to guides`, checked: snap.guides, onClick: () => setSnap({ guides: !snap.guides }) },
              { label: `Snap to grid (${snap.gridSize}px)`, checked: snap.grid, onClick: () => setSnap({ grid: !snap.grid }) },
            ])
          }
        >
          <SlidersHorizontal size={14} />
        </button>
      </div>
      <span className="opt-sep" />
      <div className="opt-group zoom-group">
        <button className="opt-btn" title="Zoom out (-)" aria-label="Zoom out" onClick={() => zoomTo(zoom / 1.25)}>
          <Minus size={14} />
        </button>
        <button className="zoom-value" title="Zoom to 100% (1)" onClick={() => zoomTo(1)}>
          {Math.round(zoom * 100)}%
        </button>
        <button className="opt-btn" title="Zoom in (+)" aria-label="Zoom in" onClick={() => zoomTo(zoom * 1.25)}>
          <Plus size={14} />
        </button>
        <button
          className="opt-btn"
          title="Fit page in window (0)"
          aria-label="Fit page"
          onClick={() => {
            const p = getPage();
            fitView(p.width, p.height);
          }}
        >
          <Maximize size={14} />
        </button>
        <button
          className="opt-btn"
          title="Zoom to selection (2)"
          aria-label="Zoom to selection"
          onClick={() => {
            const b = selectionAABB(selectedObjects(), getAsset);
            if (b) zoomToRect(b);
          }}
        >
          <ScanSearch size={14} />
        </button>
      </div>
    </div>
  );
}
