// Layers: top-most first, groups collapsible, drag to reorder, rename, hide, lock.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Eye, EyeOff, Folder, Image as ImageIcon, Layers, Lock, Search, Shapes, Type, Unlock } from 'lucide-react';
import type { GroupInfo, SceneObject } from '../../core/types';
import { images } from '../../render/images';
import { usePage } from '../../state/doc';
import { expandGroups, moveLayers, patchObjects, renameGroup, setGroupFlag, setObjectsFlag, toggleGroupCollapsed } from '../../state/objects';
import { useUI } from '../../state/ui';
import { openObjectMenu } from '../menus';

type Row = { kind: 'group'; g: GroupInfo; members: SceneObject[] } | { kind: 'obj'; o: SceneObject; indent: boolean };

const ROW_H = 26;

export function LayersPanel() {
  const page = usePage();
  const sel = useUI((s) => s.selection);
  const selSet = useMemo(() => new Set(sel), [sel]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; above: boolean } | null>(null);
  const [scroll, setScroll] = useState({ top: 0, h: 200 });
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | SceneObject['type']>('all');
  const listRef = useRef<HTMLDivElement>(null);
  const anchor = useRef<string | null>(null);
  const dragIds = useRef<string[] | null>(null);

  useEffect(() => {
    const el = listRef.current!;
    const ro = new ResizeObserver(() => setScroll((s) => ({ ...s, h: el.clientHeight })));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const q = query.trim().toLowerCase();
  const filtering = !!q || kind !== 'all';
  const rows = useMemo(() => {
    const out: Row[] = [];
    // filtered: a flat list of matching objects, top-most first (groups would hide matches)
    if (filtering) {
      for (let i = page.objects.length - 1; i >= 0; i--) {
        const o = page.objects[i];
        if ((kind === 'all' || o.type === kind) && (!q || o.name.toLowerCase().includes(q))) out.push({ kind: 'obj', o, indent: false });
      }
      return out;
    }
    const seenGroups = new Set<string>();
    const groups = new Map(page.groups.map((g) => [g.id, g]));
    for (let i = page.objects.length - 1; i >= 0; i--) {
      const o = page.objects[i];
      if (o.groupId && groups.has(o.groupId)) {
        if (seenGroups.has(o.groupId)) continue;
        seenGroups.add(o.groupId);
        const g = groups.get(o.groupId)!;
        const members = page.objects.filter((x) => x.groupId === g.id).reverse();
        out.push({ kind: 'group', g, members });
        if (!g.collapsed) for (const m of members) out.push({ kind: 'obj', o: m, indent: true });
      } else out.push({ kind: 'obj', o, indent: false });
    }
    return out;
  }, [page.objects, page.groups, filtering, q, kind]);

  const flatIds = useMemo(() => rows.filter((r): r is Extract<Row, { kind: 'obj' }> => r.kind === 'obj').map((r) => r.o.id), [rows]);

  // keep the selected layer visible when selecting on canvas
  useEffect(() => {
    if (sel.length !== 1) return;
    const idx = rows.findIndex((r) => r.kind === 'obj' && r.o.id === sel[0]);
    const el = listRef.current;
    if (idx < 0 || !el) return;
    const y = idx * ROW_H;
    if (y < el.scrollTop || y > el.scrollTop + el.clientHeight - ROW_H) el.scrollTop = y - el.clientHeight / 2;
  }, [sel, rows]);

  const clickObj = (e: React.MouseEvent, o: SceneObject) => {
    const ui = useUI.getState();
    if (e.shiftKey && anchor.current) {
      const a = flatIds.indexOf(anchor.current),
        b = flatIds.indexOf(o.id);
      if (a >= 0 && b >= 0) return ui.setSelection(flatIds.slice(Math.min(a, b), Math.max(a, b) + 1));
    }
    anchor.current = o.id;
    if (e.ctrlKey || e.metaKey) ui.setSelection(selSet.has(o.id) ? sel.filter((x) => x !== o.id) : [...sel, o.id]);
    else ui.setSelection([o.id]);
    if (o.layoutId) useUI.setState({ activeLayoutId: o.layoutId });
  };

  const first = Math.max(0, Math.floor(scroll.top / ROW_H) - 4);
  const last = Math.min(rows.length, Math.ceil((scroll.top + scroll.h) / ROW_H) + 4);
  const items = [];
  for (let i = first; i < last; i++) {
    const r = rows[i];
    const top = i * ROW_H;
    if (r.kind === 'group') {
      const allSel = r.members.every((m) => selSet.has(m.id));
      const hidden = r.members.every((m) => m.hidden);
      const locked = r.members.every((m) => m.locked);
      items.push(
        <div
          key={'g' + r.g.id}
          className={`layer group ${allSel ? 'sel' : ''} ${hidden ? 'hidden' : ''}`}
          style={{ top }}
          onClick={(e) => (e.ctrlKey ? useUI.getState().setSelection([...new Set([...sel, ...r.members.map((m) => m.id)])]) : useUI.getState().setSelection(r.members.map((m) => m.id)))}
          onDoubleClick={() => setRenaming(r.g.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            useUI.getState().setSelection(r.members.map((m) => m.id));
            openObjectMenu(e.clientX, e.clientY);
          }}
        >
          <ChevronRight
            size={13}
            className={`chev ${r.g.collapsed ? '' : 'open'}`}
            onClick={(e) => {
              e.stopPropagation();
              toggleGroupCollapsed(r.g.id);
            }}
          />
          <span className="thumb">
            <Folder size={13} />
          </span>
          <span className="nm">
            {renaming === r.g.id ? (
              <RenameInput value={r.g.name} onDone={(v) => { if (v) renameGroup(r.g.id, v); setRenaming(null); }} />
            ) : (
              <>
                {r.g.name} <span className="muted small">({r.members.length})</span>
              </>
            )}
          </span>
          <button className={`lb ${hidden ? 'on' : ''}`} title={hidden ? 'Show group' : 'Hide group'} onClick={(e) => { e.stopPropagation(); setGroupFlag(r.g.id, { hidden: !hidden }); }}>
            {hidden ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
          <button className={`lb ${locked ? 'on' : ''}`} title={locked ? 'Unlock group' : 'Lock group'} onClick={(e) => { e.stopPropagation(); setGroupFlag(r.g.id, { locked: !locked }); }}>
            {locked ? <Lock size={13} /> : <Unlock size={13} />}
          </button>
        </div>,
      );
      continue;
    }
    const o = r.o;
    const dropCls = drop?.id === o.id ? (drop.above ? 'drop-above' : 'drop-below') : '';
    items.push(
      <div
        key={o.id}
        className={`layer ${selSet.has(o.id) ? 'sel' : ''} ${o.hidden ? 'hidden' : ''} ${dropCls}`}
        style={{ top, paddingLeft: r.indent ? 24 : 6 }}
        onClick={(e) => clickObj(e, o)}
        onDoubleClick={() => setRenaming(o.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          if (!selSet.has(o.id)) useUI.getState().setSelection([o.id]);
          openObjectMenu(e.clientX, e.clientY);
        }}
        draggable={renaming !== o.id && !filtering}
        onDragStart={(e) => {
          dragIds.current = selSet.has(o.id) ? flatIds.filter((id) => selSet.has(id)) : [o.id];
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/x-layer', o.id);
        }}
        onDragOver={(e) => {
          if (!dragIds.current) return;
          e.preventDefault();
          const rr = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setDrop({ id: o.id, above: e.clientY < rr.top + rr.height / 2 });
        }}
        onDragLeave={() => setDrop(null)}
        onDrop={(e) => {
          e.preventDefault();
          const ids = dragIds.current;
          dragIds.current = null;
          if (ids && drop && !ids.includes(drop.id)) moveLayers(ids.slice().reverse(), drop.id, drop.above);
          setDrop(null);
        }}
        onDragEnd={() => {
          dragIds.current = null;
          setDrop(null);
        }}
      >
        <span className="thumb checker">
          {o.type === 'image' ? images.thumbs.get(o.assetId) ? <img src={images.thumbs.get(o.assetId)} alt="" /> : <ImageIcon size={12} /> : o.type === 'text' ? <Type size={12} /> : <Shapes size={12} />}
        </span>
        <span className="nm">{renaming === o.id ? <RenameInput value={o.name} onDone={(v) => { if (v) patchObjects({ [o.id]: { name: v } }, 'Rename'); setRenaming(null); }} /> : o.name}</span>
        {o.layoutId && <span className={`flag ${o.pinned ? 'pinned' : 'layout'}`} title={o.pinned ? 'Pinned in layout' : 'Layout controlled'} />}
        <button className={`lb ${o.hidden ? 'on' : ''}`} title={o.hidden ? 'Show' : 'Hide'} onClick={(e) => { e.stopPropagation(); setObjectsFlag([o.id], { hidden: !o.hidden }, o.hidden ? 'Show' : 'Hide'); }}>
          {o.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
        <button className={`lb ${o.locked ? 'on' : ''}`} title={o.locked ? 'Unlock' : 'Lock'} onClick={(e) => { e.stopPropagation(); setObjectsFlag([o.id], { locked: !o.locked }, o.locked ? 'Unlock' : 'Lock'); }}>
          {o.locked ? <Lock size={13} /> : <Unlock size={13} />}
        </button>
      </div>,
    );
  }
  const kinds: { id: typeof kind; label: string; icon?: typeof Type }[] = [
    { id: 'all', label: 'All' },
    { id: 'image', label: 'Images', icon: ImageIcon },
    { id: 'text', label: 'Text', icon: Type },
    { id: 'shape', label: 'Shapes', icon: Shapes },
  ];
  return (
    <>
      {page.objects.length > 0 && (
        <div className="layer-filter">
          <span className="search">
            <Search size={12} />
            <input className="input sm" value={query} placeholder="Find layers" aria-label="Find layers by name" onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') setQuery(''); }} />
          </span>
          {kinds.map((k) => (
            <button key={k.id} className={`btn ghost icon sm ${kind === k.id ? 'active' : ''}`} title={k.label} aria-label={`Show ${k.label.toLowerCase()}`} aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>
              {k.icon ? <k.icon size={13} /> : <Layers size={13} />}
            </button>
          ))}
          {filtering && rows.length > 0 && (
            <button className="btn ghost sm" title="Select every layer in this list" onClick={() => useUI.getState().setSelection(rows.flatMap((r) => (r.kind === 'obj' && !r.o.locked ? [r.o.id] : [])))}>
              Select {rows.length}
            </button>
          )}
        </div>
      )}
      <div ref={listRef} className="layer-list" onScroll={(e) => setScroll((s) => ({ ...s, top: (e.target as HTMLElement).scrollTop }))} onClick={(e) => e.target === e.currentTarget && useUI.getState().setSelection([])}>
        <div style={{ height: rows.length * ROW_H, position: 'relative' }}>{items}</div>
        {!rows.length && <div className="empty" style={{ padding: 12 }}>{filtering ? 'No matching layers' : 'No layers yet'}</div>}
      </div>
    </>
  );
}

function RenameInput({ value, onDone }: { value: string; onDone: (v: string) => void }) {
  return (
    <input
      autoFocus
      defaultValue={value}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') onDone('');
      }}
      onBlur={(e) => onDone(e.target.value.trim())}
    />
  );
}

export { expandGroups };
