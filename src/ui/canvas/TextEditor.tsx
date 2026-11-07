// In-place text editing: a textarea laid exactly over the text object (zoom/rotation aware).

import { useEffect, useRef } from 'react';
import type { TextObject } from '../../core/types';
import { fontString } from '../../render/text';
import { useDoc, activePageOf } from '../../state/doc';
import { useViewport } from '../../state/ui';

export function TextEditor({ id, onDone, commitText }: { id: string; onDone: () => void; commitText: (t: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const obj = useDoc((s) => activePageOf(s.doc).objects.find((o) => o.id === id)) as TextObject | undefined;
  const vp = useViewport();
  const initial = useRef(obj?.text ?? '');

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  if (!obj || obj.type !== 'text') return null;
  const s = obj.style;
  const z = vp.zoom;
  const finish = (save: boolean) => {
    const v = ref.current?.value ?? obj.text;
    if (save && v !== initial.current) commitText(v);
    onDone();
  };
  return (
    <textarea
      ref={ref}
      className="text-editor visible"
      defaultValue={obj.text}
      spellCheck={false}
      style={{
        left: obj.x * z + vp.panX - (obj.w * z) / 2,
        top: obj.y * z + vp.panY - (obj.h * z) / 2,
        width: obj.w * z,
        height: Math.max(obj.h, s.fontSize * s.lineHeight) * z,
        transform: `rotate(${obj.rotation}deg)`,
        font: fontString(s, s.fontSize * z),
        lineHeight: s.lineHeight,
        letterSpacing: s.letterSpacing * z + 'px',
        textAlign: s.align,
        textTransform: s.uppercase ? 'uppercase' : 'none',
        color: s.fill,
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') finish(false);
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) finish(true);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={() => finish(true)}
      onInput={(e) => {
        const ta = e.currentTarget;
        ta.style.height = 'auto';
        ta.style.height = ta.scrollHeight + 'px';
      }}
    />
  );
}
