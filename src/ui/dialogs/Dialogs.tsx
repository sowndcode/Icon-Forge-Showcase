import { useMemo, useState } from 'react';
import { Upload } from 'lucide-react';
import { buildCatalogPages, CATALOG_STYLES, DEFAULT_CATALOG } from '../../core/catalog';
import { BACKGROUND_PRESETS } from '../../core/defaults';
import type { CatalogSettings } from '../../core/types';
import { ALGORITHMS } from '../../layout/registry';
import { categoriesOf, deleteAssets } from '../../state/assets';
import { getDoc, useDoc } from '../../state/doc';
import {
  catalogBackground,
  sortForCatalog,
  createMarketplaceSet,
  generateCatalog,
  generateCategoryShowcase,
  libraryAssets,
  packNameGuess,
  pickRandom,
  replaceAssetSet,
  saveCurrentAsTemplate,
  type RandomMode,
  type ReplaceOptions,
} from '../../state/generators';
import { addAssetsToCanvas } from '../../state/placement';
import { useUI, toast } from '../../state/ui';
import { importFiles } from '../../state/assets';
import { entriesFromInput, humanBytes } from '../../services/formats';
import { SHORTCUTS } from '../shortcuts';
import { Check, ColorField, Modal, NumberField, PropRow, Seg, Select, Slider, Toggle } from '../components/controls';
import { PagePreview } from '../components/PagePreview';
import { ExportPanel } from '../right/ExportPanel';
import { NewProjectDialog, ProjectsDialog, TemplatePreviewsDialog } from './ProjectDialogs';
import { SettingsDialog } from './SettingsDialog';
import { CompareDialog, VariationsDialog } from './ProductionDialogs';
import { ShareCodeDialog } from './ShareCodeDialog';
import { AddFromProjectDialog } from './ProjectAssetPicker';
import { NewPageDialog } from './NewPageDialog';
import { Keys } from '../components/Keys';
import { AssetPreviewDialog } from './AssetPreview';
import { ImportLooksDialog } from './ImportLooksDialog';
import { ApplyPreviewDialog } from '../left/libraryKit';

export function Dialogs() {
  const d = useUI((s) => s.dialog);
  const close = () => useUI.setState({ dialog: null, dialogArg: null });
  switch (d) {
    case 'projects':
      return <ProjectsDialog onClose={close} />;
    case 'templatePreviews':
      return <TemplatePreviewsDialog onClose={close} />;
    case 'newProject':
      return <NewProjectDialog onClose={close} initialTemplate={(useUI.getState().dialogArg as string | null) ?? undefined} />;
    case 'shortcuts':
      return <ShortcutsDialog onClose={close} />;
    case 'settings':
      return <SettingsDialog onClose={close} />;
    case 'newPage':
      return <NewPageDialog onClose={close} />;
    case 'catalog':
      return <CatalogDialog onClose={close} />;
    case 'marketplace':
      return <MarketplaceDialog onClose={close} />;
    case 'categoryShowcase':
      return <CategoryDialog onClose={close} />;
    case 'replaceSet':
      return <ReplaceDialog onClose={close} />;
    case 'randomSelect':
      return <RandomDialog onClose={close} />;
    case 'export':
      return (
        <Modal title="Export" onClose={close} width={420}>
          <div className="insp" style={{ margin: '0 -16px' }}>
            <ExportPanel />
          </div>
        </Modal>
      );
    case 'saveTemplate':
      return <SaveTemplateDialog onClose={close} />;
    case 'variations':
      return <VariationsDialog onClose={close} />;
    case 'compare':
      return <CompareDialog onClose={close} />;
    case 'shareCode':
      return <ShareCodeDialog onClose={close} />;
    case 'addFromProject':
      return <AddFromProjectDialog onClose={close} />;
    case 'assetPreview':
      return <AssetPreviewDialog onClose={close} />;
    case 'applyPreview':
      return <ApplyPreviewDialog onClose={close} />;
    case 'importLooks':
      return <ImportLooksDialog onClose={close} initial={(useUI.getState().dialogArg as 'theme' | 'background' | 'template' | null) ?? 'theme'} />;
    default:
      return null;
  }
}

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} width={560}>
      <table className="table">
        <tbody>
          {SHORTCUTS.map(([k, v]) => (
            <tr key={k}>
              <td className="sc-keys-cell">
                <Keys shortcut={k} />
              </td>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

function CatalogDialog({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<CatalogSettings>({ ...DEFAULT_CATALOG, title: `${packNameGuess()} — Full catalog` });
  const [size, setSize] = useState({ w: 3000, h: 3000 });
  const [bgName, setBgName] = useState('Charcoal');
  const [source, setSource] = useState<'all' | 'selected'>(useUI.getState().librarySel.length ? 'selected' : 'all');
  const set = (p: Partial<CatalogSettings>) => setS({ ...s, ...p });
  const assets = source === 'selected' ? libraryAssets().filter((a) => useUI.getState().librarySel.includes(a.id)) : libraryAssets();
  const styleOn = (st: (typeof CATALOG_STYLES)[number]) => bgName === st.background && Object.entries(st.settings).every(([k, v]) => s[k as keyof CatalogSettings] === v);
  const previewKey = `catalog|${assets.length}|${size.w}x${size.h}|${bgName}|${JSON.stringify(s)}`;
  return (
    <Modal
      title="Generate catalog"
      onClose={onClose}
      width={880}
      footer={
        <>
          <span className="muted small grow">Adds {s.maxPerPage > 0 ? Math.ceil(assets.length / s.maxPerPage) : 1} page{s.maxPerPage > 0 && assets.length > s.maxPerPage ? 's' : ''} to this project.</span>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={!assets.length}
            onClick={() => {
              generateCatalog(assets, s, size, bgName);
              onClose();
            }}
          >
            Generate ({assets.length} assets)
          </button>
        </>
      }
    >
      <div className="catalog-dlg">
        <div className="catalog-form">
          <div className="np-title">Style</div>
          <div className="chips">
            {CATALOG_STYLES.map((st) => (
              <button
                key={st.name}
                className={`chip ${styleOn(st) ? 'on' : ''}`}
                onClick={() => {
                  setS({ ...s, ...st.settings });
                  setBgName(st.background);
                }}
              >
                {st.name}
              </button>
            ))}
          </div>
          <PropRow label="Assets">
            <Seg small value={source} onChange={setSource} options={[{ value: 'all', label: `All (${libraryAssets().length})` }, { value: 'selected', label: `Selected (${useUI.getState().librarySel.length})` }]} />
          </PropRow>
          <PropRow label="Page size">
            <Select
              value={`${size.w}x${size.h}`}
              onChange={(v) => {
                const [w, h] = v.split('x').map(Number);
                setSize({ w, h });
              }}
              options={[
                { value: '3000x3000', label: '3000×3000 square' },
                { value: '2048x2048', label: '2048×2048 square' },
                { value: '1920x1080', label: '1920×1080 wide' },
                { value: '630x500', label: '630×500 itch.io cover' },
                { value: '2480x3508', label: 'A4 portrait (300dpi)' },
                { value: '3840x2160', label: '3840×2160 4K' },
              ]}
            />
          </PropRow>
          <PropRow label="Background">
            <Select value={bgName} onChange={setBgName} options={BACKGROUND_PRESETS.filter((p) => p.group !== 'Patterns').map((p) => ({ value: p.name, label: p.name, group: p.group }))} />
          </PropRow>
          <PropRow label="Title">
            <input className="input sm" value={s.title} placeholder="No title" onChange={(e) => set({ title: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
          </PropRow>
          <PropRow label="Columns">
            <Toggle checked={!s.columns} onChange={(v) => set({ columns: v ? 0 : 10 })} /> <span className="small muted">Auto</span>
            {!!s.columns && <NumberField value={s.columns} min={1} max={60} onChange={(columns) => set({ columns })} />}
          </PropRow>
          <PropRow label="Per page" title="0 = everything on one page; otherwise several pages">
            <NumberField value={s.maxPerPage} min={0} max={1000} onChange={(maxPerPage) => set({ maxPerPage })} placeholder="All" />
          </PropRow>
          <PropRow label="Spacing">
            <Slider value={s.spacing} min={0} max={80} unit="px" onChange={(spacing) => set({ spacing })} />
          </PropRow>
          <PropRow label="Margin">
            <Slider value={s.margin} min={0} max={300} unit="px" onChange={(margin) => set({ margin })} />
          </PropRow>
          <PropRow label="Asset size">
            <Slider value={s.fill} min={0.4} max={1} step={0.01} scale={100} unit="%" onChange={(fill) => set({ fill })} />
          </PropRow>
          <PropRow label="Cells">
            <Seg small value={s.cellStyle ?? 'soft'} onChange={(cellStyle) => set({ cellStyle, cellBackground: cellStyle !== 'none' })} options={[{ value: 'none', label: 'None' }, { value: 'soft', label: 'Soft' }, { value: 'card', label: 'Card' }, { value: 'outline', label: 'Outline' }]} />
          </PropRow>
          {(s.cellStyle ?? 'soft') !== 'none' && (
            <PropRow label="Cell color">
              <ColorField value={s.cellColor ?? '#ffffff'} onChange={(cellColor) => set({ cellColor })} />
            </PropRow>
          )}
          <PropRow label="Text colors" title="Labels · category headers">
            <ColorField value={s.labelColor} onChange={(labelColor) => set({ labelColor })} />
            <ColorField value={s.headerColor ?? '#ffffff'} onChange={(headerColor) => set({ headerColor })} />
          </PropRow>
          <div className="catalog-checks">
            <Check checked={s.numbers} onChange={(numbers) => set({ numbers })} label="Numbers (01, 02…)" />
            <Check checked={s.labels} onChange={(labels) => set({ labels })} label="Name labels" />
            <Check checked={s.headers} onChange={(headers) => set({ headers })} label="Category headers" />
            <Check checked={s.subtitle !== false} onChange={(subtitle) => set({ subtitle })} label="Asset count under title" />
          </div>
        </div>
        <div className="catalog-preview">
          <PagePreview
            key={previewKey}
            cacheKey={previewKey}
            width={420}
            delay={200}
            build={() => (assets.length ? buildCatalogPages(sortForCatalog(assets), s, size, catalogBackground(bgName))[0] : null)}
          />
          <span className="muted small">Preview of the first page</span>
        </div>
      </div>
    </Modal>
  );
}

function MarketplaceDialog({ onClose }: { onClose: () => void }) {
  const n = libraryAssets().length;
  const [o, setO] = useState({ pack: packNameGuess(), hero: true, heroLayout: 'floor', heroCount: Math.min(60, n), cover: true, catalog: true, categories: false, balanced: true });
  const cats = categoriesOf(libraryAssets()).filter((c) => c.name);
  return (
    <Modal
      title="Create marketplace set"
      onClose={onClose}
      width={520}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={!n}
            onClick={() => {
              createMarketplaceSet(o);
              onClose();
            }}
          >
            Create pages
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <PropRow label="Pack name">
          <input className="input sm" value={o.pack} onChange={(e) => setO({ ...o, pack: e.target.value })} />
        </PropRow>
        <Check checked={o.hero} onChange={(hero) => setO({ ...o, hero })} label={<b>Hero — 1920×1080</b>} />
        {o.hero && (
          <div style={{ paddingLeft: 26, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <PropRow label="Style">
              <Seg small value={o.heroLayout} onChange={(heroLayout) => setO({ ...o, heroLayout })} options={[{ value: 'floor', label: 'Perspective floor' }, { value: 'edge', label: 'Edge frame + title' }]} />
            </PropRow>
            <PropRow label="Assets shown">
              <Slider value={o.heroCount} min={1} max={Math.max(1, n)} onChange={(heroCount) => setO({ ...o, heroCount })} />
            </PropRow>
            <Check checked={o.balanced} onChange={(balanced) => setO({ ...o, balanced })} label="Balance random pick across categories" />
          </div>
        )}
        <Check checked={o.cover} onChange={(cover) => setO({ ...o, cover })} label={<b>Square cover — 1080×1080</b>} />
        <Check checked={o.catalog} onChange={(catalog) => setO({ ...o, catalog })} label={<b>Full catalog — 3000×3000 (all {n} assets)</b>} />
        <Check checked={o.categories} onChange={(categories) => setO({ ...o, categories })} label={<b>Category previews — one 1920×1080 page per category ({cats.length})</b>} />
        <div className="hint">Pages share the same asset library. Everything stays editable afterwards; export them all at once with Export → all pages.</div>
      </div>
    </Modal>
  );
}

function CategoryDialog({ onClose }: { onClose: () => void }) {
  const cats = categoriesOf(libraryAssets());
  const [picked, setPicked] = useState<string[]>(cats.map((c) => c.name));
  const [alg, setAlg] = useState('grid');
  const [size, setSize] = useState('1920x1080');
  return (
    <Modal
      title="Category showcase"
      onClose={onClose}
      width={480}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={!picked.length}
            onClick={() => {
              const [w, h] = size.split('x').map(Number);
              generateCategoryShowcase(picked, alg, { w, h });
              onClose();
            }}
          >
            Create {picked.length} page{picked.length === 1 ? '' : 's'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {cats.length <= 1 && <div className="hint warn">Assign categories first (import a folder with subfolders, or use “Set category”).</div>}
        <div className="check-list">
          {cats.map((c) => (
            <label key={c.name}>
              <input type="checkbox" checked={picked.includes(c.name)} onChange={(e) => setPicked(e.target.checked ? [...picked, c.name] : picked.filter((x) => x !== c.name))} />
              {c.name || 'Uncategorized'}
              <small>{c.count}</small>
            </label>
          ))}
        </div>
        <PropRow label="Layout">
          <Select value={alg} onChange={setAlg} options={ALGORITHMS.filter((a) => a.id !== 'path').map((a) => ({ value: a.id, label: a.label, group: a.group }))} />
        </PropRow>
        <PropRow label="Page size">
          <Select value={size} onChange={setSize} options={[{ value: '1920x1080', label: '1920×1080' }, { value: '1080x1080', label: '1080×1080' }, { value: '2048x2048', label: '2048×2048' }, { value: '1080x1350', label: '1080×1350' }]} />
        </PropRow>
      </div>
    </Modal>
  );
}

function ReplaceDialog({ onClose }: { onClose: () => void }) {
  const doc = useDoc((s) => s.doc);
  const assets = doc.assets.filter((a) => a.kind === 'asset' && a.status !== 'error');
  const folders = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of assets) {
      const root = a.folder.split('/')[0] || '(loose files)';
      m.set(root, (m.get(root) ?? 0) + 1);
    }
    return [...m];
  }, [assets]);
  const used = useMemo(() => {
    const s = new Set<string>();
    for (const p of doc.pages) for (const o of p.objects) if (o.type === 'image') s.add(o.assetId);
    return s;
  }, [doc.pages]);
  const [source, setSource] = useState<string>('__selected');
  const [opts, setOpts] = useState<ReplaceOptions>({ scope: 'all', extras: 'regenerate', matchCategory: true, removeOld: false });
  const newSet = source === '__selected' ? assets.filter((a) => useUI.getState().librarySel.includes(a.id)) : source === '__unused' ? assets.filter((a) => !used.has(a.id)) : assets.filter((a) => (a.folder.split('/')[0] || '(loose files)') === source);
  const sorted = newSet.slice().sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  return (
    <Modal
      title="Replace asset set"
      onClose={onClose}
      width={560}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={!sorted.length}
            onClick={() => {
              const r = replaceAssetSet(sorted, opts);
              toast(`Replaced ${r.replaced} images — layout, perspective, text and background kept`, 'success');
              if (opts.removeOld && r.oldIds.length) {
                const stillUsed = new Set<string>();
                for (const p of getDoc().pages) for (const o of p.objects) if (o.type === 'image') stillUsed.add(o.assetId);
                const drop = r.oldIds.filter((id) => !stillUsed.has(id));
                if (drop.length) void deleteAssets(drop, () => true);
              }
              onClose();
            }}
          >
            Replace with {sorted.length} assets
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="hint">
          Swap the images in your compositions for another pack while keeping slots, layout settings, perspective, text, shapes and background. Import the new pack first (it can live alongside the old one), then choose it here.
        </div>
        <div className="row">
          <label className="btn sm">
            <Upload size={13} /> Import new pack folder…
            <input
              type="file"
              hidden
              multiple
              {...({ webkitdirectory: '' } as Record<string, string>)}
              onChange={async (e) => {
                const list = entriesFromInput(e.target.files ?? []);
                e.target.value = '';
                if (list.length) {
                  await importFiles(list, 'asset');
                  const root = list[0].dir.split('/')[0];
                  if (root) setSource(root);
                }
              }}
            />
          </label>
        </div>
        <PropRow label="New asset set">
          <Select
            value={source}
            onChange={setSource}
            options={[
              { value: '__selected', label: `Selected in library (${useUI.getState().librarySel.length})` },
              { value: '__unused', label: `Assets not used on any page (${assets.filter((a) => !used.has(a.id)).length})` },
              ...folders.map(([f, n]) => ({ value: f, label: `Folder: ${f} (${n})` })),
            ]}
          />
        </PropRow>
        <PropRow label="Apply to">
          <Seg small value={opts.scope} onChange={(scope) => setOpts({ ...opts, scope })} options={[{ value: 'page', label: 'Current page' }, { value: 'all', label: 'All pages' }]} />
        </PropRow>
        <PropRow label="If more assets" title="When the new set has more assets than the composition has slots">
          <Select value={opts.extras} onChange={(extras) => setOpts({ ...opts, extras })} options={[{ value: 'regenerate', label: 'Regenerate layout' }, { value: 'add', label: 'Add slots, keep existing' }, { value: 'ignore', label: 'Ignore extras' }]} />
        </PropRow>
        <Check checked={opts.matchCategory} onChange={(matchCategory) => setOpts({ ...opts, matchCategory })} label="Match categories where names agree" />
        <Check checked={opts.removeOld} onChange={(removeOld) => setOpts({ ...opts, removeOld })} label="Remove replaced assets from the library" />
        <div className="hint">Fewer assets than slots → the remaining slots are left empty. Catalog pages are regenerated for the new set. Undo with Ctrl+Z.</div>
      </div>
    </Modal>
  );
}

function RandomDialog({ onClose }: { onClose: () => void }) {
  const all = libraryAssets();
  const [n, setN] = useState(Math.min(30, all.length));
  const [mode, setMode] = useState<RandomMode>('equal');
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e6));
  const cats = categoriesOf(all);
  const preview = useMemo(() => pickRandom(all, n, mode, seed), [all, n, mode, seed]);
  const byCat = categoriesOf(preview);
  return (
    <Modal
      title="Random selection"
      onClose={onClose}
      width={480}
      footer={
        <>
          <button className="btn" onClick={() => setSeed(Math.floor(Math.random() * 1e6))}>
            Reroll
          </button>
          <span className="grow" />
          <button
            className="btn"
            onClick={() => {
              useUI.setState({ librarySel: preview.map((a) => a.id) });
              onClose();
            }}
          >
            Select in library
          </button>
          <button
            className="btn primary"
            onClick={() => {
              addAssetsToCanvas(preview.map((a) => a.id));
              onClose();
            }}
          >
            Add {preview.length} to canvas
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <PropRow label="How many">
          <Slider value={n} min={1} max={Math.max(1, all.length)} onChange={setN} />
        </PropRow>
        <PropRow label="Distribution">
          <Seg
            small
            value={mode}
            onChange={setMode}
            options={[
              { value: 'any', label: 'Any' },
              { value: 'equal', label: 'Equal per category', title: 'Same number from each category' },
              { value: 'weighted', label: 'Weighted', title: 'Proportional to category size' },
            ]}
          />
        </PropRow>
        <div className="muted small">
          Never picks duplicates. {cats.length} categor{cats.length === 1 ? 'y' : 'ies'} in the library. Result:
        </div>
        <div className="row wrap">
          {byCat.map((c) => (
            <span key={c.name} className="chip">
              {c.count} {c.name || 'Uncategorized'}
            </span>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function SaveTemplateDialog({ onClose }: { onClose: () => void }) {
  const page = useDoc((s) => s.doc.pages.find((p) => p.id === s.doc.activePageId)!);
  const [name, setName] = useState(page.name + ' template');
  return (
    <Modal
      title="Save page as template"
      onClose={onClose}
      width={440}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={() => {
              void saveCurrentAsTemplate(name.trim() || 'Template');
              onClose();
            }}
          >
            Save template
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <PropRow label="Name">
          <input className="input sm" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </PropRow>
        <div className="hint">
          Keeps the canvas size, background, text, shapes, safe zone, focal region and the first layout (with its {page.layouts[0]?.slots.length ?? 0} slots). Asset images are not stored — the template is filled with any pack later. Background images only work inside this project.
        </div>
        <div className="muted small">{humanBytes(JSON.stringify(page).length)} of settings</div>
      </div>
    </Modal>
  );
}
