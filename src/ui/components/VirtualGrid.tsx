// A grid of equal tiles that only mounts the rows in view (plus a few around them), so pickers over
// libraries of thousands of assets stay as quick as small ones. Tiles fill the width: as many
// columns of at least `minTile` px as fit.

import { useEffect, useRef, useState, type ReactNode } from 'react';

export function VirtualGrid<T>({
  items,
  minTile = 96,
  gap = 8,
  /** Height below the square image (name row). */
  extra = 24,
  overscan = 3,
  className = '',
  render,
  label,
  empty,
}: {
  items: T[];
  minTile?: number;
  gap?: number;
  extra?: number;
  overscan?: number;
  className?: string;
  render: (item: T, index: number) => ReactNode;
  label?: string;
  empty?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0, top: 0 });
  useEffect(() => {
    const el = ref.current!;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight, top: el.scrollTop });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);
  // a new list (search, filter) starts at the top
  const first = items[0];
  useEffect(() => {
    const el = ref.current;
    if (el && el.scrollTop > 0) {
      el.scrollTop = 0;
      setBox((b) => ({ ...b, top: 0 }));
    }
  }, [items.length, first]);
  const inner = Math.max(0, box.w - gap * 2);
  const cols = Math.max(1, Math.floor((inner + gap) / (minTile + gap)));
  const tile = cols ? (inner - gap * (cols - 1)) / cols : minTile;
  const rowH = tile + extra + gap;
  const rows = Math.ceil(items.length / cols);
  const r0 = Math.max(0, Math.floor(box.top / rowH) - overscan);
  const r1 = Math.min(rows, Math.ceil((box.top + box.h) / rowH) + overscan);
  const shown: ReactNode[] = [];
  if (box.w > 0)
    for (let r = r0; r < r1; r++)
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (i >= items.length) break;
        shown.push(
          <div key={i} className="vgrid-cell" style={{ position: 'absolute', left: gap + c * (tile + gap), top: gap + r * rowH, width: tile, height: tile + extra }}>
            {render(items[i], i)}
          </div>,
        );
      }
  return (
    <div ref={ref} className={`vgrid ${className}`} role="listbox" aria-multiselectable="true" aria-label={label} onScroll={(e) => setBox((b) => ({ ...b, top: (e.target as HTMLDivElement).scrollTop }))}>
      <div style={{ position: 'relative', height: rows ? rows * rowH + gap : 0 }}>{shown}</div>
      {!items.length && empty}
    </div>
  );
}
