// Image effects for one or many selected images: colour (grayscale / locked / silhouette),
// glow, outline and drop shadow.

import { shadowDefault } from '../../core/defaults';
import type { ImageFilter, ImageObject } from '../../core/types';
import { patchObjects } from '../../state/objects';
import { ColorField, PropRow, Section, Seg, Slider, Toggle } from '../components/controls';

type Look = 'original' | 'gray' | 'locked' | 'silhouette' | 'custom';

const LOOKS: Record<Exclude<Look, 'custom'>, ImageFilter | undefined> = {
  original: undefined,
  gray: { grayscale: 1, brightness: 0 },
  locked: { grayscale: 1, brightness: -0.45 },
  silhouette: { grayscale: 0, brightness: 0, silhouette: true, silhouetteColor: '#0b0c0f' },
};

function lookOf(f?: ImageFilter): Look {
  if (!f || (!f.silhouette && !f.grayscale && !f.brightness)) return 'original';
  if (f.silhouette) return 'silhouette';
  if (f.grayscale === 1 && f.brightness === 0) return 'gray';
  if (f.grayscale === 1 && Math.abs(f.brightness + 0.45) < 0.001) return 'locked';
  return 'custom';
}

export function ImageEffects({ objs }: { objs: ImageObject[] }) {
  const o = objs[0];
  const key = (k: string) => `fx:${k}:${objs.map((x) => x.id).join(',')}`.slice(0, 200);
  const patch = (fn: (x: ImageObject) => Partial<ImageObject>, label: string, k?: string) =>
    patchObjects(Object.fromEntries(objs.map((x) => [x.id, fn(x)])), label, { key: k ? key(k) : undefined });
  const f: ImageFilter = { grayscale: 0, brightness: 0, ...o.filter };
  const look = lookOf(o.filter);
  const setFilter = (p: Partial<ImageFilter>, k?: string) => patch((x) => ({ filter: { grayscale: 0, brightness: 0, ...x.filter, ...p } }), 'Colour', k);
  const glow = o.glow ?? { enabled: false, color: '#ffd23f', blur: 24, opacity: 0.8 };
  const setGlow = (p: Partial<typeof glow>, k?: string) => patch(() => ({ glow: { ...glow, ...p } }), 'Glow', k);
  const outline = o.outline ?? { enabled: false, color: '#ffffff', width: 6 };
  const setOutline = (p: Partial<typeof outline>, k?: string) => patch(() => ({ outline: { ...outline, ...p } }), 'Outline', k);
  const sh = o.shadow ?? shadowDefault();
  const setShadow = (p: Partial<typeof sh>, k?: string) => patch(() => ({ shadow: { ...sh, ...p } }), 'Shadow', k);
  const n = objs.length;
  return (
    <>
      <Section title={n > 1 ? `Colour · ${n} images` : 'Colour'} id="img-colour">
        <Seg
          small
          value={look === 'custom' ? ('' as Look) : look}
          onChange={(v: Look) => v !== 'custom' && patch(() => ({ filter: LOOKS[v] }), 'Colour')}
          options={[
            { value: 'original', label: 'Original' },
            { value: 'gray', label: 'Grayscale' },
            { value: 'locked', label: 'Locked' },
            { value: 'silhouette', label: 'Silhouette' },
          ]}
        />
        {!f.silhouette ? (
          <>
            <PropRow label="Grayscale" title="How much colour is removed">
              <Slider value={f.grayscale} min={0} max={1} step={0.01} scale={100} unit="%" onChange={(grayscale) => setFilter({ grayscale }, 'g')} />
            </PropRow>
            <PropRow label="Brightness" title="Darken for locked / unavailable items, brighten to lift dark icons">
              <Slider value={f.brightness} min={-0.9} max={1} step={0.01} scale={100} unit="%" onChange={(brightness) => setFilter({ brightness }, 'b')} />
            </PropRow>
          </>
        ) : (
          <PropRow label="Silhouette">
            <ColorField value={f.silhouetteColor ?? '#0b0c0f'} onChange={(silhouetteColor) => setFilter({ silhouetteColor }, 'sc')} />
          </PropRow>
        )}
        <div className="hint">Transparency is kept — only the visible pixels change.</div>
      </Section>
      <Section title="Glow & outline" id="img-glow" defaultOpen={!!(o.glow?.enabled || o.outline?.enabled)}>
        <PropRow label="Glow">
          <Toggle checked={glow.enabled} onChange={(enabled) => setGlow({ enabled })} />
          {glow.enabled && <ColorField value={glow.color} onChange={(color) => setGlow({ color }, 'gc')} />}
        </PropRow>
        {glow.enabled && (
          <>
            <PropRow label="Glow size">
              <Slider value={glow.blur} min={2} max={120} unit="px" onChange={(blur) => setGlow({ blur }, 'gb')} />
            </PropRow>
            <PropRow label="Glow strength">
              <Slider value={glow.opacity} min={0} max={1} step={0.01} scale={100} unit="%" onChange={(opacity) => setGlow({ opacity }, 'go')} />
            </PropRow>
          </>
        )}
        <PropRow label="Outline">
          <Toggle checked={outline.enabled} onChange={(enabled) => setOutline({ enabled })} />
          {outline.enabled && <ColorField value={outline.color} onChange={(color) => setOutline({ color }, 'oc')} />}
        </PropRow>
        {outline.enabled && (
          <PropRow label="Outline width">
            <Slider value={outline.width} min={1} max={40} unit="px" onChange={(width) => setOutline({ width }, 'ow')} />
          </PropRow>
        )}
      </Section>
      <Section title="Drop shadow" id="img-shadow" right={<Toggle checked={sh.enabled} onChange={(enabled) => setShadow({ enabled })} />}>
        {sh.enabled ? (
          <>
            <PropRow label="Colour">
              <ColorField value={sh.color} onChange={(color) => setShadow({ color }, 'c')} />
            </PropRow>
            <PropRow label="Blur">
              <Slider value={sh.blur} min={0} max={80} onChange={(blur) => setShadow({ blur }, 'b')} unit="px" />
            </PropRow>
            <PropRow label="Distance">
              <Slider value={sh.dy} min={-60} max={60} onChange={(dy) => setShadow({ dy }, 'dy')} unit="px" />
            </PropRow>
            <PropRow label="Opacity">
              <Slider value={sh.opacity} min={0} max={1} step={0.01} scale={100} unit="%" onChange={(opacity) => setShadow({ opacity }, 'o')} />
            </PropRow>
          </>
        ) : (
          <div className="hint">Grounds icons on light backgrounds.</div>
        )}
      </Section>
    </>
  );
}
