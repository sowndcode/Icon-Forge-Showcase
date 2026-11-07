// Import a Share Code (paste → checked → preview → add to My themes / My templates), or show a code
// to copy by hand when the clipboard isn't available.

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import { ShareCodeError, type CustomTemplateData, type CustomThemeData, type SharedItem } from '../../core/shareCode';
import { importSharedItem, readShareCode, themeFromPreset } from '../../state/customPresets';
import { previewUserTemplate, workingAssets } from '../../state/generators';
import { toast, useUI } from '../../state/ui';
import { Modal } from '../components/controls';
import { PagePreview } from '../components/PagePreview';
import { ThemeThumb } from '../components/ThemeThumb';

export type ShareDialogArg = { mode: 'import'; kind?: 'theme' | 'template' } | { mode: 'show'; code: string; name: string };

export function ShareCodeDialog({ onClose }: { onClose: () => void }) {
  const arg = (useUI((s) => s.dialogArg) ?? { mode: 'import' }) as ShareDialogArg;
  return arg.mode === 'show' ? <ShowCode code={arg.code} name={arg.name} onClose={onClose} /> : <ImportCode onClose={onClose} />;
}

function ShowCode({ code, name, onClose }: { code: string; name: string; onClose: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <Modal title={`Share code for “${name}”`} onClose={onClose} width={520} footer={<button className="btn primary" onClick={onClose}>Done</button>}>
      <p className="hint" style={{ marginTop: 0 }}>
        The clipboard isn't available here. The code is selected below — press Ctrl+C to copy it.
      </p>
      <textarea ref={ref} className="input mono share-code" readOnly value={code} rows={6} />
    </Modal>
  );
}

function ImportCode({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const parsed = useMemo((): { item?: SharedItem; error?: string } => {
    if (!text.trim()) return {};
    try {
      return { item: readShareCode(text) };
    } catch (e) {
      return { error: e instanceof ShareCodeError ? e.message : 'This code could not be read.' };
    }
  }, [text]);
  const item = parsed.item;
  // suggest the code's own name, until the user types one
  const lastSuggested = useRef('');
  useEffect(() => {
    if (item && (name === '' || name === lastSuggested.current)) {
      setName(item.name);
      lastSuggested.current = item.name;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);
  const add = async () => {
    if (!item || busy) return;
    setBusy(true);
    try {
      await importSharedItem(item, name.trim() || item.name);
      onClose();
    } catch (e) {
      // nothing was added: say so and keep the dialog open to try again
      toast('Could not add it: ' + (e instanceof Error ? e.message : String(e)), 'error');
      setBusy(false);
    }
  };
  const theme = item?.kind === 'theme' ? themeFromPreset({ id: 'preview', kind: 'theme', name: item.name, createdAt: 0, data: item.data as CustomThemeData }) : null;
  return (
    <Modal
      title="Import share code"
      onClose={onClose}
      width={560}
      footer={
        <>
          <span className="grow" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!item || busy} onClick={() => void add()}>
            {item ? `Add to ${item.kind === 'theme' ? 'My themes' : 'My templates'}` : 'Add'}
          </button>
        </>
      }
    >
      <div className="share-import">
        <label className="field">
          <span className="field-label">Code</span>
          <textarea
            className="input mono share-code"
            rows={4}
            autoFocus
            placeholder="IFS1-THEME-… or IFS1-TEMPLATE-…"
            value={text}
            spellCheck={false}
            onChange={(e) => setText(e.target.value)}
            aria-invalid={!!parsed.error}
            aria-describedby="share-status"
          />
        </label>
        <div id="share-status" role="status" aria-live="polite">
          {parsed.error && (
            <div className="share-status bad">
              <AlertTriangle size={14} /> {parsed.error}
            </div>
          )}
          {item && (
            <div className="share-status ok">
              <Check size={14} /> A valid {item.kind}. Check the preview, then add it.
            </div>
          )}
        </div>
        {item && (
          <>
            <div className="share-preview checker">
              {theme ? (
                <ThemeThumb theme={theme} />
              ) : (
                <PagePreview cacheKey={`share|${text.length}|${text.slice(-24)}`} width={520} build={() => previewUserTemplate(item.data as CustomTemplateData, workingAssets())} className="fill" />
              )}
            </div>
            <label className="field">
              <span className="field-label">Name</span>
              <input className="input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void add()} />
            </label>
            {item.notes.length > 0 && (
              <ul className="share-notes">
                {item.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
          </>
        )}
        {!text && <p className="hint">Codes hold a theme's or template's design only, never images or project files. Importing never changes the built-in themes and templates.</p>}
      </div>
    </Modal>
  );
}
