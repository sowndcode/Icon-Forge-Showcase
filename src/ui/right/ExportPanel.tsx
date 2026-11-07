// Export settings + single / batch export. The main action and a live preview sit at the top;
// the size estimate is cached per page version and never runs while something is being dragged.

import { guideAction } from '../../state/guideProgress';
import { useEffect, useMemo, useState } from 'react';
import { Download, FileArchive, FolderDown, Save, Trash2 } from 'lucide-react';
import { BUILTIN_EXPORT_PRESETS } from '../../core/defaults';
import type { ExportFormat, ExportSettings, Page } from '../../core/types';
import { batchNames, estimateBytes, exportProblem, exportSize, NAME_TOKENS, runExport, withoutBackground, zipNameFor } from '../../services/exporter';
import { humanBytes } from '../../services/formats';
import { getAsset, getDoc, inGesture, useDoc, activePageOf } from '../../state/doc';
import { usePrefs } from '../../state/prefs';
import { renameProject } from '../../state/project';
import { deletePreset, savePreset, usePresets } from '../../state/presets';
import { openExport, toast, useUI } from '../../state/ui';
import { wmAppliesTo } from '../../core/watermark';
import { getWatermark, wmVars } from '../../state/watermark';
import { ColorField, NumberField, PropRow, Section, Seg, Slider, Toggle } from '../components/controls';
import { PagePreview } from '../components/PagePreview';
import { askText } from '../components/ask';

export async function doExport(pageIds: string[], s: ExportSettings) {
  const doc = getDoc();
  await exportPages(doc.pages.filter((p) => pageIds.includes(p.id)), s);
}

/** Export any pages, including ones not added to the project (variations). */
export async function exportPages(pages: Page[], s: ExportSettings) {
  const doc = getDoc();
  if (!pages.length) return;
  const signal = { cancelled: false };
  const cancel = () => {
    signal.cancelled = true;
    useUI.setState((u) => ({ task: u.task ? { ...u.task, label: 'Stopping…', cancel: undefined } : null }));
  };
  useUI.setState({ task: { label: 'Exporting', done: 0, total: pages.length, cancel } });
  try {
    const res = await runExport({ doc, pages, settings: s, getAsset, signal, watermark: { watermark: getWatermark(doc), vars: wmVars(doc) }, onProgress: (label, done, total) => useUI.setState({ task: signal.cancelled ? useUI.getState().task : { label, done, total, cancel } }) });
    if (res.cancelled) {
      if (signal.cancelled) toast(res.ok ? `Stopped — ${res.ok} image${res.ok === 1 ? '' : 's'} were saved before you cancelled` : 'Export cancelled', 'info');
      return;
    }
    if (res.failed.length) toast(`Export failed for ${res.failed.map((f) => `${f.page}: ${f.error}`).join('; ')}`, 'error', 8000);
    if (res.ok) guideAction('export');
    if (res.ok === 1) toast(`Saved ${res.written[0]}`, 'success');
    else if (res.ok && res.written.length === 1) toast(`Saved ${res.ok} images in ${res.written[0]}`, 'success', 6000);
    else if (res.ok) toast(`Exported ${res.ok} images (${res.written[0]} … ${res.written[res.written.length - 1]})`, 'success', 6000);
  } catch (e) {
    toast('Export failed: ' + (e instanceof Error ? e.message : String(e)), 'error', 8000);
  } finally {
    useUI.setState({ task: null });
  }
}

// A stable version number per page object, so previews and size estimates are cached per edit.
const versions = new WeakMap<Page, number>();
let nextVersion = 1;
function pageVersion(p: Page) {
  let v = versions.get(p);
  if (!v) versions.set(p, (v = nextVersion++));
  return v;
}

// Size estimates cost a small render + encode; cache them per page version and settings.
const estimates = new Map<string, number>();

function useEstimate(page: Page, s: ExportSettings) {
  const key = `${page.id}|${pageVersion(page)}|${s.format}|${s.quality}|${s.scale}|${s.customWidth ?? ''}|${s.transparent ? 1 : 0}|${s.matte}`;
  const [value, setValue] = useState<number | null>(() => estimates.get(key) ?? null);
  useEffect(() => {
    const hit = estimates.get(key);
    if (hit !== undefined) return setValue(hit);
    setValue(null);
    let cancelled = false;
    let t: ReturnType<typeof setTimeout>;
    // wait until editing pauses; never run while something is being dragged
    const run = () => {
      if (cancelled) return;
      if (inGesture()) {
        t = setTimeout(run, 500);
        return;
      }
      if (exportProblem(page, s)) return;
      const pg = s.transparent && s.format !== 'jpeg' ? withoutBackground(page) : page;
      estimateBytes(pg, getAsset, s)
        .then((b) => {
          if (estimates.size > 200) estimates.clear();
          estimates.set(key, b);
          if (!cancelled) setValue(b);
        })
        .catch(() => {
          if (!cancelled) setValue(null);
        });
    };
    t = setTimeout(run, 900);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return value;
}

/** One-click output setups shown as chips at the top. */
const QUICK: { label: string; title: string; settings: Partial<ExportSettings> }[] = [
  { label: 'PNG', title: 'Lossless PNG at the page size', settings: { format: 'png', scale: 1, customWidth: undefined, transparent: false } },
  { label: 'itch.io cover', title: 'PNG, 630 px wide (the itch.io cover size)', settings: { format: 'png', scale: 1, customWidth: 630, transparent: false } },
  { label: 'Screenshot', title: 'JPG 92%, 1280 px wide — small and sharp for store galleries', settings: { format: 'jpeg', quality: 0.92, scale: 1, customWidth: 1280, transparent: false } },
  { label: 'Hi-res 2×', title: 'PNG at twice the page size', settings: { format: 'png', scale: 2, customWidth: undefined, transparent: false } },
  { label: 'Transparent', title: 'PNG without the background — icons and text only', settings: { format: 'png', scale: 1, customWidth: undefined, transparent: true } },
];

const sameSettings = (s: ExportSettings, q: Partial<ExportSettings>) =>
  (Object.keys(q) as (keyof ExportSettings)[]).every((k) => (k === 'transparent' ? !!s[k] === !!q[k] : (s[k] ?? undefined) === (q[k] ?? undefined)));

export function ExportPanel() {
  const s = usePrefs((p) => p.exportSettings);
  const setPrefs = usePrefs((p) => p.setPrefs);
  const set = (patch: Partial<ExportSettings>) => setPrefs({ exportSettings: { ...s, ...patch } });
  // narrow subscriptions: only pages, the project name and the active page matter here
  const pages = useDoc((d) => d.doc.pages);
  const docName = useDoc((d) => d.doc.name);
  const page = useDoc((d) => activePageOf(d.doc));
  const doc = getDoc();
  const [checked, setChecked] = useState<string[]>(() => pages.map((p) => p.id));
  const [showTokens, setShowTokens] = useState(false);
  const saved = usePresets<ExportSettings>('export');
  const { w, h } = exportSize(page, s);
  const problem = exportProblem(page, s);
  const estimate = useEstimate(page, s);
  const hasAlpha = s.format !== 'jpeg' && (!!s.transparent || page.background.type === 'transparent' || (page.background.type === 'image' && page.background.image.opacity < 1));
  useEffect(() => setChecked((c) => c.filter((id) => pages.some((p) => p.id === id))), [pages]);
  const scaleMode = s.customWidth ? 'custom' : String(s.scale);
  const batch = useMemo(() => pages.filter((p) => checked.includes(p.id)), [pages, checked]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const singleName = useMemo(() => batchNames(doc, [page], s)[0], [docName, page, s]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const batchList = useMemo(() => batchNames(doc, batch, s), [docName, batch, s]);
  const insertToken = (t: string) => set({ pattern: s.pattern + (s.pattern && !/[_\-\s]$/.test(s.pattern) ? '_' : '') + t });
  const previewPage = s.transparent && s.format !== 'jpeg' ? withoutBackground(page) : page;
  const wmOn = pages.some((p) => wmAppliesTo(getWatermark(doc), p.id));
  return (
    <>
      <div className="exp-hero">
        <div className={`exp-thumb ${hasAlpha ? 'checker' : ''}`}>
          <PagePreview cacheKey={`exp|${page.id}|${pageVersion(page)}|${s.transparent && s.format !== 'jpeg' ? 't' : ''}`} width={260} delay={350} build={() => previewPage} className="fill" />
        </div>
        <div className="exp-facts">
          <b className="ellipsis" title={singleName}>
            {singleName}
          </b>
          <span>
            {w} × {h} px · {s.format === 'jpeg' ? 'JPG' : s.format.toUpperCase()}
            {s.format !== 'png' ? ` ${Math.round(s.quality * 100)}%` : ''}
            {hasAlpha ? ' · transparent' : ''}
          </span>
          <span>{problem ? <span className="warn-text">{problem}</span> : estimate === null ? 'Estimating file size…' : `About ${humanBytes(Math.round(estimate))}`}</span>
        </div>
        <button className="btn primary block lg" disabled={!!problem} onClick={() => void doExport([page.id], s)}>
          <Download size={15} /> Export this page
        </button>
        <div className="exp-quick">
          {QUICK.map((q) => (
            <button key={q.label} className={`chip ${sameSettings(s, q.settings) ? 'on' : ''}`} title={q.title} onClick={() => set(q.settings)}>
              {q.label}
            </button>
          ))}
        </div>
      </div>

      {pages.length > 1 && (
        <Section title={`Several pages · ${checked.length} of ${pages.length}`} id="exp-batch">
          <div className="exp-sub">
            <span className="row">
              <button className="btn ghost sm" onClick={() => setChecked(pages.map((p) => p.id))}>
                All
              </button>
              <button className="btn ghost sm" onClick={() => setChecked([])}>
                None
              </button>
            </span>
            <Seg
              small
              value={s.saveAs ?? 'folder'}
              onChange={(saveAs) => set({ saveAs })}
              options={[
                { value: 'folder', label: 'Folder', title: 'One image file per page, in a folder you choose' },
                { value: 'zip', label: 'ZIP', title: 'All images packed into one .zip — easy to upload or send' },
              ]}
            />
          </div>
          <div className="check-list">
            {pages.map((p, i) => {
              const k = batch.indexOf(p);
              const sz = exportSize(p, s);
              return (
                <label key={p.id}>
                  <input type="checkbox" checked={checked.includes(p.id)} onChange={(e) => setChecked(e.target.checked ? [...checked, p.id] : checked.filter((x) => x !== p.id))} />
                  <span className="grow ellipsis" title={k >= 0 ? batchList[k] : undefined}>
                    {k >= 0 ? batchList[k] : p.name || `Page ${i + 1}`}
                  </span>
                  <small>
                    {sz.w}×{sz.h}
                  </small>
                </label>
              );
            })}
          </div>
          <button className="btn block lg" disabled={!checked.length} onClick={() => void doExport(checked, s)}>
            {s.saveAs === 'zip' ? <FileArchive size={15} /> : <FolderDown size={15} />}
            Export {checked.length === pages.length ? `all ${checked.length}` : checked.length} pages {s.saveAs === 'zip' ? `as ${zipNameFor(doc)}` : 'to a folder'}
          </button>
        </Section>
      )}

      <Section title="Format" id="exp-format">
        <Seg<ExportFormat>
          value={s.format}
          onChange={(format) => set({ format })}
          options={[
            { value: 'png', label: 'PNG', title: 'Lossless, keeps transparency' },
            { value: 'webp', label: 'WebP', title: 'Small, keeps transparency' },
            { value: 'jpeg', label: 'JPG', title: 'Smallest, no transparency' },
          ]}
        />
        {s.format !== 'png' && (
          <PropRow label="Quality">
            <Slider value={s.quality} min={0.4} max={1} step={0.01} scale={100} unit="%" onChange={(quality) => set({ quality })} />
          </PropRow>
        )}
        {s.format === 'jpeg' ? (
          <PropRow label="Matte" title="JPG has no transparency — transparent areas become this color">
            <ColorField value={s.matte} onChange={(matte) => set({ matte })} />
          </PropRow>
        ) : (
          <PropRow label="No background" title="Leave the background out: only icons, text and shapes, on transparency">
            <Toggle checked={!!s.transparent} onChange={(transparent) => set({ transparent })} />
          </PropRow>
        )}
      </Section>

      <Section title="Size" id="exp-size">
        <Seg
          value={scaleMode}
          onChange={(v) => (v === 'custom' ? set({ customWidth: page.width }) : set({ scale: +v, customWidth: undefined }))}
          options={[
            { value: '1', label: '1×' },
            { value: '2', label: '2×' },
            { value: '4', label: '4×' },
            { value: 'custom', label: 'Width…' },
          ]}
        />
        {s.customWidth !== undefined && (
          <PropRow label="Width">
            <NumberField value={s.customWidth} min={16} max={16384} unit="px" onChange={(customWidth) => set({ customWidth })} />
          </PropRow>
        )}
      </Section>

      <Section title="File name" id="exp-names">
        <PropRow label="Project" title="Used as {project} in file names">
          <input className="input sm" value={docName} onChange={(e) => renameProject(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
        </PropRow>
        <PropRow label="Pattern" title="Text and tokens. Type anything you like, e.g. my_icons_cover">
          <input className="input sm mono" value={s.pattern} placeholder="{project}_{page}" onChange={(e) => set({ pattern: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
        </PropRow>
        <div className="exp-tokens">
          {(showTokens ? NAME_TOKENS : NAME_TOKENS.slice(0, 4)).map((t) => (
            <button key={t.token} className="chip mono" title={`${t.label} — click to add`} onClick={() => insertToken(t.token)}>
              {t.token}
            </button>
          ))}
          {NAME_TOKENS.length > 4 && (
            <button className="btn ghost sm" onClick={() => setShowTokens(!showTokens)}>
              {showTokens ? 'Less' : `+${NAME_TOKENS.length - 4} more`}
            </button>
          )}
        </div>
        <PropRow label="If file exists" title="When the export folder already contains a file with the same name">
          <Seg
            small
            value={s.onConflict ?? 'number'}
            onChange={(onConflict) => set({ onConflict })}
            options={[
              { value: 'number', label: 'Keep both', title: 'Add a number: name_2.png' },
              { value: 'overwrite', label: 'Replace', title: 'Overwrite the existing file' },
            ]}
          />
        </PropRow>
      </Section>

      {wmOn && (
        <Section title="Watermark" id="exp-wm">
          <Seg
            small
            value={s.watermark ?? 'project'}
            onChange={(watermark) => set({ watermark })}
            options={[
              { value: 'project', label: 'With', title: 'The project watermark' },
              { value: 'none', label: 'Without', title: 'Clean files' },
              { value: 'both', label: 'Both', title: 'A clean file and a “_preview” file per page' },
            ]}
          />
        </Section>
      )}
      <div style={{ padding: '8px 16px' }}>
        <button className="btn ghost sm" onClick={openExport} title="Bigger preview, page list, presets and names side by side">
          Open the Export workspace
        </button>
      </div>

      <Section title="Presets" id="exp-presets" defaultOpen={false}>
        <div className="preset-stack">
          {BUILTIN_EXPORT_PRESETS.map((p) => (
            <button key={p.name} className="preset-row" onClick={() => set({ customWidth: undefined, ...p.settings })}>
              {p.name}
            </button>
          ))}
          {saved.map((p) => (
            <span key={p.id} className="preset-row-wrap">
              <button className="preset-row" onClick={() => set(p.data)}>
                {p.name}
              </button>
              <button className="btn ghost icon sm" title="Delete preset" onClick={() => void deletePreset(p.id)}>
                <Trash2 size={11} />
              </button>
            </span>
          ))}
        </div>
        <button
          className="btn sm"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => {
            void askText({ title: 'Save export preset', value: 'My export', okLabel: 'Save' }).then((name) => {
              if (name) void savePreset('export', name, s);
            });
          }}
        >
          <Save size={12} /> Save current settings
        </button>
      </Section>
    </>
  );
}
