// New page: name and size on top, then either a blank canvas size or a template, each in one
// grid you can filter by category or search, then a summary with the matching Create button.
// Popular sizes show first, so the usual page takes two clicks. Every canvas preset and every
// built-in template is here. Enter creates, Escape cancels, a double-click on a card creates it.

import { useMemo, useState } from 'react';
import { ArrowLeftRight, Search } from 'lucide-react';
import { CANVAS_GROUPS, CANVAS_PRESETS, createPage, presetName } from '../../core/defaults';
import { getDoc } from '../../state/doc';
import { BUILTIN_TEMPLATES, createFromTemplate, previewTemplate, TEMPLATE_GROUPS, templateGroup, workingAssets, type TemplateDef } from '../../state/generators';
import { addPage, renamePage } from '../../state/pages';
import { Modal, NumberField } from '../components/controls';
import { PagePreview } from '../components/PagePreview';

type Tab = 'blank' | 'template';

function ratioLabel(w: number, h: number) {
  const g = (a: number, b: number): number => (b ? g(b, a % b) : a);
  const d = g(w, h);
  const a = w / d,
    b = h / d;
  return a <= 32 && b <= 32 ? `${a}:${b}` : (w / h).toFixed(2);
}

function SizeCard({ w, h, title, on, onPick, onCreate }: { w: number; h: number; title: string; on: boolean; onPick: () => void; onCreate: () => void }) {
  const k = 52 / Math.max(w, h);
  return (
    <button className={`np-card npd-size ${on ? 'on' : ''}`} aria-pressed={on} onClick={onPick} onDoubleClick={onCreate} title={`${title} · ${w} × ${h}`}>
      <div className="np-ratio">
        <div style={{ width: Math.max(6, w * k), height: Math.max(6, h * k) }} />
      </div>
      <b>{title}</b>
      <small>
        {w} × {h}
      </small>
    </button>
  );
}

function TemplateCard({ t, i, on, onPick, onCreate }: { t: TemplateDef; i: number; on: boolean; onPick: () => void; onCreate: () => void }) {
  return (
    <button className={`np-card npd-tpl ${on ? 'on' : ''}`} aria-pressed={on} onClick={onPick} onDoubleClick={onCreate} title={t.description}>
      <div className="npd-thumb">
        <PagePreview cacheKey={`npd|${t.id}|${workingAssets().length}`} width={200} delay={60 + (i % 24) * 40} build={() => previewTemplate(t, workingAssets(), undefined, 60)} />
      </div>
      <b>{t.name}</b>
      <small>
        {t.w} × {t.h}
      </small>
    </button>
  );
}

export function NewPageDialog({ onClose }: { onClose: () => void }) {
  const doc = getDoc();
  const cur = doc.pages.find((p) => p.id === doc.activePageId) ?? doc.pages[0];
  const [tab, setTab] = useState<Tab>('blank');
  const [name, setName] = useState('');
  const [size, setSize] = useState({ w: cur.width, h: cur.height });
  const [group, setGroup] = useState<string>('Popular');
  const [tplGroup, setTplGroup] = useState<string>('All');
  const [q, setQ] = useState('');
  const [tplId, setTplId] = useState<string | null>(null);
  // a template starts at its own size; editing the size builds it for that format instead
  const [tplSize, setTplSize] = useState<{ w: number; h: number } | null>(null);
  const tpl = tplId ? BUILTIN_TEMPLATES.find((t) => t.id === tplId) : undefined;
  const isTpl = tab === 'template' && !!tpl;
  const w = isTpl ? tplSize?.w ?? tpl!.w : size.w,
    h = isTpl ? tplSize?.h ?? tpl!.h : size.h;
  const needle = q.trim().toLowerCase().replace(/(\d)\s*x\s*(\d)/g, '$1×$2');
  const icons = workingAssets().length;

  const sizes = useMemo(() => {
    if (needle) return CANVAS_PRESETS.filter((p) => `${p.label} ${p.group}`.toLowerCase().includes(needle));
    return group === 'Popular' ? CANVAS_PRESETS.filter((p) => p.popular) : CANVAS_PRESETS.filter((p) => p.group === group);
  }, [group, needle]);
  const templates = useMemo(() => BUILTIN_TEMPLATES.filter((t) => (tplGroup === 'All' || templateGroup(t) === tplGroup) && (!needle || `${t.name} ${t.description} ${templateGroup(t)} ${t.w}×${t.h}`.toLowerCase().includes(needle))), [tplGroup, needle]);

  const setW = (v: number) => (isTpl ? setTplSize({ w: v, h }) : setSize({ w: v, h }));
  const setH = (v: number) => (isTpl ? setTplSize({ w, h: v }) : setSize({ w, h: v }));
  const swap = () => (isTpl ? setTplSize({ w: h, h: w }) : setSize({ w: h, h: w }));

  const createBlank = (ow = w, oh = h) => {
    addPage(createPage(name.trim() || `Page ${doc.pages.length + 1}`, ow, oh, structuredClone(cur.background)));
    onClose();
  };
  const createTemplate = (t = tpl) => {
    if (!t) return;
    const sz = t === tpl && tplSize && (tplSize.w !== t.w || tplSize.h !== t.h) ? tplSize : undefined;
    // “New page” always adds a page, whatever the Templates-tab preference says
    createFromTemplate(t, workingAssets(), undefined, { text: 'keep', icons: 1, size: sz }, 'new');
    // the new page is the active one
    if (name.trim()) renamePage(getDoc().activePageId, name.trim());
    onClose();
  };
  const create = () => (isTpl ? createTemplate() : createBlank());
  const matching = CANVAS_PRESETS.find((p) => p.w === w && p.h === h && p.popular) ?? CANVAS_PRESETS.find((p) => p.w === w && p.h === h);

  return (
    <Modal
      title="New page"
      onClose={onClose}
      width={1000}
      footer={
        <>
          <span className="muted small grow npd-summary">
            {isTpl ? (
              <>
                <b>{tpl!.name}</b> · {w} × {h}
                {tplSize ? ' (rebuilt for this size)' : ''} · {icons} icon{icons === 1 ? '' : 's'}
              </>
            ) : (
              <>
                <b>Blank page</b> · {w} × {h} · {ratioLabel(w, h)}
                {matching ? ` · ${presetName(matching.label)}` : ''} · background of the current page
              </>
            )}
          </span>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          {isTpl ? (
            <button className="btn primary" onClick={() => createTemplate()}>
              Create from template
            </button>
          ) : (
            <button className="btn primary" onClick={() => createBlank()} disabled={w < 16 || h < 16}>
              Create blank page
            </button>
          )}
        </>
      }
    >
      <div className="npd" onKeyDown={(e) => e.key === 'Enter' && !(e.target as HTMLElement).closest('button') && (e.preventDefault(), create())}>
        <div className="npd-top">
          <label className="npd-field npd-name">
            <span>Name</span>
            <input className="input sm" autoFocus placeholder={isTpl ? tpl!.name : `Page ${doc.pages.length + 1}`} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key !== 'Enter' && e.stopPropagation()} />
          </label>
          <label className="npd-field">
            <span>Width</span>
            <NumberField value={w} min={16} max={16384} unit="px" width={104} onChange={setW} />
          </label>
          <button className="btn ghost icon sm npd-swap" title="Swap width and height" aria-label="Swap width and height" onClick={swap}>
            <ArrowLeftRight size={14} />
          </button>
          <label className="npd-field">
            <span>Height</span>
            <NumberField value={h} min={16} max={16384} unit="px" width={104} onChange={setH} />
          </label>
          <span className="muted small mono npd-ratio" title="Aspect ratio">
            {ratioLabel(w, h)}
          </span>
        </div>

        <div className="npd-bar">
          <div className="np-tabs" role="tablist" aria-label="Start from">
            <button role="tab" aria-selected={tab === 'blank'} className={tab === 'blank' ? 'on' : ''} onClick={() => setTab('blank')}>
              Blank page
            </button>
            <button role="tab" aria-selected={tab === 'template'} className={tab === 'template' ? 'on' : ''} onClick={() => setTab('template')}>
              From a template
            </button>
          </div>
          <div className="search npd-search">
            <Search size={13} />
            <input className="input sm" placeholder={tab === 'blank' ? 'Search sizes' : 'Search templates'} aria-label={tab === 'blank' ? 'Search sizes' : 'Search templates'} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key !== 'Enter' && e.stopPropagation()} />
          </div>
        </div>

        <div className="chips npd-groups" role="group" aria-label={tab === 'blank' ? 'Size categories' : 'Template categories'}>
          {(tab === 'blank' ? ['Popular', ...CANVAS_GROUPS] : ['All', ...TEMPLATE_GROUPS.map((g) => g.id)]).map((g) => {
            const on = !needle && (tab === 'blank' ? group === g : tplGroup === g);
            return (
              <button key={g} className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => (setQ(''), tab === 'blank' ? setGroup(g) : setTplGroup(g))}>
                {g}
              </button>
            );
          })}
        </div>

        <div className="npd-list">
          {tab === 'blank' ? (
            sizes.length ? (
              <div className="np-grid npd-sizes">
                {sizes.map((p) => (
                  <SizeCard
                    key={p.label}
                    w={p.w}
                    h={p.h}
                    title={presetName(p.label)}
                    on={size.w === p.w && size.h === p.h}
                    onPick={() => setSize({ w: p.w, h: p.h })}
                    onCreate={() => createBlank(p.w, p.h)}
                  />
                ))}
              </div>
            ) : (
              <div className="pap-empty">No size matches. Type the width and height above for a custom size.</div>
            )
          ) : templates.length ? (
            <div className="np-grid npd-templates">
              {templates.map((t, i) => (
                <TemplateCard
                  key={t.id}
                  t={t}
                  i={i}
                  on={tplId === t.id}
                  onPick={() => {
                    if (tplId !== t.id) setTplSize(null);
                    setTplId(t.id);
                  }}
                  onCreate={() => createTemplate(t)}
                />
              ))}
            </div>
          ) : (
            <div className="pap-empty">No template matches.</div>
          )}
        </div>
        {tab === 'template' && tpl && <div className="hint npd-desc">{tpl.description}</div>}
      </div>
    </Modal>
  );
}
