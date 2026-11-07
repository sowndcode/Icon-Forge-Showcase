// Text style presets in the inspector: search, groups, favourites (starred) and recently used.
// Applying a style keeps the words, size and alignment (applyTextLook).

import { useState } from 'react';
import { History, Search, Star } from 'lucide-react';
import { TEXT_PRESET_GROUPS, TEXT_PRESETS, elementStyle, type SavedElement } from '../../core/defaults';
import type { TextStyle } from '../../core/types';
import { usePrefs } from '../../state/prefs';

type Item = { key: string; name: string; group: string; look: Partial<TextStyle> };

export function TextStylePicker({ saved, onApply }: { saved: { id: string; name: string; data: SavedElement }[]; onApply: (look: Partial<TextStyle>, name: string) => void }) {
  const favs = usePrefs((s) => s.favTextStyles);
  const recent = usePrefs((s) => s.recentTextStyles);
  const setPrefs = usePrefs((s) => s.setPrefs);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<string>('all');
  const items: Item[] = [
    ...saved.map((p) => ({ key: 'u:' + p.id, name: p.name, group: 'Mine', look: elementStyle(p.data) })),
    ...TEXT_PRESETS.map((p) => ({ key: 'b:' + p.name, name: p.name, group: p.group as string, look: p.style })),
  ];
  const byKey = new Map(items.map((i) => [i.key, i]));
  const q = query.trim().toLowerCase();
  const groups = ['all', 'favourites', ...(saved.length ? ['Mine'] : []), ...TEXT_PRESET_GROUPS];
  const list = items.filter((i) => (group === 'all' || (group === 'favourites' ? favs.includes(i.key) : i.group === group)) && (!q || `${i.name} ${i.group}`.toLowerCase().includes(q)));
  const recentItems = !q && group === 'all' ? (recent ?? []).map((k) => byKey.get(k)).filter((i): i is Item => !!i).slice(0, 5) : [];
  const apply = (i: Item) => {
    setPrefs({ recentTextStyles: [i.key, ...(recent ?? []).filter((k) => k !== i.key)].slice(0, 8) });
    onApply(i.look, i.name);
  };
  const star = (i: Item) => setPrefs({ favTextStyles: favs.includes(i.key) ? favs.filter((k) => k !== i.key) : [...favs, i.key] });
  const chip = (i: Item) => (
    <span key={i.key} className={`chip tstyle ${favs.includes(i.key) ? 'fav' : ''}`}>
      <button className="tstyle-name" onClick={() => apply(i)} title={`${i.group}: apply this look (keeps your words, size and alignment)`}>
        {i.name}
      </button>
      <button className="tstyle-star" onClick={() => star(i)} title={favs.includes(i.key) ? 'Remove from favourites' : 'Add to favourites'} aria-label={favs.includes(i.key) ? `Unstar ${i.name}` : `Star ${i.name}`} aria-pressed={favs.includes(i.key)}>
        <Star size={11} fill={favs.includes(i.key) ? 'currentColor' : 'none'} />
      </button>
    </span>
  );
  return (
    <div className="tstyles">
      <span className="search">
        <Search size={12} />
        <input className="input sm" value={query} placeholder={`Search ${items.length} styles`} aria-label="Search text styles" onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      </span>
      <select className="input sm" value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Style group">
        {groups.map((g) => (
          <option key={g} value={g}>
            {g === 'all' ? 'All styles' : g === 'favourites' ? `Favourites (${favs.length})` : g === 'Mine' ? 'My elements' : g}
          </option>
        ))}
      </select>
      {recentItems.length > 0 && (
        <>
          <div className="tstyles-label">
            <History size={11} /> Recent
          </div>
          <div className="chips">{recentItems.map(chip)}</div>
          <div className="tstyles-label">All styles</div>
        </>
      )}
      <div className="chips">{list.map(chip)}</div>
      {!list.length && <div className="muted small">{group === 'favourites' && !q ? 'Star a style to keep it here.' : 'No style matches.'}</div>}
    </div>
  );
}
