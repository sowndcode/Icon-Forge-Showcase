// Shared parts of the Themes, Backgrounds and Templates libraries: favourites and recently used items
// (remembered on this computer), search, the "applies to" scope line, tiles with a star, and the
// before/after preview shown before a broad change is applied.

import type { ReactNode } from 'react';
import { MoreHorizontal, Search, Star, X } from 'lucide-react';
import type { Page } from '../../core/types';
import { useDoc } from '../../state/doc';
import { usePrefs, type LibraryKind } from '../../state/prefs';
import { openDialog, useUI } from '../../state/ui';
import { Modal } from '../components/controls';
import { PagePreview } from '../components/PagePreview';

export function useFavorites(kind: LibraryKind) {
  const list = usePrefs((s) => s.favorites[kind]);
  const set = new Set(list);
  const toggle = (id: string) => {
    const p = usePrefs.getState();
    const cur = p.favorites[kind];
    p.setPrefs({ favorites: { ...p.favorites, [kind]: cur.includes(id) ? cur.filter((x) => x !== id) : [id, ...cur] } });
  };
  return { list, has: (id: string) => set.has(id), toggle };
}

export function useRecents(kind: LibraryKind): string[] {
  return usePrefs((s) => s.recents[kind]);
}

/** Remember that an item was applied (newest first, at most 12). */
export function pushRecent(kind: LibraryKind, id: string) {
  const p = usePrefs.getState();
  p.setPrefs({ recents: { ...p.recents, [kind]: [id, ...p.recents[kind].filter((x) => x !== id)].slice(0, 12) } });
}

/** Pages an action from the library reaches: the picked pages (two or more), else the open one. */
export function useTargetPages(): string[] {
  const active = useDoc((s) => s.doc.activePageId);
  const pages = useDoc((s) => s.doc.pages);
  const sel = useUI((s) => s.pageSel).filter((id) => pages.some((p) => p.id === id));
  return sel.length > 1 ? sel : [active];
}

/** "Applies to this page" or "Applies to 3 selected pages · Clear". */
export function ScopeNote({ what }: { what: string }) {
  const targets = useTargetPages();
  const name = useDoc((s) => s.doc.pages.find((p) => p.id === s.doc.activePageId)?.name ?? '');
  return (
    <div className={`scope-note ${targets.length > 1 ? 'multi' : ''}`} title={targets.length > 1 ? undefined : 'Ctrl-click or Shift-click pages in the page strip to change several at once'}>
      {targets.length > 1 ? (
        <>
          <span className="scope-dot" />
          <span className="grow">
            {what} apply to <b>{targets.length} selected pages</b>
          </span>
          <button className="link-btn" onClick={() => useUI.setState({ pageSel: [] })}>
            Only this page
          </button>
        </>
      ) : (
        <span className="grow ellipsis">
          {what} apply to <b>{name || 'this page'}</b>
        </span>
      )}
    </div>
  );
}

/** Search box + filter chips, the same in every library. */
export function LibraryBar<T extends string>({ q, onQ, placeholder = 'Search', chips, value, onChange }: { q: string; onQ: (v: string) => void; placeholder?: string; chips: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="lib-bar">
      <div className="search">
        <Search size={13} />
        <input className="input sm" placeholder={placeholder} value={q} onChange={(e) => onQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
        {q && (
          <button className="search-x" aria-label="Clear search" onClick={() => onQ('')}>
            <X size={12} />
          </button>
        )}
      </div>
      <div className="chips">
        {chips.map((c) => (
          <button key={c.value} className={`chip ${value === c.value ? 'on' : ''}`} onClick={() => onChange(c.value)}>
            {c.label}
            {c.count !== undefined && <small>{c.count}</small>}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A library tile: the thumbnail is the button; a star and a "more" button appear on hover. */
export function LibTile({ title, onClick, onMenu, fav, onFav, children, label, note, className = '', on }: { title: string; onClick: () => void; onMenu?: (x: number, y: number) => void; fav?: boolean; onFav?: () => void; children: ReactNode; label?: string; note?: ReactNode; className?: string; on?: boolean }) {
  return (
    <div className={`lib-tile ${className} ${fav ? 'is-fav' : ''}`}>
      <button
        className={`bgtile ${on ? 'on' : ''}`}
        title={title}
        onClick={onClick}
        onContextMenu={
          onMenu
            ? (e) => {
                e.preventDefault();
                onMenu(e.clientX, e.clientY);
              }
            : undefined
        }
      >
        {children}
      </button>
      {onFav && (
        <button className={`tile-star ${fav ? 'on' : ''}`} title={fav ? 'Remove from favourites' : 'Add to favourites'} aria-label={fav ? 'Remove from favourites' : 'Add to favourites'} aria-pressed={fav} onClick={onFav}>
          <Star size={12} />
        </button>
      )}
      {onMenu && (
        <button className="tile-more" title="Preview, apply and more" aria-label={`More for ${label ?? title}`} onClick={(e) => onMenu(e.clientX - 180, e.clientY + 10)}>
          <MoreHorizontal size={14} />
        </button>
      )}
      {(label || note) && (
        <div className="lib-tile-foot">
          {label && <span className="ellipsis">{label}</span>}
          {note}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Before / after preview
// ---------------------------------------------------------------------------

export interface ApplyPreview {
  title: string;
  /** What will change, in a few words ("Background, title and badge colours"). */
  changes: string;
  /** What stays ("Your words, icons and layout stay as they are"). */
  keeps: string;
  pageIds: string[];
  build: (p: Page) => Page;
  apply: () => void;
  /** Extra line, e.g. a readability note. */
  note?: ReactNode;
}

export function openApplyPreview(p: ApplyPreview) {
  openDialog('applyPreview', p);
}

let previewSeq = 0;
export function ApplyPreviewDialog({ onClose }: { onClose: () => void }) {
  const arg = useUI((s) => s.dialogArg) as ApplyPreview | null;
  const pages = useDoc((s) => s.doc.pages);
  const active = useDoc((s) => s.doc.activePageId);
  if (!arg) return null;
  const page = pages.find((p) => p.id === active && arg.pageIds.includes(p.id)) ?? pages.find((p) => arg.pageIds.includes(p.id));
  if (!page) return null;
  const seq = ++previewSeq;
  const n = arg.pageIds.length;
  return (
    <Modal
      title={arg.title}
      onClose={onClose}
      width={980}
      footer={
        <>
          <span className="muted small grow">{n > 1 ? `Applies to ${n} selected pages · one Ctrl+Z undoes it` : `Applies to “${page.name}” · Ctrl+Z undoes it`}</span>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={() => {
              arg.apply();
              onClose();
            }}
          >
            Apply{n > 1 ? ` to ${n} pages` : ''}
          </button>
        </>
      }
    >
      <div className="ap">
        <figure>
          <PagePreview cacheKey={`ap-now|${page.id}|${seq}`} width={440} build={() => page} className="fill" />
          <figcaption>Now</figcaption>
        </figure>
        <figure>
          <PagePreview cacheKey={`ap-after|${page.id}|${seq}`} width={440} build={() => arg.build(page)} className="fill" />
          <figcaption>After</figcaption>
        </figure>
      </div>
      <dl className="ap-info">
        <div>
          <dt>Changes</dt>
          <dd>{arg.changes}</dd>
        </div>
        <div>
          <dt>Stays</dt>
          <dd>{arg.keeps}</dd>
        </div>
        {arg.note && (
          <div>
            <dt>Note</dt>
            <dd>{arg.note}</dd>
          </div>
        )}
      </dl>
    </Modal>
  );
}
