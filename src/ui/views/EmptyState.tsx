import { FolderOpen, Images, LayoutTemplate, X } from 'lucide-react';
import { activePageOf, usePage, useDoc } from '../../state/doc';
import { usePrefs } from '../../state/prefs';
import { useUI } from '../../state/ui';
import { openFilePicker, openFolderPicker } from '../App';

export function EmptyState() {
  const page = usePage();
  const hasAssets = useDoc((s) => s.doc.assets.length > 0);
  if (page.objects.length) return null;
  return (
    <div className="empty-state">
      <div className="empty-card">
        <h2>{hasAssets ? 'Drag assets onto the canvas' : 'Drop your assets here'}</h2>
        <div className="fmt">PNG, WebP or JPG — single files or whole folders</div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn primary" onClick={() => openFilePicker()}>
            <Images size={15} /> Import files
          </button>
          <button className="btn" onClick={() => openFolderPicker()}>
            <FolderOpen size={15} /> Import folder
          </button>
          <button className="btn" onClick={() => useUI.setState({ leftTab: 'templates' })}>
            <LayoutTemplate size={15} /> Start from a template
          </button>
        </div>
        {hasAssets && <div className="muted small">Or select assets in the library and press “Add selected” / “Add all”.</div>}
      </div>
    </div>
  );
}

/** A short checklist on an empty page only: it never covers work, and it can be turned off. */
export function QuickStart() {
  const dismissed = usePrefs((s) => s.quickStartDismissed);
  const setPrefs = usePrefs((s) => s.setPrefs);
  const empty = useDoc((s) => (activePageOf(s.doc)?.objects.length ?? 0) === 0);
  if (dismissed || !empty) return null;
  return (
    <div className="quickstart">
      <div className="row">
        <b className="grow">Quick start</b>
        <button className="btn ghost icon sm" title="Dismiss" onClick={() => setPrefs({ quickStartDismissed: true })}>
          <X size={13} />
        </button>
      </div>
      <ol>
        <li>
          <b>Drop a folder</b> of transparent PNGs — subfolders become categories.
        </li>
        <li>
          <b>Add all</b> (or drag assets) onto the canvas.
        </li>
        <li>
          Open <b>Arrange</b> and pick a Smart Layout — try <b>Perspective Floor</b>.
        </li>
        <li>
          Tweak sliders live, drag a few assets by hand — moved assets get <b>pinned</b>.
        </li>
        <li>
          Add a background and a title, then <b>Export</b>.
        </li>
      </ol>
      <div className="muted small">
        Press <span className="kbd">?</span> for all shortcuts.
      </div>
    </div>
  );
}
