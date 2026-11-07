// Import from a project: take the look of pages in another saved project and keep it on this computer
// as a theme, a background or a template. The other project is only read; no assets are copied.

import { useEffect, useMemo, useState } from 'react';
import type { Page } from '../../core/types';
import { useDoc } from '../../state/doc';
import { saveCurrentAsTemplate } from '../../state/generators';
import { savePreset } from '../../state/presets';
import { saveThemeFromPage, themeDataFromPage, themeFromPreset } from '../../state/customPresets';
import { readProjectLibrary, type ProjectLibrary } from '../../state/project';
import { toast } from '../../state/ui';
import { completeBackground, BgThumb } from '../components/BgThumb';
import { Modal, Seg, Select } from '../components/controls';
import { PagePreview } from '../components/PagePreview';
import { ThemeThumb } from '../components/ThemeThumb';
import { useProjectList } from './ProjectDialogs';

type Kind = 'theme' | 'background' | 'template';
const KIND_NOTE: Record<Kind, string> = {
  theme: 'Saved to My themes: the page’s background, title look, subtitle colour and badge colours.',
  background: 'Saved to My backgrounds. An imported background image stays in its project, so its colour is used instead.',
  template: 'Saved to My templates: layout, text and look. Icons are not copied — the template fills with the icons of the project you use it in.',
};

const hasText = (p: Page) => p.objects.some((o) => o.type === 'text' && !o.hidden);
/** The page without project-specific images, for previews and saving. */
const withoutAssets = (p: Page): Page => ({ ...p, background: p.background.type === 'image' ? { ...completeBackground(p.background), type: 'solid' } : p.background });

export function ImportLooksDialog({ onClose, initial = 'theme' }: { onClose: () => void; initial?: Kind }) {
  const { list } = useProjectList();
  const current = useDoc((s) => s.doc.id);
  const projects = useMemo(() => (list ?? []).filter((p) => p.pages > 0), [list]);
  const [pid, setPid] = useState('');
  const [lib, setLib] = useState<ProjectLibrary | null>(null);
  const [kind, setKind] = useState<Kind>(initial);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (pid || !projects.length) return;
    setPid((projects.find((p) => p.id !== current) ?? projects[0]).id);
  }, [projects, pid, current]);
  useEffect(() => {
    if (!pid) return;
    let alive = true;
    setLib(null);
    setPicked(new Set());
    void readProjectLibrary(pid).then((l) => alive && setLib(l ?? null));
    return () => {
      alive = false;
    };
  }, [pid]);

  const pages = useMemo(() => (lib ? lib.pages.filter((p) => (kind === 'theme' ? hasText(p) : true)) : []), [lib, kind]);
  const toggle = (id: string) => {
    const n = new Set(picked);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setPicked(n);
  };
  const go = async () => {
    if (!lib) return;
    setBusy(true);
    try {
      let n = 0;
      for (const p of pages.filter((x) => picked.has(x.id))) {
        const name = `${p.name} · ${lib.name}`;
        const clean = withoutAssets(p);
        if (kind === 'theme') await saveThemeFromPage(name, clean);
        else if (kind === 'background') await savePreset('background', name, { ...clean.background, image: { ...clean.background.image, assetId: undefined } });
        else await saveCurrentAsTemplate(name, p, true);
        n++;
      }
      toast(`Imported ${n} ${kind}${n === 1 ? '' : 's'} from “${lib.name}”. That project did not change.`, 'success');
      onClose();
    } catch (e) {
      toast('Import failed: ' + (e instanceof Error ? e.message : String(e)), 'error');
      setBusy(false);
    }
  };
  const n = pages.filter((p) => picked.has(p.id)).length;
  return (
    <Modal
      title="Import from a project"
      onClose={onClose}
      width={920}
      footer={
        <>
          <span className="muted small grow">{KIND_NOTE[kind]}</span>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!n || busy} onClick={() => void go()}>
            {busy ? 'Importing…' : `Import ${n || ''} ${kind}${n === 1 ? '' : 's'}`}
          </button>
        </>
      }
    >
      {list && !projects.length ? (
        <div className="pap-empty">No saved projects yet.</div>
      ) : (
        <div className="il">
          <div className="pap-bar">
            <Select<string> className="pap-project" value={pid} onChange={setPid} options={projects.map((p) => ({ value: p.id, label: `${p.name}${p.id === current ? ' (open)' : ''} · ${p.pages} page${p.pages === 1 ? '' : 's'}` }))} />
            <Seg<Kind>
              small
              value={kind}
              onChange={(k) => {
                setKind(k);
                setPicked(new Set());
              }}
              options={[
                { value: 'theme', label: 'As themes' },
                { value: 'background', label: 'As backgrounds' },
                { value: 'template', label: 'As templates' },
              ]}
            />
            <span className="grow" />
            <button className="btn ghost sm" disabled={!pages.length} onClick={() => setPicked(new Set(pages.map((p) => p.id)))}>
              Select all
            </button>
            <button className="btn ghost sm" disabled={!picked.size} onClick={() => setPicked(new Set())}>
              Select none
            </button>
          </div>
          {!lib ? (
            <div className="pap-empty">Reading the project…</div>
          ) : !pages.length ? (
            <div className="pap-empty">{kind === 'theme' ? 'No page in this project has text to take a look from.' : 'This project has no pages.'}</div>
          ) : (
            <div className="il-grid">
              {pages.map((p) => {
                const on = picked.has(p.id);
                const theme = kind === 'theme' ? themeFromPreset({ id: 'preview', kind: 'theme', name: p.name, createdAt: 0, data: themeDataFromPage(withoutAssets(p)) }) : null;
                return (
                  <button key={p.id} className={`il-card ${on ? 'on' : ''}`} onClick={() => toggle(p.id)} aria-pressed={on}>
                    <div className="il-thumb checker">
                      {kind === 'theme' && theme ? <ThemeThumb theme={theme} /> : kind === 'background' ? <BgThumb bg={withoutAssets(p).background} /> : <PagePreview cacheKey={`il|${lib.id}|${p.id}`} width={260} build={() => withoutAssets({ ...p, objects: p.objects.filter((o) => o.type !== 'image') })} className="fill" />}
                    </div>
                    <span className="il-name">
                      <input type="checkbox" tabIndex={-1} readOnly checked={on} aria-hidden />
                      <span className="ellipsis">{p.name}</span>
                      <small>
                        {p.width}×{p.height}
                      </small>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
