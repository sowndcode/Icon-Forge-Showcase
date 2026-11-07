// Pick assets from a saved project, to reuse them in a new project or add them to the open one.
// The source project is only read: its files are copied under new ids when the user confirms.

import { useEffect, useMemo, useState } from 'react';
import { ImageOff, Search } from 'lucide-react';
import type { AssetRecord, ProjectMeta } from '../../core/types';
import { importAssetsFromProject, readProjectLibrary, type ProjectLibrary } from '../../state/project';
import { thumbState, watchThumb, type ThumbState } from '../components/storedThumbs';
import { VirtualGrid } from '../components/VirtualGrid';
import { toast } from '../../state/ui';
import { useDoc } from '../../state/doc';
import { Modal, Select } from '../components/controls';
import { categoryColor } from '../components/categoryColors';
import { useProjectList } from './ProjectDialogs';

export interface AssetPick {
  projectId: string;
  ids: string[];
}

/**
 * A thumbnail read from storage while the tile is on screen, decoded at tile size. Loading, a file
 * that is gone and a file that cannot be decoded each look different.
 */
export function StoredThumb({ id, w, h }: { id: string; w?: number; h?: number }) {
  const [s, setS] = useState<ThumbState>(() => thumbState(id));
  useEffect(() => {
    setS(thumbState(id));
    return watchThumb(id, w, h, setS);
  }, [id, w, h]);
  return (
    <div className={`pap-img checker ${s.status}`}>
      {s.status === 'ready' ? (
        <img src={s.url} alt="" decoding="async" draggable={false} />
      ) : s.status === 'missing' ? (
        <span className="pap-state" title="The original file is no longer in the app's storage">
          <ImageOff size={16} />
          Missing
        </span>
      ) : s.status === 'error' ? (
        <span className="pap-state" title="The file could not be read as an image">
          <ImageOff size={16} />
          Unreadable
        </span>
      ) : (
        <span className="pap-loading" aria-label="Loading" />
      )}
    </div>
  );
}

const KINDS: { kind: AssetRecord['kind']; label: string }[] = [
  { kind: 'asset', label: 'Icons' },
  { kind: 'background', label: 'Backgrounds' },
  { kind: 'element', label: 'Elements' },
];

/**
 * Project list + asset grid with selection. `exclude` hides a project (the open one, when adding
 * to it). Starts with every icon of the chosen project selected.
 */
export function ProjectAssetPicker({ value, onChange, exclude }: { value: AssetPick | null; onChange: (v: AssetPick | null) => void; exclude?: string }) {
  const { list } = useProjectList();
  const currentId = useDoc((s) => s.doc.id);
  const projects = useMemo(() => (list ?? []).filter((p) => p.id !== exclude && p.assets > 0), [list, exclude]);
  const [lib, setLib] = useState<ProjectLibrary | null>(null);
  const [loading, setLoading] = useState(false);
  const [kind, setKind] = useState<AssetRecord['kind']>('asset');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const pid = value?.projectId ?? '';

  // first project with assets, preferring the open one
  useEffect(() => {
    if (value || !projects.length) return;
    const first = projects.find((p) => p.id === currentId) ?? projects[0];
    void choose(first.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects.length]);

  async function choose(id: string) {
    setLoading(true);
    setCat(null);
    setQ('');
    const l = await readProjectLibrary(id).catch(() => undefined);
    setLoading(false);
    setLib(l ?? null);
    onChange(l ? { projectId: id, ids: l.assets.filter((a) => a.kind === 'asset' && a.status !== 'error').map((a) => a.id) } : null);
  }

  const usable = useMemo(() => (lib ? lib.assets.filter((a) => a.status !== 'error') : []), [lib]);
  const ofKind = usable.filter((a) => a.kind === kind);
  const cats = useMemo(() => [...new Set(ofKind.map((a) => a.category))].sort(), [ofKind]);
  const needle = q.trim().toLowerCase();
  const shown = ofKind.filter((a) => (!cat || a.category === cat) && (!needle || a.name.toLowerCase().includes(needle)));
  const picked = new Set(value?.ids ?? []);
  const set = (ids: Set<string>) => value && onChange({ ...value, ids: [...ids] });
  const toggle = (id: string) => {
    const n = new Set(picked);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    set(n);
  };
  const all = () => set(new Set([...picked, ...shown.map((a) => a.id)]));
  const invert = () => {
    const n = new Set(picked);
    for (const a of shown) if (n.has(a.id)) n.delete(a.id);
    else n.add(a.id);
    set(n);
  };
  const none = () => {
    const drop = new Set(shown.map((a) => a.id));
    set(new Set([...picked].filter((id) => !drop.has(id))));
  };

  if (list && !projects.length) return <div className="pap-empty">No saved project has assets yet. Start empty and import a folder after creating the project.</div>;
  return (
    <div className="pap">
      <div className="pap-bar">
        <Select<string>
          className="pap-project"
          value={pid}
          onChange={(id) => void choose(id)}
          options={projects.map((p: ProjectMeta) => ({ value: p.id, label: `${p.name}${p.id === currentId ? ' (open)' : ''} · ${p.assets} assets` }))}
        />
        <div className="search">
          <Search size={13} />
          <input className="input sm" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
        </div>
      </div>
      <div className="pap-bar">
        <div className="chips">
          {KINDS.map((k) => {
            const n = usable.filter((a) => a.kind === k.kind).length;
            return n ? (
              <button key={k.kind} className={`chip ${kind === k.kind ? 'on' : ''}`} onClick={() => (setKind(k.kind), setCat(null))}>
                {k.label} <small>{n}</small>
              </button>
            ) : null;
          })}
          {cats.length > 1 &&
            cats.map((c, i) => (
              <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(cat === c ? null : c)}>
                <span className="cat-dot" style={{ background: categoryColor(i) }} />
                {c || 'Uncategorized'}
              </button>
            ))}
        </div>
        <span className="grow" />
        <button className="btn ghost sm" onClick={all} disabled={!shown.length}>
          Select all
        </button>
        <button className="btn ghost sm" onClick={none} disabled={!shown.length}>
          Select none
        </button>
        <button className="btn ghost sm" onClick={invert} disabled={!shown.length} title="Select the shown assets that are not selected, and the other way round">
          Invert
        </button>
        <span className="muted small pap-count">
          {picked.size} selected
        </span>
      </div>
      {loading ? (
        <div className="pap-empty">Reading the project…</div>
      ) : (
        <VirtualGrid
          className="pap-grid"
          label="Assets to reuse"
          items={shown}
          render={(a) => (
            <button role="option" aria-selected={picked.has(a.id)} className={`pap-tile ${picked.has(a.id) ? 'on' : ''}`} onClick={() => toggle(a.id)} title={`${a.name} · ${a.width}×${a.height}`}>
              <StoredThumb id={a.id} w={a.width} h={a.height} />
              <span className="pap-name">{a.name}</span>
              <input type="checkbox" tabIndex={-1} readOnly checked={picked.has(a.id)} aria-hidden />
            </button>
          )}
          empty={<div className="pap-empty">Nothing matches.</div>}
        />
      )}
    </div>
  );
}

/** Add assets from another saved project to the open one (Import ▸ From a project). */
export function AddFromProjectDialog({ onClose }: { onClose: () => void }) {
  const current = useDoc((s) => s.doc.id);
  const [pick, setPick] = useState<AssetPick | null>(null);
  const [busy, setBusy] = useState(false);
  const n = pick?.ids.length ?? 0;
  const add = async () => {
    if (!pick || !n) return;
    setBusy(true);
    try {
      const added = await importAssetsFromProject(pick.projectId, pick.ids);
      toast(added ? `Added ${added} asset${added === 1 ? '' : 's'}. The other project is unchanged.` : 'Nothing was added — the files could not be read', added ? 'success' : 'warning');
      onClose();
    } catch (e) {
      toast('Could not add the assets: ' + (e instanceof Error ? e.message : String(e)), 'error');
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Add assets from a project"
      onClose={onClose}
      width={880}
      footer={
        <>
          <span className="muted small grow">Files are copied into this project. The other project does not change.</span>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!n || busy} onClick={() => void add()}>
            {busy ? 'Adding…' : `Add ${n} asset${n === 1 ? '' : 's'}`}
          </button>
        </>
      }
    >
      <div className="pap-dialog">
        <ProjectAssetPicker value={pick} onChange={setPick} exclude={current} />
      </div>
    </Modal>
  );
}
