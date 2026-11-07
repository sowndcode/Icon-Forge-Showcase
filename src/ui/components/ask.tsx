// In-app replacements for window.prompt / window.confirm. The desktop shell (Electron) does not
// implement prompt() at all, and the native boxes look out of place — these match the app.

import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { Modal } from './controls';

interface AskRequest {
  kind: 'text' | 'confirm' | 'choice';
  choices?: { value: string; label: string; primary?: boolean }[];
  title: string;
  message?: string;
  value?: string;
  placeholder?: string;
  okLabel: string;
  danger?: boolean;
  resolve: (v: string | boolean | null) => void;
}

const useAsk = create<{ req: AskRequest | null }>(() => ({ req: null }));

/** Ask for a line of text. Resolves to the trimmed text, or null when cancelled / left empty. */
export function askText(o: { title: string; message?: string; value?: string; placeholder?: string; okLabel?: string }): Promise<string | null> {
  return new Promise((resolve) => {
    useAsk.getState().req?.resolve(null);
    useAsk.setState({ req: { kind: 'text', okLabel: 'OK', ...o, resolve: (v) => resolve(typeof v === 'string' && v.trim() ? v.trim() : null) } });
  });
}

/** Ask a yes/no question. `danger` styles the confirm button red. */
export function askConfirm(o: { title: string; message?: string; okLabel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    useAsk.getState().req?.resolve(false);
    useAsk.setState({ req: { kind: 'confirm', okLabel: o.danger ? 'Delete' : 'OK', ...o, resolve: (v) => resolve(v === true) } });
  });
}

/** Ask to pick one of several answers (buttons, the last one primary unless marked). Resolves to null on cancel. */
export function askChoice(o: { title: string; message?: string; choices: { value: string; label: string; primary?: boolean }[] }): Promise<string | null> {
  return new Promise((resolve) => {
    useAsk.getState().req?.resolve(null);
    useAsk.setState({ req: { kind: 'choice', okLabel: '', ...o, resolve: (v) => resolve(typeof v === 'string' ? v : null) } });
  });
}

export function AskHost() {
  const req = useAsk((s) => s.req);
  const [value, setValue] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const okBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!req) return;
    setValue(req.value ?? '');
    setTimeout(() => {
      if (req.kind === 'text') {
        input.current?.focus();
        input.current?.select();
      } else okBtn.current?.focus();
    }, 20);
  }, [req]);
  if (!req) return null;
  const close = (v: string | boolean | null) => {
    useAsk.setState({ req: null });
    req.resolve(v);
  };
  const ok = () => close(req.kind === 'text' ? value : true);
  return (
    <Modal
      title={req.title}
      onClose={() => close(req.kind === 'confirm' ? false : null)}
      width={440}
      footer={
        req.kind === 'choice' ? (
          <>
            <button className="btn ghost" onClick={() => close(null)}>
              Cancel
            </button>
            {req.choices!.map((c, i) => (
              <button key={c.value} ref={c.primary || (i === req.choices!.length - 1 && !req.choices!.some((x) => x.primary)) ? okBtn : undefined} className={`btn ${c.primary || (i === req.choices!.length - 1 && !req.choices!.some((x) => x.primary)) ? 'primary' : ''}`} onClick={() => close(c.value)}>
                {c.label}
              </button>
            ))}
          </>
        ) : (
        <>
          <button className="btn" onClick={() => close(req.kind === 'text' ? null : false)}>
            Cancel
          </button>
          <button ref={okBtn} className={`btn ${req.danger ? 'solid-danger' : 'primary'}`} disabled={req.kind === 'text' && !value.trim()} onClick={ok}>
            {req.okLabel}
          </button>
        </>
        )
      }
    >
      <div className="ask">
        {req.message && <p className="ask-msg">{req.message}</p>}
        {req.kind === 'text' && (
          <input
            ref={input}
            className="input"
            value={value}
            placeholder={req.placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter' && value.trim()) ok();
            }}
          />
        )}
      </div>
    </Modal>
  );
}
