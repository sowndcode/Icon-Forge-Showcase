// A keyboard shortcut as keycaps: "Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y" becomes three combinations of
// separate keys. Combinations wrap as a whole (never inside one); mouse actions such as "click" or
// "drag" and notes such as "(twice)" are plain text, not keys.

const ACTIONS = /^(click|drag|wheel|handle|mouse wheel|double-click)$/i;

export function parseShortcut(s: string): { keys: { text: string; key: boolean }[]; note?: string }[] {
  return s.split(' / ').map((alt) => {
    const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(alt);
    const body = (m ? m[1] : alt).trim();
    const note = m ? m[2] : undefined;
    // "Ctrl++" or a lone "+" key stays a key; otherwise "+" joins keys
    const parts = body === '+' ? ['+'] : body.split(/\s*\+\s*(?=\S)/).filter(Boolean);
    return { keys: parts.map((p) => ({ text: p, key: !ACTIONS.test(p) })), note };
  });
}

export function Keys({ shortcut, className = '' }: { shortcut: string; className?: string }) {
  const alts = parseShortcut(shortcut);
  return (
    <span className={`keys ${className}`} aria-label={shortcut}>
      {alts.map((a, i) => (
        <span key={i} className="keys-alt" aria-hidden>
          {i > 0 && <span className="keys-or">or</span>}
          {a.keys.map((k, j) => (
            <span key={j} className="keys-combo-part">
              {j > 0 && <span className="keys-plus">+</span>}
              {k.key ? <kbd className="kbd">{k.text}</kbd> : <span className="keys-action">{k.text}</span>}
            </span>
          ))}
          {a.note && <span className="keys-note">{a.note}</span>}
        </span>
      ))}
    </span>
  );
}
