// Project management UI: the New Project dialog (preset browser + details) and the project grid
// used on Home and in the Projects dialog.

import { useEffect, useMemo, useRef, useState } from 'react';
import { FileDown, FilePlus2, FolderOpen, MoreHorizontal, ImageOff, Pin, Search, Trash2 } from 'lucide-react';
import { BACKGROUND_PRESETS, CANVAS_GROUPS, CANVAS_PRESETS, defaultBackground, presetName } from '../../core/defaults';
import { THEMES } from '../../core/themes';
import { matchedThemes } from '../../core/palette';
import { usePalette } from '../components/usePalette';
import type { Background, ProjectMeta } from '../../core/types';
import { useDoc } from '../../state/doc';
import { BUILTIN_TEMPLATES, libraryAssets, previewTemplate } from '../../state/generators';
import { PagePreview } from '../components/PagePreview';
import { resolveTheme } from '../../state/templateOptions';
import { closeProject, createNewProject, deletedToast, deleteLabel, deleteManyNote, deleteOneNote, deleteStoredProject, deleteStoredProjects, duplicateStoredProject, exportProjectFile, listProjects, openProjectViaDialog, openStoredProject, renameStoredProject } from '../../state/project';
import { openDialog, setStage, toast, useUI } from '../../state/ui';
import { usePrefs } from '../../state/prefs';
import { BgThumb } from '../components/BgThumb';
import { Modal, NumberField, PropRow, Select } from '../components/controls';
import { openMenu } from '../menus';
import { openProjectPicker } from '../App';
import { askConfirm } from '../components/ask';
import { ProjectAssetPicker, type AssetPick } from './ProjectAssetPicker';

// ---------------------------------------------------------------------------
// New project
// ---------------------------------------------------------------------------

type Choice = { kind: 'template'; id: string } | { kind: 'blank'; w: number; h: number; label: string };

const BG_CHOICES = ['Charcoal', 'Slate', 'Studio white', 'Midnight blue', 'Spotlight', 'Hero rays', 'Aurora', 'Transparent'];

export function NewProjectDialog({ onClose, initialTemplate }: { onClose: () => void; initialTemplate?: string }) {
  // initialTemplate: a template id, 'templates' for the template list, 'size:<label>' for one blank size,
  // or nothing / 'blank' for the blank sizes
  const startSize = initialTemplate?.startsWith('size:') ? CANVAS_PRESETS.find((p) => p.label === initialTemplate.slice(5)) : undefined;
  const isTemplate = !!initialTemplate && (initialTemplate === 'templates' || BUILTIN_TEMPLATES.some((t) => t.id === initialTemplate));
  const [tab, setTab] = useState<'templates' | 'blank'>(isTemplate ? 'templates' : 'blank');
  const [choice, setChoice] = useState<Choice>(() =>
    isTemplate
      ? { kind: 'template', id: initialTemplate === 'templates' ? BUILTIN_TEMPLATES[0].id : initialTemplate! }
      : { kind: 'blank', w: startSize?.w ?? 1920, h: startSize?.h ?? 1080, label: startSize?.label ?? 'Full HD 1920×1080' },
  );
  const [query, setQuery] = useState('');
  const tpl = choice.kind === 'template' ? BUILTIN_TEMPLATES.find((t) => t.id === choice.id) : undefined;
  const [name, setName] = useState('');
  const [size, setSize] = useState({ w: startSize?.w ?? 1920, h: startSize?.h ?? 1080 });
  const bgs = useMemo(() => BG_CHOICES.map((n) => BACKGROUND_PRESETS.find((p) => p.name === n)!).filter(Boolean).map((p) => ({ name: p.name, bg: p.bg() })), []);
  const [bgName, setBgName] = useState('Charcoal');
  // every new project starts with an empty library unless assets are explicitly picked for reuse
  const [assetMode, setAssetMode] = useState<'empty' | 'reuse'>('empty');
  const [pick, setPick] = useState<AssetPick | null>(null);
  const reuse = assetMode === 'reuse' && pick && pick.ids.length ? { projectId: pick.projectId, assetIds: pick.ids } : undefined;
  const [busy, setBusy] = useState(false);
  // templates start at their own size; changing it rebuilds the template for the new format
  const [tplSize, setTplSize] = useState<{ w: number; h: number } | null>(null);
  const [look, setLook] = useState('auto');
  const palette = usePalette();
  const looks = useMemo(() => [...(palette ? matchedThemes(palette) : []), ...THEMES], [palette]);
  const theme = resolveTheme(look, looks, tpl?.id);
  useEffect(() => setTplSize(null), [tpl?.id]);
  const w = tpl ? (tplSize?.w ?? tpl.w) : size.w,
    h = tpl ? (tplSize?.h ?? tpl.h) : size.h;
  const create = async () => {
    setBusy(true);
    try {
      const bg: Background = bgs.find((b) => b.name === bgName)?.bg ?? defaultBackground();
      await createNewProject({
        name: name || (tpl ? tpl.name : 'Untitled showcase'),
        width: w,
        height: h,
        templateId: tpl?.id,
        templateOptions: tpl ? { text: 'keep', icons: 1, theme, size: w !== tpl.w || h !== tpl.h ? { w, h } : undefined } : undefined,
        background: bg,
        copyAssets: false,
        reuse,
      });
      onClose();
    } catch (e) {
      toast('Could not create the project: ' + (e instanceof Error ? e.message : String(e)), 'error');
      setBusy(false);
    }
  };
  return (
    <Modal
      title="New project"
      onClose={onClose}
      width={980}
      footer={
        <>
          <span className="muted small grow">
            {w} × {h} px · {tpl ? tpl.name : 'Blank page'} · {reuse ? `${reuse.assetIds.length} reused asset${reuse.assetIds.length === 1 ? '' : 's'}` : 'no assets yet'}
          </span>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy} onClick={() => void create()}>
            <FilePlus2 size={14} /> {busy ? 'Creating…' : 'Create'}
          </button>
        </>
      }
    >
      <div className="np">
        <div className="np-browser">
          {assetMode === 'reuse' ? (
            <>
              <div className="np-tabs">
                <button onClick={() => setAssetMode('empty')}>Sizes and templates</button>
                <button className="on">Assets to reuse</button>
                <span className="muted small np-tabs-note">{pick ? `${pick.ids.length} selected` : ''}</span>
              </div>
              <div className="hint" style={{ marginBottom: 12 }}>
                The files are copied into the new project. The project you take them from does not change.
              </div>
              <ProjectAssetPicker value={pick} onChange={setPick} />
            </>
          ) : (
          <>
          <div className="np-tabs">
            <button className={tab === 'blank' ? 'on' : ''} onClick={() => setTab('blank')}>
              Blank sizes
            </button>
            <button className={tab === 'templates' ? 'on' : ''} onClick={() => setTab('templates')}>
              Templates
            </button>
            {tab === 'blank' && (
              <input className="input sm np-search" placeholder="Search sizes — steam, instagram, 1080…" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
            )}
          </div>
          {tab === 'templates' ? (
            <div className="np-grid">
              {BUILTIN_TEMPLATES.map((t) => (
                <PresetCard
                  key={t.id}
                  w={t.w}
                  h={t.h}
                  title={t.name}
                  sub={`${t.w} × ${t.h}`}
                  on={choice.kind === 'template' && choice.id === t.id}
                  onClick={() => setChoice({ kind: 'template', id: t.id })}
                  onDoubleClick={() => void create()}
                />
              ))}
            </div>
          ) : (
            CANVAS_GROUPS.map((g) => {
              const q = query.trim().toLowerCase().replace(/x/g, '×');
              const list = CANVAS_PRESETS.filter((p) => p.group === g && (!q || `${p.label} ${g}`.toLowerCase().includes(q)));
              if (!list.length) return null;
              return (
              <div key={g}>
                <div className="np-group">{g}</div>
                <div className="np-grid">
                  {list.map((p) => (
                    <PresetCard
                      key={p.label}
                      w={p.w}
                      h={p.h}
                      title={presetName(p.label)}
                      sub={`${p.w} × ${p.h}`}
                      on={choice.kind === 'blank' && choice.label === p.label}
                      onClick={() => {
                        setChoice({ kind: 'blank', w: p.w, h: p.h, label: p.label });
                        setSize({ w: p.w, h: p.h });
                      }}
                      onDoubleClick={() => void create()}
                    />
                  ))}
                </div>
              </div>
              );
            })
          )}
          </>
          )}
        </div>
        <div className="np-details">
          <div className="np-title">Details</div>
          <PropRow label="Name">
            <input className="input" autoFocus placeholder={tpl ? tpl.name : 'Untitled showcase'} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void create()} />
          </PropRow>
          <PropRow label="Width">
            <NumberField value={w} min={16} max={16384} unit="px" onChange={(v) => (tpl ? setTplSize({ w: v, h }) : setSize({ ...size, w: v }))} />
          </PropRow>
          <PropRow label="Height">
            <NumberField value={h} min={16} max={16384} unit="px" onChange={(v) => (tpl ? setTplSize({ w, h: v }) : setSize({ ...size, h: v }))} />
          </PropRow>
          {tpl && <div className="hint">{tpl.description}</div>}
          {tpl && (
            <>
              <PropRow label="Size">
                <Select
                  value={tplSize ? `${w}x${h}` : ''}
                  onChange={(v) => {
                    if (!v) return setTplSize(null);
                    const [nw, nh] = v.split('x').map(Number);
                    setTplSize({ w: nw, h: nh });
                  }}
                  options={[{ value: '', label: `Template's own (${tpl.w}×${tpl.h})` }, ...[...new Map(CANVAS_PRESETS.map((c) => [`${c.w}x${c.h}`, c])).values()].map((c) => ({ value: `${c.w}x${c.h}`, label: c.label, group: c.group }))]}
                />
              </PropRow>
              <div className="np-title">Look</div>
              <Select
                value={look}
                onChange={setLook}
                options={[
                  { value: 'auto', label: palette ? 'Your icons’ colours (auto)' : 'Studio dark (auto)' },
                  { value: 'none', label: 'Template’s own look' },
                  ...looks.map((t) => ({ value: t.id, label: t.name, group: t.id.startsWith('match-') ? 'From your icons' : 'Game themes' })),
                ]}
              />
            </>
          )}
          {!tpl && <div className="np-title">Background</div>}
          {!tpl && (
          <div className="np-bgs">
            {bgs.map((b) => (
              <button key={b.name} className={`bgtile checker ${bgName === b.name ? 'on' : ''}`} title={b.name} onClick={() => setBgName(b.name)}>
                <BgThumb bg={b.bg} />
                <span>{b.name}</span>
              </button>
            ))}
          </div>
          )}
          <div className="np-title">Assets</div>
          <label className="np-radio">
            <input type="radio" name="np-assets" checked={assetMode === 'empty'} onChange={() => setAssetMode('empty')} />
            <span>
              Start with no assets
              <small>Import a folder or files after creating the project.</small>
            </span>
          </label>
          <label className="np-radio">
            <input type="radio" name="np-assets" checked={assetMode === 'reuse'} onChange={() => setAssetMode('reuse')} />
            <span>
              Reuse assets from a project
              <small>{assetMode === 'reuse' && pick ? `${pick.ids.length} picked — choose them on the left` : 'Pick a saved project and the assets to copy.'}</small>
            </span>
          </label>
        </div>
      </div>
    </Modal>
  );
}

function PresetCard({ w, h, title, sub, on, onClick, onDoubleClick, preview }: { w: number; h: number; title: string; sub: string; on: boolean; onClick: () => void; onDoubleClick: () => void; preview?: React.ReactNode }) {
  const k = 64 / Math.max(w, h);
  return (
    <button className={`np-card ${on ? 'on' : ''}`} onClick={onClick} onDoubleClick={onDoubleClick}>
      <div className="np-ratio">{preview ?? <div style={{ width: w * k, height: h * k }} />}</div>
      <b>{title}</b>
      <small>{sub}</small>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Project grid (Home + Projects dialog)
// ---------------------------------------------------------------------------

function timeAgo(t: number): string {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(t).toLocaleDateString();
}

export function useProjectList() {
  const docId = useDoc((s) => (s.open ? s.doc.id : ''));
  const [list, setList] = useState<ProjectMeta[] | null>(null);
  const refresh = () => void listProjects().then(setList).catch(() => setList([]));
  useEffect(refresh, [docId]);
  return { list, refresh };
}

type SortMode = 'recent' | 'name' | 'created' | 'oldest' | 'size';

function loadSort(): SortMode {
  try {
    return (localStorage.getItem('afs:projectSort') as SortMode) || 'recent';
  } catch {
    return 'recent';
  }
}

/** Project grid with search, sorting and bulk delete. */
export function ProjectBrowser({ onOpened, limit, view = 'grid' }: { onOpened?: () => void; limit?: number; view?: 'grid' | 'compact' }) {
  const { list, refresh } = useProjectList();
  const pinned = usePrefs((s) => s.pinnedProjects);
  const [showAll, setShowAll] = useState(false);
  const [q, setQ] = useState('');
  const [sort, setSortState] = useState<SortMode>(loadSort);
  const setSort = (s: SortMode) => {
    setSortState(s);
    try {
      localStorage.setItem('afs:projectSort', s);
    } catch {
      /* per-viewer convenience only */
    }
  };
  const shown = useMemo(() => {
    if (!list) return null;
    const needle = q.trim().toLowerCase();
    const f = needle ? list.filter((p) => p.name.toLowerCase().includes(needle)) : list.slice();
    if (sort === 'name') f.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    else if (sort === 'oldest') f.sort((a, b) => a.updatedAt - b.updatedAt);
    else if (sort === 'created') f.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    else if (sort === 'size') f.sort((a, b) => b.assets - a.assets);
    else f.sort((a, b) => b.updatedAt - a.updatedAt);
    // pinned projects first, in the chosen order
    const pin = new Set(pinned);
    return [...f.filter((p) => pin.has(p.id)), ...f.filter((p) => !pin.has(p.id))];
  }, [list, q, sort, pinned]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const selecting = picked.size > 0;
  const deletePicked = async () => {
    const ids = [...picked].filter((id) => list?.some((p) => p.id === id));
    if (!ids.length) return;
    if (!(await askConfirm({ title: `Delete ${ids.length} project${ids.length > 1 ? 's' : ''}?`, message: deleteManyNote(), okLabel: deleteLabel(), danger: true }))) return;
    await deleteStoredProjects(ids);
    toast(deletedToast(ids.length), 'success');
    setPicked(new Set());
    refresh();
  };
  const deleteAll = async () => {
    const all = list ?? [];
    if (!all.length) return;
    if (!(await askConfirm({ title: `Delete all ${all.length} project${all.length > 1 ? 's' : ''}?`, message: deleteManyNote(), okLabel: deleteLabel(), danger: true }))) return;
    await deleteStoredProjects(all.map((p) => p.id));
    toast(deletedToast(all.length), 'success');
    refresh();
  };
  return (
    <div className="project-browser">
      {list && list.length > 0 && (
        <div className="pb-toolbar">
          <div className="search">
            <Search size={13} />
            <input className="input sm" placeholder="Search projects" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
          </div>
          <Select<SortMode>
            className="pb-sort"
            value={sort}
            onChange={setSort}
            options={[
              { value: 'recent', label: 'Last edited' },
              { value: 'created', label: 'Newest created' },
              { value: 'oldest', label: 'Least recently edited' },
              { value: 'name', label: 'Name' },
              { value: 'size', label: 'Most assets' },
            ]}
          />
          <span className="muted small grow">
            {selecting ? `${picked.size} selected` : `${shown && shown.length !== list.length ? `${shown.length} of ${list.length}` : list.length} project${list.length === 1 ? '' : 's'}`}
          </span>
          {selecting ? (
            <>
              <button className="btn ghost sm" onClick={() => setPicked(new Set(shown?.map((p) => p.id)))}>
                Select all
              </button>
              <button className="btn ghost sm" onClick={() => setPicked(new Set())}>
                Cancel
              </button>
              <button className="btn sm danger" onClick={() => void deletePicked()}>
                <Trash2 size={13} /> Delete {picked.size}…
              </button>
            </>
          ) : (
            <button className="btn ghost sm danger" onClick={() => void deleteAll()} title="Delete every stored project">
              <Trash2 size={13} /> Delete all…
            </button>
          )}
        </div>
      )}
      <ProjectGrid view={view} list={shown} refresh={refresh} onOpened={onOpened} limit={q || showAll ? undefined : limit} picked={picked} onPick={(id) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })} pinned={pinned} />
      {limit && !q && !showAll && shown && shown.length > limit && (
        <button className="btn ghost sm pb-more" onClick={() => setShowAll(true)}>
          Show all {shown.length} projects
        </button>
      )}
      {shown && list && list.length > 0 && !shown.length && <div className="muted small">No project matches “{q}”.</div>}
    </div>
  );
}

const togglePin = (id: string) => {
  const p = usePrefs.getState();
  p.setPrefs({ pinnedProjects: p.pinnedProjects.includes(id) ? p.pinnedProjects.filter((x) => x !== id) : [id, ...p.pinnedProjects] });
};

export function ProjectGrid({ list, refresh, onOpened, limit, picked, onPick, pinned = [], view = 'grid' }: { list: ProjectMeta[] | null; refresh: () => void; onOpened?: () => void; limit?: number; picked?: Set<string>; onPick?: (id: string) => void; pinned?: string[]; view?: 'grid' | 'compact' }) {
  // the open project, if any (no project open: no card is marked)
  const current = useDoc((s) => (s.open ? s.doc.id : null));
  const [renaming, setRenaming] = useState<string | null>(null);
  if (!list) return <div className="muted small">Loading…</div>;
  if (!list.length) return null;
  const open = async (id: string) => {
    // only go to the editor when that project really is open now
    if (!(await openStoredProject(id))) return;
    setStage('compose');
    onOpened?.();
  };
  const shown = limit ? list.slice(0, limit) : list;
  const name = (p: ProjectMeta) =>
    renaming === p.id ? (
      <RenameInput
        value={p.name}
        onDone={async (v) => {
          setRenaming(null);
          if (v && v !== p.name) {
            await renameStoredProject(p.id, v);
            refresh();
          }
        }}
      />
    ) : (
      <b
        title={p.name}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setRenaming(p.id);
        }}
      >
        {p.name}
      </b>
    );
  const actions = (p: ProjectMeta) => (
    <button
      className="btn ghost icon sm"
      title="Project actions"
      aria-label={`Actions for ${p.name}`}
      onClick={(e) => {
        e.stopPropagation();
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        menu(r.right - 210, r.bottom + 4, p);
      }}
    >
      <MoreHorizontal size={15} />
    </button>
  );
  if (view === 'compact')
    return (
      <div className="project-list" role="list">
        {shown.map((p) => (
          <div
            key={p.id}
            role="listitem"
            className={`project-row ${p.id === current ? 'current' : ''} ${picked?.has(p.id) ? 'picked' : ''}`}
            tabIndex={0}
            aria-label={`${p.name}${p.id === current ? ' (open)' : ''}`}
            onClick={(e) => ((picked?.size || e.ctrlKey || e.metaKey) && onPick ? onPick(p.id) : renaming !== p.id && void open(p.id))}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === 'Enter') void open(p.id);
              else if (e.key === 'F2') setRenaming(p.id);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              menu(e.clientX, e.clientY, p);
            }}
          >
            <span className="pr-thumb checker">{p.thumb ? <img src={p.thumb} alt="" loading="lazy" /> : <ImageOff size={14} className="muted" />}</span>
            <span className="pr-name">
              {name(p)}
              {p.id === current && <span className="pc-badge inline">Open</span>}
              {pinned.includes(p.id) && <Pin size={12} className="pr-pin" aria-label="Pinned" />}
            </span>
            <span className="pr-meta mono">{p.width && p.height ? `${p.width}×${p.height}` : ''}</span>
            <span className="pr-meta">
              {p.pages} page{p.pages === 1 ? '' : 's'} · {p.assets} assets
            </span>
            <span className="pr-meta">{timeAgo(p.updatedAt)}</span>
            {onPick && <input type="checkbox" className="pr-check" checked={!!picked?.has(p.id)} onClick={(e) => e.stopPropagation()} onChange={() => onPick(p.id)} aria-label={`Select ${p.name}`} />}
            {actions(p)}
          </div>
        ))}
      </div>
    );
  return (
    <div className="project-grid">
      {shown.map((p) => (
        <div key={p.id} className={`project-card ${p.id === current ? 'current' : ''} ${picked?.has(p.id) ? 'picked' : ''}`} onClick={(e) => (picked?.size || e.ctrlKey || e.metaKey) && onPick ? onPick(p.id) : renaming !== p.id && void open(p.id)} onContextMenu={(e) => {
          e.preventDefault();
          menu(e.clientX, e.clientY, p);
        }}>
          <div className="pc-thumb checker">
            {p.thumb ? <img src={p.thumb} alt="" /> : <ImageOff size={20} className="muted" />}
            {p.id === current && <span className="pc-badge">Open</span>}
            {onPick && (
              <input type="checkbox" className="pc-check" checked={!!picked?.has(p.id)} onClick={(e) => e.stopPropagation()} onChange={() => onPick(p.id)} aria-label={`Select ${p.name}`} title="Select (Ctrl-click a card does the same)" />
            )}
            {pinned.includes(p.id) && <Pin size={13} className="pc-pin" aria-label="Pinned" />}
          </div>
          <div className="pc-info">
            {renaming === p.id ? (
              <RenameInput
                value={p.name}
                onDone={async (v) => {
                  setRenaming(null);
                  if (v && v !== p.name) {
                    await renameStoredProject(p.id, v);
                    refresh();
                  }
                }}
              />
            ) : (
              <b title={p.name} onDoubleClick={(e) => {
                e.stopPropagation();
                setRenaming(p.id);
              }}>
                {p.name}
              </b>
            )}
            <button
              className="btn ghost icon sm"
              title="Project actions"
              aria-label="Project actions"
              onClick={(e) => {
                e.stopPropagation();
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                menu(r.right - 210, r.bottom + 4, p);
              }}
            >
              <MoreHorizontal size={15} />
            </button>
          </div>
          <small className="pc-meta">
            {p.width && p.height ? `${p.width}×${p.height} · ` : ''}
            {p.pages} page{p.pages === 1 ? '' : 's'} · {p.assets} assets · edited {timeAgo(p.updatedAt)}
          </small>
        </div>
      ))}
    </div>
  );

  function menu(x: number, y: number, p: ProjectMeta) {
    openMenu(x, y, [
      { label: 'Open', onClick: () => void open(p.id) },
      { label: pinned.includes(p.id) ? 'Unpin' : 'Pin to top', onClick: () => togglePin(p.id) },
      { label: 'Rename', onClick: () => setRenaming(p.id) },
      {
        label: 'Duplicate',
        onClick: async () => {
          const id = await duplicateStoredProject(p.id);
          if (id) toast(`Duplicated “${p.name}”`, 'success');
          refresh();
        },
      },
      ...(p.id === current ? [{ label: 'Save as .showcase file…', onClick: () => void exportProjectFile() }, { label: 'Close project', onClick: () => void closeProject().then(refresh) }] : []),
      { separator: true },
      {
        label: 'Delete…',
        danger: true,
        onClick: async () => {
          if (!(await askConfirm({ title: `Delete “${p.name}”?`, message: deleteOneNote(), okLabel: deleteLabel(), danger: true }))) return;
          await deleteStoredProject(p.id);
          toast(deletedToast(1), 'success');
          refresh();
        },
      },
    ]);
  }
}

function RenameInput({ value, onDone }: { value: string; onDone: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      className="input sm"
      defaultValue={value}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => onDone(e.target.value.trim())}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') onDone(value);
      }}
    />
  );
}

/** Every template rendered with the open project's assets; picking one starts a new project from it. */
export function TemplatePreviewsDialog({ onClose }: { onClose: () => void }) {
  const doc = useDoc((s) => s.doc);
  const n = doc.assets.filter((a) => a.kind === 'asset').length;
  return (
    <Modal title={`Templates with your ${n} assets`} onClose={onClose} width={1040}>
      <div className="muted small" style={{ marginBottom: 12 }}>
        Previews use the assets of “{doc.name}”. Click one to start a new project from it — your assets can be copied over in the next step.
      </div>
      <div className="tpl-gallery">
        {BUILTIN_TEMPLATES.map((t, i) => (
          <button key={t.id} className="tpl-gal-card" onClick={() => openDialog('newProject', t.id)} title={t.description}>
            <PagePreview cacheKey={`gal|${t.id}|${doc.id}|${n}`} width={300} delay={90 * i} build={() => previewTemplate(t, libraryAssets(), BACKGROUND_PRESETS[4].bg())} className="fill" />
            <span className="tpl-gal-foot">
              <b>{t.name}</b>
              <small>
                {t.w} × {t.h}
              </small>
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

export function ProjectsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="Projects"
      onClose={onClose}
      width={900}
      footer={
        <>
          <span className="muted small grow">Projects are saved automatically on this computer. Right-click a project for more actions.</span>
          <button className="btn" onClick={() => void exportProjectFile()} title="Save the open project as a portable .showcase file">
            <FileDown size={14} /> Save as file…
          </button>
        </>
      }
    >
      <div className="row" style={{ marginBottom: 14 }}>
        <button className="btn primary" onClick={() => openDialog('newProject')}>
          <FilePlus2 size={14} /> New project…
        </button>
        <button
          className="btn"
          onClick={async () => {
            onClose();
            if (!(await openProjectViaDialog())) openProjectPicker();
          }}
        >
          <FolderOpen size={14} /> Open file…
        </button>
      </div>
      <ProjectBrowser onOpened={() => useUI.setState({ dialog: null })} />
    </Modal>
  );
}

