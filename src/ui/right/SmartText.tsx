// Text styling made simple: coordinated looks, suggestions that read on what is behind the text,
// a contrast check and one-click fixes. Simple and Advanced edit the same style; switching between them
// changes only which controls are shown.

import { useMemo } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Eraser, Feather, Save, SunMedium } from 'lucide-react';
import { askText } from '../components/ask';
import { savePreset } from '../../state/presets';
import { applyTextLook, defaultTextStyle, FONT_FAMILIES } from '../../core/defaults';
import { improveContrast, readLevel, reduceEffects, suggestStyles, textContrast, TEXT_LOOKS } from '../../core/textLooks';
import type { TextObject, TextStyle } from '../../core/types';
import { contrastRatio } from '../../core/themes';
import { sampleBehind } from '../../render/sample';
import { withTextDefaults } from '../../render/text';
import { getAsset, useDoc, usePage } from '../../state/doc';
import { updateTextStyle } from '../../state/objects';
import { usePrefs } from '../../state/prefs';
import { ColorField, NumberField, PropRow, Section, Seg, Select } from '../components/controls';
import { TextThumb } from '../components/TextThumb';
import { useImageVersion } from '../left/AssetLibrary';

const sample = (t: TextObject) => (t.text.replace(/\{count\}/g, '120').split(/\s+/).find((w) => w.length > 1) ?? 'Aa').slice(0, 10);

export function useBehind(o: TextObject) {
  const page = usePage();
  const v = useImageVersion();
  const i = page.objects.findIndex((x) => x.id === o.id);
  const below = page.objects.slice(0, Math.max(0, i));
  return useMemo(
    () => sampleBehind(page, o.id, getAsset),
    // re-sample when the background, anything below the text, or the text's box changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page.background, below.length, ...below.slice(-24), o.x, o.y, o.w, o.h, v],
  );
}

export function SmartText({ o }: { o: TextObject }) {
  const mode = usePrefs((s) => s.textMode);
  const s = withTextDefaults(o.style);
  const behind = useBehind(o);
  const fonts = useDoc((d) => d.doc.fonts);
  const tones = behind ? [behind.dark, behind.avg, behind.light] : [];
  const ratio = behind ? textContrast(s, tones) : null;
  const level = ratio === null ? null : readLevel(ratio);
  const fix = behind ? improveContrast(s, tones) : {};
  const heavy = s.extrude.enabled || s.glow.enabled || s.stroke2.enabled || (s.stroke.enabled && s.stroke.width > s.fontSize * 0.05) || s.fontWeight > 750;
  const set = (p: Partial<TextStyle>, label: string, key?: string) => updateTextStyle(o.id, p, key ? `ts:${o.id}:${key}` : undefined, label);
  const suggestions = useMemo(() => (behind ? suggestStyles(s, behind) : []), [behind, s]);
  const word = sample(o);

  return (
    <Section
      title="Style"
      id="txt-smart"
      right={
        <span onClick={(e) => e.stopPropagation()}>
          <Seg
            small
            value={mode}
            onChange={(textMode) => usePrefs.getState().setPrefs({ textMode })}
            options={[
              { value: 'simple', label: 'Simple', title: 'Ready-made looks, suggestions and the basics' },
              { value: 'advanced', label: 'Advanced', title: 'Every typography and effect control' },
            ]}
          />
        </span>
      }
    >
      <div data-tour="text-style" />
      {ratio !== null && (
        <div className={`read-row ${level}`} title="Contrast between the letters and what is behind them on the page (WCAG ratio; 4.5:1 or more reads well at any size)">
          <span className={`read-dot ${level}`} />
          <span className="grow">{level === 'good' ? 'Reads well here' : level === 'fair' ? 'Readable at large sizes' : 'Hard to read here'}</span>
          <span className="mono">{ratio.toFixed(1)}:1</span>
        </div>
      )}
      <div className="smart-actions">
        <button className="btn sm" disabled={!Object.keys(fix).length} onClick={() => set(fix, 'Improve contrast')} title="Change only the colours (and add an outline on busy backgrounds) until the text reads">
          <SunMedium size={13} /> Improve contrast
        </button>
        <button className="btn sm" disabled={!heavy} onClick={() => set(reduceEffects(s), 'Reduce heavy effects')} title="Remove 3D depth, glow and the second outline; thin the outline; lighten weight 800+">
          <Feather size={13} /> Reduce effects
        </button>
        <button className="btn ghost sm" onClick={() => updateTextStyle(o.id, (cur) => applyTextLook(withTextDefaults(cur), {}), undefined, 'Reset text style')} title="Back to plain text in the default font; your words, size and position stay">
          <Eraser size={13} /> Reset
        </button>
      </div>
      {behind && (
        <>
          <div className="smart-label">Suggested for this background</div>
          <div className="look-grid">
            {suggestions.map((g) => (
              <button key={g.id} className={`look-tile ${contrastRatio('#ffffff', behind.avg) >= 3 ? 'on-dark' : 'on-light'}`} style={{ background: behind.avg }} title={`${g.name} — click to apply (Ctrl+Z to undo)`} onClick={() => set(g.patch, `Text: ${g.name.toLowerCase()}`)}>
                <TextThumb text={word} style={{ ...s, ...g.patch, fontSize: 96 }} />
                <span>{g.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {mode === 'simple' && (
        <>
          <div className="smart-label">Looks</div>
          <div className="look-grid">
            {TEXT_LOOKS.map((l) => (
              <button key={l.id} className={`look-tile on-${l.on}`} title={`${l.name} — font, colours and effects together; your words and size stay`} onClick={() => updateTextStyle(o.id, (cur) => applyTextLook(withTextDefaults(cur), l.style), undefined, `Text look: ${l.name}`)}>
                <TextThumb text={word} style={l.style} />
                <span>{l.name}</span>
              </button>
            ))}
          </div>
          <PropRow label="Font">
            <Select value={s.fontFamily} onChange={(fontFamily) => set({ fontFamily }, 'Font')} options={[...new Set([...fonts.map((f) => f.family), ...FONT_FAMILIES])].map((f) => ({ value: f, label: f, group: fonts.some((x) => x.family === f) ? 'Imported' : f.startsWith('Geist') ? 'Bundled' : 'System' }))} />
          </PropRow>
          <PropRow label="Size">
            <NumberField value={Math.round(s.fontSize * 10) / 10} min={1} max={2000} decimals={1} unit="px" onChange={(fontSize) => set({ fontSize }, 'Text size', 'size')} />
          </PropRow>
          <PropRow label="Colour">
            <ColorField value={s.fill} onChange={(fill) => set({ fill, fillMode: 'solid' }, 'Text colour', 'fill')} />
            <span className="seg-icons">
              {(['left', 'center', 'right'] as const).map((al) => (
                <button key={al} className={`btn icon sm ${s.align === al ? 'active' : ''}`} title={`Align ${al}`} aria-label={`Align ${al}`} onClick={() => set({ align: al }, 'Align')}>
                  {al === 'left' ? <AlignLeft size={13} /> : al === 'center' ? <AlignCenter size={13} /> : <AlignRight size={13} />}
                </button>
              ))}
            </span>
          </PropRow>
          <div className="row">
            <button className="btn ghost sm" onClick={() => void askText({ title: 'Save as element', message: 'Its words and look appear under “My elements” in the Elements tab, in every project.', value: o.text.split('\n')[0].slice(0, 32) || 'My element', okLabel: 'Save' }).then((n) => n && void savePreset('text', n, { ...o.style, sampleText: o.text }))}>
              <Save size={13} /> Save as element
            </button>
          </div>
          <div className="hint">Advanced shows outlines, gradients, depth, glow, badges and spacing. Both edit the same style.</div>
        </>
      )}
    </Section>
  );
}

export const DEFAULT_TEXT = defaultTextStyle;
