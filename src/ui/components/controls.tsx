import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronRight, Pipette, X } from 'lucide-react';
import { BASIC_SWATCHES, pushRecentColor, useSwatches } from './colorSwatches';

/**
 * Numeric input. Commits on Enter/blur; arrow keys step (Shift = ×10).
 * Drag on the label (when `scrub` is given) to scrub values.
 */
export function NumberField({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  decimals = 0,
  disabled,
  title,
  width,
  placeholder,
}: {
  value: number | null;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  decimals?: number;
  disabled?: boolean;
  title?: string;
  width?: number;
  placeholder?: string;
}) {
  const fmt = (v: number | null) => (v === null || !Number.isFinite(v) ? '' : decimals ? String(+v.toFixed(decimals)) : String(Math.round(v)));
  const [text, setText] = useState(fmt(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const commit = (raw: string) => {
    let v = parseFloat(raw);
    if (!Number.isFinite(v)) return setText(fmt(value));
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    if (!decimals) v = Math.round(v);
    setText(fmt(v));
    if (v !== value) onChange(v);
  };
  return (
    <div className="num-field" title={title} style={width ? { width, flex: 'none' } : undefined}>
      <input
        value={text}
        disabled={disabled}
        placeholder={placeholder ?? (value === null ? 'Mixed' : undefined)}
        inputMode="decimal"
        onFocus={(e) => {
          focused.current = true;
          e.target.select();
        }}
        onBlur={(e) => {
          focused.current = false;
          commit(e.target.value);
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setText(fmt(value));
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const d = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
            const base = parseFloat(text);
            const next = (Number.isFinite(base) ? base : value ?? 0) + d;
            commit(String(next));
            setText(fmt(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, next))));
          }
          e.stopPropagation();
        }}
      />
      {unit && <span className="unit">{unit}</span>}
    </div>
  );
}

export function Labeled({ label, children, wide, title }: { label: ReactNode; children: ReactNode; wide?: boolean; title?: string }) {
  return (
    <div className={'lbl-field' + (wide ? ' wide' : '')} title={title}>
      <span>{label}</span>
      {children}
    </div>
  );
}

export function Slider({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  decimals = 0,
  scale = 1,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  decimals?: number;
  /** display multiplier (e.g. 100 to show 0.75 as 75) */
  scale?: number;
  disabled?: boolean;
}) {
  return (
    <div className="slider-row">
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(parseFloat(e.target.value))} onKeyDown={(e) => e.stopPropagation()} />
      <NumberField value={value * scale} decimals={decimals} step={step * scale} unit={unit} disabled={disabled} onChange={(v) => onChange(v / scale)} />
    </div>
  );
}

export function Toggle({ checked, onChange, disabled, title }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; title?: string }) {
  return (
    <label className="switch" title={title} onClick={(e) => e.stopPropagation()}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </label>
  );
}

export function Seg<T extends string | number>({ value, options, onChange, small }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; small?: boolean }) {
  return (
    <div className="seg" style={small ? { fontSize: 12 } : undefined}>
      {options.map((o) => (
        <button key={String(o.value)} className={o.value === value ? 'on' : ''} title={o.title} onClick={() => onChange(o.value)} style={small ? { padding: '3px 6px', fontSize: 12 } : undefined}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Select<T extends string>({ value, options, onChange, className = '', title }: { value: T; options: { value: T; label: string; group?: string }[]; onChange: (v: T) => void; className?: string; title?: string }) {
  const groups = [...new Set(options.map((o) => o.group ?? ''))];
  return (
    <select className={'select sm ' + className} value={value} title={title} onChange={(e) => onChange(e.target.value as T)} onKeyDown={(e) => e.stopPropagation()}>
      {groups.length > 1
        ? groups.map((g) => (
            <optgroup key={g} label={g}>
              {options
                .filter((o) => (o.group ?? '') === g)
                .map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
            </optgroup>
          ))
        : options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
    </select>
  );
}

export function Check({ checked, onChange, label, title }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; title?: string }) {
  return (
    <label className="chk" title={title}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

const sectionState = new Map<string, boolean>();
export function Section({ title, children, defaultOpen = true, right, id }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean; right?: ReactNode; id?: string }) {
  const key = id ? 'afs:sec:' + id : null;
  const [open, setOpen] = useState(() => {
    if (!key) return defaultOpen;
    if (sectionState.has(key)) return sectionState.get(key)!;
    try {
      const v = localStorage.getItem(key);
      return v === null ? defaultOpen : v === '1';
    } catch {
      return defaultOpen;
    }
  });
  const toggle = () => {
    setOpen(!open);
    if (key) {
      sectionState.set(key, !open);
      try {
        localStorage.setItem(key, open ? '0' : '1');
      } catch {
        /* ignore */
      }
    }
  };
  return (
    <div className="section">
      <div className={`section-head ${open ? 'open' : ''}`} onClick={toggle}>
        <ChevronRight size={13} className="chev" />
        <span className="title">{title}</span>
        <span onClick={(e) => e.stopPropagation()} className="row">
          {right}
        </span>
      </div>
      {open && <div className="section-body">{children}</div>}
    </div>
  );
}

export function PropRow({ label, children, title }: { label: ReactNode; children: ReactNode; title?: string }) {
  return (
    <div className="prop-row" title={title}>
      <label>{label}</label>
      <div className="ctl">{children}</div>
    </div>
  );
}

/** Colour swatch + hex field. The swatch opens a menu of colours from your icons, recent colours,
 *  basics, an eyedropper and the full picker. */
export function ColorField({ value, onChange, title }: { value: string; onChange: (v: string) => void; title?: string }) {
  const [text, setText] = useState(value);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const native = useRef<HTMLInputElement>(null);
  const { icon, match, recent } = useSwatches();
  useEffect(() => setText(value), [value]);
  const norm = /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000';
  useEffect(() => {
    if (!pos) return;
    const away = (e: PointerEvent) => {
      if (!pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setPos(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setPos(null);
      }
    };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', away, true);
      window.removeEventListener('keydown', key, true);
    };
  }, [pos]);
  const pick = (c: string, close = true) => {
    onChange(c.toLowerCase());
    pushRecentColor(c);
    if (close) setPos(null);
  };
  const open = () => {
    if (pos) return setPos(null);
    const r = btn.current!.getBoundingClientRect();
    const W = 236,
      H = 300;
    const vw = window.innerWidth || 1200,
      vh = window.innerHeight || 800;
    setPos({ left: Math.max(8, Math.min(r.left, vw - W - 8)), top: r.bottom + H + 8 > vh && r.top > H ? r.top - H - 6 : r.bottom + 6 });
  };
  const eyedrop = async () => {
    const ED = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
    if (!ED) return;
    try {
      const res = await new ED().open();
      pick(res.sRGBHex);
    } catch {
      /* cancelled */
    }
  };
  const row = (list: string[]) => (
    <div className="cpop-row">
      {list.map((c, i) => (
        <button key={c + i} className={`cpop-sw ${c.toLowerCase() === norm.toLowerCase() ? 'on' : ''}`} style={{ background: c }} title={c} aria-label={c} onClick={() => pick(c)} />
      ))}
    </div>
  );
  return (
    <div className="color" title={title}>
      <button ref={btn} className="color-sw" style={{ background: norm }} aria-label="Choose colour" onClick={open} />
      <input
        className="input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => (/^#[0-9a-f]{6}$/i.test(text) ? pick(text, false) : setText(value))}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      {pos && (
        <div className="cpop" ref={pop} style={pos}>
          {icon.length > 0 && (
            <>
              <div className="cpop-title">From your icons</div>
              {row(icon)}
            </>
          )}
          {match.length > 0 && (
            <>
              <div className="cpop-title">Goes well with your icons</div>
              {row(match)}
            </>
          )}
          {recent.length > 0 && (
            <>
              <div className="cpop-title">Recent</div>
              {row(recent)}
            </>
          )}
          <div className="cpop-title">Basics</div>
          {row(BASIC_SWATCHES)}
          <div className="cpop-actions">
            <button className="btn sm" onClick={() => native.current?.click()} title="Open the full colour picker">
              Custom…
            </button>
            {'EyeDropper' in window && (
              <button className="btn sm" onClick={() => void eyedrop()} title="Pick a colour from anywhere on screen">
                <Pipette size={12} /> Eyedropper
              </button>
            )}
            <input ref={native} type="color" className="cpop-native" value={norm} onChange={(e) => onChange(e.target.value)} onBlur={(e) => pushRecentColor(e.target.value)} />
          </div>
        </div>
      )}
    </div>
  );
}

export function Modal({ title, onClose, children, footer, width }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number }) {
  const back = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // with stacked dialogs (a confirm over Projects…) only the top one closes
      const all = document.querySelectorAll('.modal-back');
      if (all[all.length - 1] !== back.current) return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div ref={back} className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()} onKeyDown={(e) => e.stopPropagation()}>
      <div className="modal" style={{ width: width ?? 520 }} role="dialog" aria-modal="true">
        <div className="modal-head">
          <span className="grow">{title}</span>
          <button className="btn ghost icon sm" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function IconBtn({ title, onClick, children, active, disabled, className = '' }: { title: string; onClick: (e: React.MouseEvent) => void; children: ReactNode; active?: boolean; disabled?: boolean; className?: string }) {
  return (
    <button className={`btn ghost icon sm ${active ? 'active' : ''} ${className}`} title={title} aria-label={title} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
