// Core document model for Icon Forge Showcase.
//
// Vocabulary:
//   AssetRecord  — a source file in the project library (global to the project, shared by all pages).
//   SceneObject  — an instance placed on a page (image / text / shape). Many objects may share one asset.
//   Page         — one composition (artboard) with its own size, background, objects and layouts.
//   LayoutInstance — a live Smart Layout that "owns" a set of image objects on a page. Objects stay
//                  individually editable; pinned objects are skipped when the layout is re-run.
//
// Everything here is plain JSON (no class instances) so it can be autosaved, undone and exported as-is.

export type Id = string;

export interface Vec {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Four corners of a perspective plane, clockwise from top-left (page px). */
export type Quad = [Vec, Vec, Vec, Vec];

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

/** 'watermark': a logo imported for watermarks (kept out of the asset library). */
export type AssetKind = 'asset' | 'background' | 'element' | 'watermark';
export type AssetStatus = 'pending' | 'ready' | 'error' | 'missing';

export interface AlphaInfo {
  /** Visible-content bounding box in source pixels (alpha above threshold). */
  bounds: Rect;
  /** Visible pixels / all pixels (0..1). */
  occupancy: number;
  /** Visible pixels / bounding-box pixels (0..1) — how "solid" the visible box is. */
  fill: number;
  /** Any pixel with alpha < 255. */
  hasAlpha: boolean;
  /** No visible pixel at all. */
  empty: boolean;
  /** Visible-pixel centroid in source pixels (visual center of mass). */
  centroid: Vec;
  /**
   * Coarse 16×16 coverage grid of the visible bounding box, base64 (256 bytes, 0..255).
   * Not used by V1 collision (boxes) but kept so mask/polygon collision can be added later.
   */
  mask?: string;
  /** Analysis version (see ALPHA_VERSION); older results are recomputed. */
  v?: number;
}

export interface AssetRecord {
  id: Id;
  /** File name including extension. */
  name: string;
  format: string; // png | webp | jpeg | ...
  kind: AssetKind;
  /** Relative folder inside the imported tree ("Halloween/Weapons"), '' for loose files. */
  folder: string;
  /** User-facing category; defaults to the deepest folder name. */
  category: string;
  width: number;
  height: number;
  bytes: number;
  importIndex: number;
  addedAt: number;
  status: AssetStatus;
  error?: string;
  alpha?: AlphaInfo;
  /** SHA-256 of the original file (hex), for exact-duplicate detection on import. */
  hash?: string;
}

// ---------------------------------------------------------------------------
// Scene objects
// ---------------------------------------------------------------------------

export type ObjectType = 'image' | 'text' | 'shape';

export interface BaseObject {
  id: Id;
  type: ObjectType;
  name: string;
  /** Center of the object box in page px. */
  x: number;
  y: number;
  /** Unrotated box size in page px. */
  w: number;
  h: number;
  /** Degrees, clockwise. */
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  opacity: number; // 0..1
  hidden?: boolean;
  locked?: boolean;
  groupId?: Id;
  /** Smart Layout that controls this object (absent = manual). */
  layoutId?: Id;
  /** Pinned objects keep their transform when their layout is re-run. */
  pinned?: boolean;
  /** Perspective depth override: absent/auto = derived from position. 0 = far, 1 = near. */
  depthMode?: 'auto' | 'manual';
  depth?: number;
  /** Marked as a hero for Hero Composition layouts. */
  hero?: boolean;
  /**
   * Stable key of an object a built-in template created ("t3"). Lets a live template rebuild match
   * the new object to the one on the page, so the user's text, moves and deletions survive.
   */
  tplKey?: string;
}

export interface ImageObject extends BaseObject {
  type: 'image';
  assetId: Id;
  /** Optional drop shadow under the visible pixels. */
  shadow?: ShadowStyle;
  /** Colour effects: grayscale comparisons, dimmed "locked" items, silhouettes. */
  filter?: ImageFilter;
  /** Soft coloured light around the visible pixels. */
  glow?: { enabled: boolean; color: string; blur: number; opacity: number };
  /** Solid outline that follows the visible pixels (sticker look). */
  outline?: { enabled: boolean; color: string; width: number };
  /**
   * Projective warp (Ground Plane layout): where the image's corners go, clockwise from top-left, in
   * box units (-0.5 … 0.5 around the object's center). Absent = an ordinary flat image.
   */
  warp?: Quad;
}

export interface ImageFilter {
  /** 0 = original colours, 1 = fully gray. */
  grayscale: number;
  /** -1 (black) … 0 … 1 (twice as bright). */
  brightness: number;
  /** Draw only the shape in one colour ("unknown item"). */
  silhouette?: boolean;
  silhouetteColor?: string;
}

export interface ShadowStyle {
  enabled: boolean;
  color: string;
  blur: number;
  dx: number;
  dy: number;
  opacity: number;
}

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  italic: boolean;
  align: 'left' | 'center' | 'right';
  letterSpacing: number; // px
  lineHeight: number; // multiplier
  uppercase: boolean;
  fill: string;
  stroke: { enabled: boolean; color: string; width: number };
  shadow: ShadowStyle;
  // Effects below were added later and are optional so older documents stay valid
  // (render/text.ts withTextDefaults fills them in).
  fillMode?: 'solid' | 'gradient';
  /** Second gradient color. */
  fill2?: string;
  gradientAngle?: number; // degrees, 180 = top → bottom
  /** Outer outline drawn around the main outline. */
  stroke2?: { enabled: boolean; color: string; width: number };
  glow?: { enabled: boolean; color: string; blur: number; opacity: number };
  /** Solid 3D depth below the letters. */
  extrude?: { enabled: boolean; color: string; depth: number; angle: number };
  /** Bend text along an arc: −1 (frown) … 1 (half circle). */
  curve?: number;
  /** Label shape behind the text ("FREE DEMO!", "NEW", price tags). */
  badge?: TextBadge;
  /** Pixel-art look: size of one pixel block in page px (0 = smooth text). */
  pixel?: number;
}

export interface TextBadge {
  enabled: boolean;
  shape: 'rect' | 'pill' | 'circle' | 'burst' | 'ribbon' | 'slant' | 'tag';
  color: string;
  color2: string;
  gradient: boolean;
  padX: number;
  padY: number;
  radius: number;
  stroke: { enabled: boolean; color: string; width: number };
  /** Spikes on a burst. */
  points: number;
}

export interface TextObject extends BaseObject {
  type: 'text';
  text: string;
  style: TextStyle;
  /** The words were typed by the user (not generated): templates never replace them. */
  textEdited?: boolean;
}

export type ShapeKind = 'rect' | 'ellipse' | 'line' | 'star' | 'triangle' | 'arrow' | 'burst' | 'heart' | 'diamond' | 'pentagon' | 'hexagon' | 'octagon' | 'ring' | 'plus' | 'bubble' | 'shield' | 'ribbon' | 'semicircle' | 'parallelogram' | 'bolt' | 'moon' | 'chevron';

export interface ShapeObject extends BaseObject {
  type: 'shape';
  shape: ShapeKind;
  fill: string;
  fillEnabled: boolean;
  stroke: string;
  strokeWidth: number;
  radius: number; // rect corner radius
  /** Soft edges in page px (glows, floor shadows). */
  blur?: number;
  /** Second color: fill becomes a top → bottom gradient. */
  fill2?: string;
  /** Restyle what lies below the shape (silhouettes, fading, grayscale…). */
  effect?: ShapeEffect;
}

export type ShapeEffectLook = 'silhouette' | 'fade' | 'grayscale' | 'darken' | 'blur';

export interface ShapeEffect {
  enabled: boolean;
  look: ShapeEffectLook;
  /** 0 … 1: silhouette / fade opacity, gray amount, darkening, blur strength. */
  amount: number;
  /** Silhouette colour. */
  color: string;
  /** Only the part under the shape, or every object the shape touches. */
  scope: 'area' | 'whole';
  /** Icons only, or text and shapes too. */
  targets: 'icons' | 'all';
}

export type SceneObject = ImageObject | TextObject | ShapeObject;

export interface GroupInfo {
  id: Id;
  name: string;
  collapsed?: boolean;
}

// ---------------------------------------------------------------------------
// Background
// ---------------------------------------------------------------------------

export type BackgroundType = 'transparent' | 'solid' | 'linear' | 'radial' | 'mesh' | 'image';
export type ImageFit = 'fit' | 'fill' | 'stretch' | 'center' | 'tile';

export interface GradientStop {
  offset: number; // 0..1
  color: string;
}

export interface Background {
  type: BackgroundType;
  color: string;
  gradient: {
    stops: GradientStop[];
    angle: number; // linear, degrees
    cx: number; // radial center, 0..1 of page
    cy: number;
    radius: number; // radial radius, fraction of page diagonal / 2
  };
  image: {
    assetId?: Id;
    fit: ImageFit;
    scale: number;
    offsetX: number; // fraction of page width
    offsetY: number;
    rotation: number;
    blur: number; // px at page resolution
    brightness: number; // -100..100
    contrast: number; // -100..100
    saturation: number; // -100..100
    opacity: number; // 0..1
  };
  overlay: { enabled: boolean; color: string; opacity: number; blend: GlobalCompositeOperation };
  /** Decorative procedural pattern drawn over the base. */
  pattern: BgPattern;
  /** Soft spotlight glow (e.g. behind the hero asset or the title). */
  light: { enabled: boolean; color: string; x: number; y: number; size: number; strength: number };
  vignette: { enabled: boolean; strength: number; color: string };
}

export interface BgPattern {
  enabled: boolean;
  kind: 'dots' | 'grid' | 'diagonal' | 'checker' | 'rays' | 'halftone' | 'waves' | 'stars' | 'confetti' | 'bokeh' | 'noise';
  color: string;
  /** Extra colors (confetti). */
  color2?: string;
  color3?: string;
  opacity: number; // 0..1
  scale: number; // 1 = default cell size
  angle: number; // degrees
  /** Center for rays / halftone (0..1 of page). */
  cx?: number;
  cy?: number;
  seed?: number;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export type ParamValue = number | boolean | string;
export type OverlapMode = 'strict' | 'relaxed' | 'showcase';

/** A layout slot = where one item was placed: its visible box (page px). Kept for asset-set replacement. */
export interface Slot {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rot: number;
  depth?: number;
}

export interface LayoutInstance {
  id: Id;
  name: string;
  algorithm: string;
  params: Record<string, ParamValue>;
  seed: number;
  /** Managed image objects, in slot order. */
  objectIds: Id[];
  slots: Slot[];
  plane?: Quad;
  path?: Vec[];
  overlap: OverlapMode;
  maxOverlap: number; // 0..1 (showcase mode)
  avoidFocal: boolean;
  respectSafe: boolean;
  /**
   * Which of the project's icons this layout uses (absent in layouts made before 0.2: the icons it
   * holds, chosen by hand). Changing it adds or removes this layout's icons only.
   */
  assetSelection?: AssetSelection;
}

/** A choice of icons for one layout. */
export interface AssetSelection {
  mode: 'all' | 'categories' | 'manual' | 'random';
  /** 'categories', and the pool of 'random' when set. */
  categories?: string[];
  /** 'manual': the chosen assets, in order. */
  ids?: Id[];
  /** 'random': how many, and the seed that makes the pick repeatable. */
  count?: number;
  seed?: number;
}

/** A named, reusable choice of icons (per project). */
export interface SavedAssetSet {
  id: Id;
  name: string;
  ids: Id[];
}

// ---------------------------------------------------------------------------
// Page / project
// ---------------------------------------------------------------------------

export interface Guide {
  id: Id;
  axis: 'x' | 'y';
  pos: number; // page px
}

export interface SafeZone {
  enabled: boolean;
  /** Margins in percent of page size. */
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface FocalRegion {
  enabled: boolean;
  shape: 'rect' | 'ellipse';
  x: number; // center, page px
  y: number;
  w: number;
  h: number;
}

export interface Page {
  id: Id;
  name: string;
  width: number;
  height: number;
  background: Background;
  /** Bottom → top paint order. */
  objects: SceneObject[];
  groups: GroupInfo[];
  layouts: LayoutInstance[];
  guides: Guide[];
  safeZone: SafeZone;
  focal: FocalRegion;
  /** File name stem used by batch export ({page}). */
  exportName?: string;
  /** Layout from a template waiting for assets (applied by Add / Fill template). */
  templateLayout?: TemplateLayout;
  /** Set on generated catalog pages so they can be regenerated (Replace Asset Set). */
  catalog?: CatalogSettings & { assetIds: Id[]; pageIndex: number };
  /** Built-in template this page was made from — Templates-tab options re-apply to it live. */
  fromTemplate?: {
    id: string;
    assetIds: Id[];
    /** tplKeys the last build created (a key missing from the page was deleted by the user). */
    keys?: string[];
    /** What the options controlled at the last build (see state/templateMerge.ts). */
    opts?: TemplateOptsSig;
    /** The Templates-tab choices this page was built with (per page; older pages derive them from `opts`). */
    ui?: TemplatePageOptions;
    /** Version of the template's design the page was built from (absent = 1). */
    ver?: number;
  };
  /** Saved template this page was made from (for "Update template"). */
  userTemplateId?: string;
  /** Theme last applied to this page ('my:…' for a saved one), so it can be updated or shown as current. */
  lookId?: string;
  /**
   * Text the user wrote for roles a template can show (title, subtitle, badge…). Kept when the
   * page is rebuilt from another template, even one without that role, so switching back restores it.
   */
  content?: Record<string, string>;
}

/** Templates-tab choices for one page: format, look (theme), theme scope, text rendering and icon size. */
export interface TemplatePageOptions {
  /** "" = the template's own size, else a format label from the Templates tab. */
  size: string;
  /** 'auto' (icons' colours), 'none' (template's own look) or a theme id. */
  themeId: string;
  themeParts: 'all' | 'bg' | 'text';
  text: 'keep' | 'smooth' | 'pixel-soft' | 'pixel';
  icons: number;
}

/** Serializable summary of the template options that shaped a page (compared on the next rebuild). */
export interface TemplateOptsSig {
  /** "" = template's own size, else "W×H". */
  size: string;
  icons: number;
  /** Theme parts that reach the background ("" = none). */
  bg: string;
  /** Theme parts that reach text and shapes, plus the text option. */
  look: string;
}

export interface TemplateLayout extends LayoutPresetData {
  /** Slot boxes normalised to the page (0..1), for slot-preserving asset replacement. */
  slots?: Slot[];
}

export interface CatalogSettings {
  columns: number; // 0 = auto
  spacing: number; // px between cells
  margin: number; // px page margin
  fill: number; // asset size inside cell (0..1)
  labels: boolean;
  numbers: boolean;
  headers: boolean;
  labelSize: number; // fraction of cell
  labelColor: string;
  title: string;
  maxPerPage: number; // 0 = everything on one page
  cellBackground: boolean;
  /** Look of each cell (newer setting; falls back to cellBackground). */
  cellStyle?: 'none' | 'soft' | 'card' | 'outline';
  cellColor?: string;
  /** Color of category header text and its divider line. */
  headerColor?: string;
  /** Small "N assets" line under the title. */
  subtitle?: boolean;
}

export interface FontRecord {
  id: Id;
  family: string;
  fileName: string;
}

// ---------------------------------------------------------------------------
// Watermarks (non-destructive: drawn over the finished page in Review and exports, never into the page)
// ---------------------------------------------------------------------------

export type WmAnchor = 'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br';

export interface WatermarkLayer {
  id: Id;
  name: string;
  kind: 'text' | 'image';
  visible: boolean;
  locked?: boolean;
  /** Text, with tokens: {project} {page} {date} {year} {brand} {count}. */
  text: string;
  font: string;
  weight: number;
  color: string;
  /** Letter spacing in em. */
  spacing: number;
  outline: { enabled: boolean; color: string; width: number };
  shadow: { enabled: boolean; opacity: number };
  /** Logo (asset of kind 'watermark'). */
  assetId?: Id;
  /** Recolour the logo (null = its own colours). */
  tint?: string | null;
  /** Height of the text or logo as a fraction of the page's shorter side. */
  size: number;
  opacity: number;
  rotation: number;
  /** One mark, a repeated pattern across the page, or a small mark on every icon. */
  mode: 'single' | 'tile' | 'icon';
  anchor: WmAnchor;
  /** Free offset from the anchor, fractions of the shorter side. */
  dx: number;
  dy: number;
  /** Distance from the edges, fraction of the shorter side. */
  margin: number;
  tile: { gapX: number; gapY: number; angle: number; stagger: boolean };
  /** Per-icon mark: size relative to the icon. */
  iconSize: number;
}

export interface WatermarkSettings {
  enabled: boolean;
  layers: WatermarkLayer[];
  /** Which pages carry the watermark. */
  scope: 'all' | 'only';
  /** scope 'only': these pages; scope 'all': pages excluded. */
  pageIds: Id[];
}

export interface ProjectDoc {
  version: 1;
  id: Id;
  name: string;
  createdAt: number;
  updatedAt: number;
  assets: AssetRecord[];
  pages: Page[];
  activePageId: Id;
  fonts: FontRecord[];
  /** Project watermark (absent in projects made before watermarks: none). */
  watermark?: WatermarkSettings;
  /** Saved icon choices for layouts (absent in projects made before 0.2). */
  assetSets?: SavedAssetSet[];
}

export interface ProjectMeta {
  id: Id;
  name: string;
  updatedAt: number;
  /** When the project was created (missing in lists saved by older versions). */
  createdAt?: number;
  pages: number;
  assets: number;
  /** Small JPEG preview of the first page (data URL). */
  thumb?: string;
  /** Size of the first page. */
  width?: number;
  height?: number;
}

// ---------------------------------------------------------------------------
// Reusable presets (global, stored in IndexedDB)
// ---------------------------------------------------------------------------

export type PresetKind = 'text' | 'background' | 'layout' | 'export' | 'template' | 'theme' | 'watermark';

export interface StoredPreset<T = unknown> {
  id: Id;
  kind: PresetKind;
  name: string;
  createdAt: number;
  data: T;
}

export interface LayoutPresetData {
  algorithm: string;
  params: Record<string, ParamValue>;
  seed: number;
  overlap: OverlapMode;
  maxOverlap: number;
  avoidFocal: boolean;
  respectSafe: boolean;
  plane?: Quad; // stored normalised (0..1 of page)
  path?: Vec[]; // stored normalised
}

export type ExportFormat = 'png' | 'webp' | 'jpeg';

export interface ExportSettings {
  format: ExportFormat;
  quality: number; // 0..1 (webp/jpeg)
  scale: number; // 1, 2, 4 or custom
  customWidth?: number; // when set, overrides scale
  matte: string; // background for jpeg
  pattern: string; // e.g. {project}_{page}
  /** What to do when a file with the same name already exists in the export folder. */
  onConflict?: 'number' | 'overwrite';
  /** How several pages are saved: loose files in a folder, or one .zip file. */
  saveAs?: 'folder' | 'zip';
  /** Leave the page background out (PNG / WebP): only icons, text and shapes are drawn. */
  transparent?: boolean;
  /** Open the folder after exporting several pages (default on). */
  revealFolder?: boolean;
  /** Watermark in the files: the project's, none, or both a clean and a watermarked file. */
  watermark?: 'project' | 'none' | 'both';
  /** Added to the watermarked file's name when exporting both ("cover" + "_preview"). */
  previewSuffix?: string;
}
