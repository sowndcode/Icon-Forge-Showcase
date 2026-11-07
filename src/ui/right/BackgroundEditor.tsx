import { Dices, Plus, Save, Trash2 } from 'lucide-react';
import { defaultBackground } from '../../core/defaults';
import { randomSeed } from '../../core/rng';
import type { Background, BackgroundType, BgPattern, ImageFit } from '../../core/types';
import { PATTERN_KINDS } from '../../render/patterns';
import { useDoc, usePage } from '../../state/doc';
import { setBackground } from '../../state/pages';
import { savePreset } from '../../state/presets';
import { useUI } from '../../state/ui';
import { ColorField, PropRow, Seg, Select, Slider, Toggle } from '../components/controls';
import { askText } from '../components/ask';

const BLENDS: { value: GlobalCompositeOperation; label: string }[] = [
  { value: 'source-over', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'soft-light', label: 'Soft light' },
  { value: 'color', label: 'Color' },
];

export function BackgroundEditor() {
  const page = usePage();
  const b = page.background;
  // older documents may not have the newer layers yet
  const pattern = { ...defaultBackground().pattern, ...b.pattern };
  const light = { ...defaultBackground().light, ...b.light };
  const assets = useDoc((s) => s.doc.assets);
  const set = (p: Partial<Background>, key?: string) => setBackground(p, key);
  const setImg = (p: Partial<Background['image']>, key?: string) => setBackground((bg) => ({ ...bg, image: { ...bg.image, ...p } }), key);
  const setGrad = (p: Partial<Background['gradient']>, key?: string) => setBackground((bg) => ({ ...bg, gradient: { ...bg.gradient, ...p } }), key);
  const setPat = (p: Partial<BgPattern>, key?: string) => setBackground((bg) => ({ ...bg, pattern: { ...defaultBackground().pattern, ...bg.pattern, ...p } }), key ? 'pat' + key : undefined);
  const setLight = (p: Partial<Background['light']>, key?: string) => setBackground((bg) => ({ ...bg, light: { ...defaultBackground().light, ...bg.light, ...p } }), key ? 'light' + key : undefined);
  const bgAssets = assets.filter((a) => a.kind === 'background' || a.id === b.image.assetId);
  const imgAssetOptions = [...bgAssets, ...assets.filter((a) => a.kind !== 'background' && a.id !== b.image.assetId)].map((a) => ({ value: a.id, label: (a.kind === 'background' ? '' : '· ') + a.name, group: a.kind === 'background' ? 'Backgrounds' : 'Other images' }));
  const isMesh = b.type === 'mesh';
  return (
    <>
      <Seg<BackgroundType>
        small
        value={b.type}
        onChange={(type) => set(type === 'mesh' && b.gradient.stops.length < 3 ? { type, gradient: { ...b.gradient, radius: 1, stops: [...b.gradient.stops, { offset: 1, color: '#22d3ee' }, { offset: 1, color: '#f472b6' }] } } : { type })}
        options={[
          { value: 'transparent', label: 'None', title: 'Transparent' },
          { value: 'solid', label: 'Solid' },
          { value: 'linear', label: 'Linear' },
          { value: 'radial', label: 'Radial' },
          { value: 'mesh', label: 'Mesh', title: 'Soft multi-color blend' },
          { value: 'image', label: 'Image' },
        ]}
      />
      {(b.type === 'solid' || b.type === 'image' || isMesh) && (
        <PropRow label={b.type === 'image' ? 'Base color' : isMesh ? 'Base' : 'Color'}>
          <ColorField value={b.color} onChange={(color) => set({ color }, 'color')} />
        </PropRow>
      )}
      {(b.type === 'linear' || b.type === 'radial' || isMesh) && (
        <>
          {b.gradient.stops.map((s, i) => (
            <PropRow key={i} label={isMesh ? `Color ${i + 1}` : `Stop ${i + 1}`}>
              <ColorField value={s.color} onChange={(color) => setGrad({ stops: b.gradient.stops.map((x, j) => (j === i ? { ...x, color } : x)) }, 'stop' + i)} />
              {!isMesh && (
                <input type="range" min={0} max={1} step={0.01} value={s.offset} style={{ width: 60, flex: 'none' }} onChange={(e) => setGrad({ stops: b.gradient.stops.map((x, j) => (j === i ? { ...x, offset: +e.target.value } : x)) }, 'off' + i)} />
              )}
              {b.gradient.stops.length > 2 && (
                <button className="btn ghost icon sm" title="Remove color" onClick={() => setGrad({ stops: b.gradient.stops.filter((_, j) => j !== i) })}>
                  <Trash2 size={12} />
                </button>
              )}
            </PropRow>
          ))}
          {(!isMesh || b.gradient.stops.length < 5) && (
            <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setGrad({ stops: [...b.gradient.stops, { offset: 0.5, color: '#888888' }].sort((x, y) => x.offset - y.offset) })}>
              <Plus size={12} /> Add color
            </button>
          )}
          {b.type === 'linear' ? (
            <PropRow label="Angle">
              <Slider value={b.gradient.angle} min={0} max={360} unit="°" onChange={(angle) => setGrad({ angle }, 'angle')} />
            </PropRow>
          ) : isMesh ? (
            <PropRow label="Blend size">
              <Slider value={b.gradient.radius} min={0.3} max={2} step={0.01} scale={100} unit="%" onChange={(radius) => setGrad({ radius }, 'radius')} />
            </PropRow>
          ) : (
            <>
              <PropRow label="Center X">
                <Slider value={b.gradient.cx} min={0} max={1} step={0.01} scale={100} unit="%" onChange={(cx) => setGrad({ cx }, 'cx')} />
              </PropRow>
              <PropRow label="Center Y">
                <Slider value={b.gradient.cy} min={0} max={1} step={0.01} scale={100} unit="%" onChange={(cy) => setGrad({ cy }, 'cy')} />
              </PropRow>
              <PropRow label="Radius">
                <Slider value={b.gradient.radius} min={0.1} max={2} step={0.01} scale={100} unit="%" onChange={(radius) => setGrad({ radius }, 'radius')} />
              </PropRow>
            </>
          )}
        </>
      )}
      {b.type === 'image' && (
        <>
          <PropRow label="Image">
            {imgAssetOptions.length ? (
              <Select value={(b.image.assetId ?? '') as string} onChange={(assetId) => setImg({ assetId })} options={[{ value: '', label: '— choose —' }, ...imgAssetOptions]} />
            ) : (
              <button className="btn sm" onClick={() => useUI.setState({ leftTab: 'backgrounds' })}>
                Import a background…
              </button>
            )}
          </PropRow>
          <PropRow label="Fit">
            <Select<ImageFit>
              value={b.image.fit}
              onChange={(fit) => setImg({ fit })}
              options={[
                { value: 'fill', label: 'Fill (cover)' },
                { value: 'fit', label: 'Fit (contain)' },
                { value: 'stretch', label: 'Stretch' },
                { value: 'center', label: 'Center (1:1)' },
                { value: 'tile', label: 'Tile' },
              ]}
            />
          </PropRow>
          <PropRow label="Scale">
            <Slider value={b.image.scale} min={0.1} max={4} step={0.01} scale={100} unit="%" onChange={(scale) => setImg({ scale }, 'scale')} />
          </PropRow>
          <PropRow label="Offset X">
            <Slider value={b.image.offsetX} min={-1} max={1} step={0.005} scale={100} unit="%" onChange={(offsetX) => setImg({ offsetX }, 'ox')} />
          </PropRow>
          <PropRow label="Offset Y">
            <Slider value={b.image.offsetY} min={-1} max={1} step={0.005} scale={100} unit="%" onChange={(offsetY) => setImg({ offsetY }, 'oy')} />
          </PropRow>
          <PropRow label="Rotation">
            <Slider value={b.image.rotation} min={-180} max={180} unit="°" onChange={(rotation) => setImg({ rotation }, 'rot')} />
          </PropRow>
          <PropRow label="Blur">
            <Slider value={b.image.blur} min={0} max={80} step={0.5} decimals={1} unit="px" onChange={(blur) => setImg({ blur }, 'blur')} />
          </PropRow>
          <PropRow label="Brightness">
            <Slider value={b.image.brightness} min={-100} max={100} onChange={(brightness) => setImg({ brightness }, 'bright')} />
          </PropRow>
          <PropRow label="Contrast">
            <Slider value={b.image.contrast} min={-100} max={100} onChange={(contrast) => setImg({ contrast }, 'contrast')} />
          </PropRow>
          <PropRow label="Saturation">
            <Slider value={b.image.saturation} min={-100} max={100} onChange={(saturation) => setImg({ saturation }, 'sat')} />
          </PropRow>
          <PropRow label="Opacity">
            <Slider value={b.image.opacity} min={0} max={1} step={0.01} scale={100} unit="%" onChange={(opacity) => setImg({ opacity }, 'iop')} />
          </PropRow>
        </>
      )}
      {b.type !== 'transparent' && (
        <>
          <div className="subhead">
            <span>Pattern</span>
            <Toggle checked={pattern.enabled} onChange={(enabled) => setPat({ enabled })} />
          </div>
          {pattern.enabled && (
            <>
              <PropRow label="Type">
                <Select<BgPattern['kind']> value={pattern.kind} onChange={(kind) => setPat({ kind })} options={PATTERN_KINDS} />
              </PropRow>
              <PropRow label="Color">
                <ColorField value={pattern.color} onChange={(color) => setPat({ color }, 'c')} />
                {['stars', 'confetti', 'bokeh'].includes(pattern.kind) && (
                  <button className="btn ghost icon sm" title="Shuffle" onClick={() => setPat({ seed: randomSeed() })}>
                    <Dices size={13} />
                  </button>
                )}
              </PropRow>
              {pattern.kind === 'confetti' && (
                <PropRow label="Colors 2 / 3">
                  <ColorField value={pattern.color2 ?? '#ffffff'} onChange={(color2) => setPat({ color2 }, 'c2')} />
                  <ColorField value={pattern.color3 ?? '#f5c542'} onChange={(color3) => setPat({ color3 }, 'c3')} />
                </PropRow>
              )}
              <PropRow label="Strength">
                <Slider value={pattern.opacity} min={0} max={1} step={0.01} scale={100} unit="%" onChange={(opacity) => setPat({ opacity }, 'o')} />
              </PropRow>
              <PropRow label="Size">
                <Slider value={pattern.scale} min={0.2} max={4} step={0.01} scale={100} unit="%" onChange={(scale) => setPat({ scale }, 's')} />
              </PropRow>
              {!['stars', 'confetti', 'bokeh', 'noise', 'halftone'].includes(pattern.kind) && (
                <PropRow label="Angle">
                  <Slider value={pattern.angle} min={-180} max={180} unit="°" onChange={(angle) => setPat({ angle }, 'a')} />
                </PropRow>
              )}
              {(pattern.kind === 'rays' || pattern.kind === 'halftone') && (
                <>
                  <PropRow label="Center X">
                    <Slider value={pattern.cx ?? 0.5} min={0} max={1} step={0.01} scale={100} unit="%" onChange={(cx) => setPat({ cx }, 'cx')} />
                  </PropRow>
                  <PropRow label="Center Y">
                    <Slider value={pattern.cy ?? 0.5} min={0} max={1} step={0.01} scale={100} unit="%" onChange={(cy) => setPat({ cy }, 'cy')} />
                  </PropRow>
                </>
              )}
            </>
          )}
          <div className="subhead">
            <span>Spotlight</span>
            <Toggle checked={light.enabled} onChange={(enabled) => setLight({ enabled })} />
          </div>
          {light.enabled && (
            <>
              <PropRow label="Color">
                <ColorField value={light.color} onChange={(color) => setLight({ color }, 'c')} />
              </PropRow>
              <PropRow label="Strength">
                <Slider value={light.strength} min={0} max={1} step={0.01} scale={100} unit="%" onChange={(strength) => setLight({ strength }, 's')} />
              </PropRow>
              <PropRow label="Size">
                <Slider value={light.size} min={0.1} max={2} step={0.01} scale={100} unit="%" onChange={(size) => setLight({ size }, 'z')} />
              </PropRow>
              <PropRow label="Position X">
                <Slider value={light.x} min={0} max={1} step={0.01} scale={100} unit="%" onChange={(x) => setLight({ x }, 'x')} />
              </PropRow>
              <PropRow label="Position Y">
                <Slider value={light.y} min={0} max={1} step={0.01} scale={100} unit="%" onChange={(y) => setLight({ y }, 'y')} />
              </PropRow>
            </>
          )}
          <div className="subhead">
            <span>Color overlay</span>
            <Toggle checked={b.overlay.enabled} onChange={(enabled) => set({ overlay: { ...b.overlay, enabled } })} />
          </div>
          {b.overlay.enabled && (
            <>
              <PropRow label="Color">
                <ColorField value={b.overlay.color} onChange={(color) => set({ overlay: { ...b.overlay, color } }, 'ovc')} />
              </PropRow>
              <PropRow label="Amount">
                <Slider value={b.overlay.opacity} min={0} max={1} step={0.01} scale={100} unit="%" onChange={(opacity) => set({ overlay: { ...b.overlay, opacity } }, 'ovo')} />
              </PropRow>
              <PropRow label="Blend">
                <Select value={b.overlay.blend as string} onChange={(blend) => set({ overlay: { ...b.overlay, blend: blend as GlobalCompositeOperation } })} options={BLENDS.map((x) => ({ value: x.value as string, label: x.label }))} />
              </PropRow>
            </>
          )}
          <div className="subhead">
            <span>Vignette</span>
            <Toggle checked={b.vignette.enabled} onChange={(enabled) => set({ vignette: { ...b.vignette, enabled } })} />
          </div>
          {b.vignette.enabled && (
            <PropRow label="Strength">
              <Slider value={b.vignette.strength} min={0} max={1} step={0.01} scale={100} unit="%" onChange={(strength) => set({ vignette: { ...b.vignette, strength } }, 'vig')} />
            </PropRow>
          )}
        </>
      )}
      <button
        className="btn sm"
        style={{ alignSelf: 'flex-start' }}
        onClick={() => {
          void askText({ title: 'Save background style', message: 'It appears under “My styles” in the Backgrounds tab.', value: 'My background', okLabel: 'Save' }).then((name) => {
            if (name) void savePreset('background', name, b);
          });
        }}
      >
        <Save size={12} /> Save as style
      </button>
    </>
  );
}
