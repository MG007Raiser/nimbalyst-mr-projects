/**
 * Poster generator: bold shapes or Hero Patterns crossed with two-color
 * palettes, rendered to SVG. Pure functions so the dock, the builder preview,
 * and the rail thumbnail all agree.
 */
import { HERO_PATTERNS, heroPatternById } from './heroPatterns';
import type { BannerSize, Palette, PosterSpec, ShapeId, TitleSpec } from './types';

export const SHAPES: { id: ShapeId; name: string }[] = [
  { id: 'diagonal', name: 'Diagonal' },
  { id: 'wave', name: 'Wave' },
  { id: 'steps', name: 'Steps' },
  { id: 'arc', name: 'Arc' },
  { id: 'stripes', name: 'Stripes' },
];

export function shapeName(id: ShapeId): string {
  return SHAPES.find((s) => s.id === id)?.name ?? id;
}

export { HERO_PATTERNS };

/** Built-in palettes: primary is the base, accent the figure, text the short-name overlay. */
export const PALETTES: (Palette & { id: string; name: string })[] = [
  { id: 'fog-sky', name: 'Fog and sky', primary: '#6b7280', accent: '#0ea5e9', text: '#ffffff' },
  { id: 'plum-coral', name: 'Plum and coral', primary: '#5b4a9e', accent: '#ff3b5c', text: '#ffffff' },
  { id: 'cherry-graphite', name: 'Cherry on graphite', primary: '#ff0a54', accent: '#374151', text: '#ffffff' },
  { id: 'slate-sky', name: 'Slate and sky', primary: '#0f172a', accent: '#38bdf8', text: '#0f172a' },
  { id: 'charcoal-mint', name: 'Charcoal and mint', primary: '#1e293b', accent: '#10b981', text: '#ffffff' },
  { id: 'ember-black', name: 'Ember on black', primary: '#f97316', accent: '#0c0a09', text: '#ffffff' },
  { id: 'pink-plum', name: 'Pink on plum', primary: '#f472b6', accent: '#1d1226', text: '#ffffff' },
  { id: 'birch-forest', name: 'Birch and forest', primary: '#fbf7f0', accent: '#2f7d4f', text: '#ffffff' },
  { id: 'frost-nord', name: 'Frost on nord', primary: '#88c0d0', accent: '#2e3440', text: '#ffffff' },
  { id: 'gold-rust', name: 'Gold and rust', primary: '#facc15', accent: '#7c2d12', text: '#ffffff' },
  { id: 'ocean-coral', name: 'Ocean and coral', primary: '#0e7490', accent: '#fb7185', text: '#ffffff' },
  { id: 'lavender-indigo', name: 'Lavender and indigo', primary: '#c4b5fd', accent: '#3730a3', text: '#ffffff' },
  { id: 'sand-terracotta', name: 'Sand and terracotta', primary: '#f5e6c8', accent: '#c2410c', text: '#ffffff' },
  { id: 'teal-night', name: 'Teal on night', primary: '#042f2e', accent: '#14b8a6', text: '#042f2e' },
  { id: 'lemon-ink', name: 'Lemon and ink', primary: '#fef08a', accent: '#1e293b', text: '#fef08a' },
  { id: 'rose-wine', name: 'Rose and wine', primary: '#fecdd3', accent: '#881337', text: '#ffffff' },
  { id: 'steel-orange', name: 'Steel and orange', primary: '#334155', accent: '#fb923c', text: '#1c1917' },
  { id: 'moss-cream', name: 'Moss and cream', primary: '#3f6212', accent: '#fef3c7', text: '#3f6212' },
  { id: 'grape-lime', name: 'Grape and lime', primary: '#4c1d95', accent: '#a3e635', text: '#1a2e05' },
  { id: 'ink-paper', name: 'Ink and paper', primary: '#18181b', accent: '#e4e4e7', text: '#18181b' },
];

export function samePalette(a: Palette, b: Palette): boolean {
  return a.primary.toLowerCase() === b.primary.toLowerCase() && a.accent.toLowerCase() === b.accent.toLowerCase() && a.text.toLowerCase() === b.text.toLowerCase();
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function lighten(hex: string, t: number): string {
  if (!/^#[0-9a-f]{3,8}$/i.test(hex)) return hex;
  const [r, g, b] = hexToRgb(hex);
  const mixc = (c: number) => Math.round(t >= 0 ? c + (255 - c) * t : c * (1 + t));
  return `#${[mixc(r), mixc(g), mixc(b)].map((c) => clamp(c, 0, 255).toString(16).padStart(2, '0')).join('')}`;
}

function hslToHex(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function luminance(hex: string): number {
  const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio of two hex colors, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * A random palette that hangs together: a dark or light base, an accent in a
 * complementary, split or analogous hue at medium lightness, and whichever of
 * white or near-black reads better on the accent (the title mostly sits on it).
 */
export function randomPalette(rand: () => number = Math.random): Palette {
  const hue = Math.floor(rand() * 360);
  const offsets = [180, 150, 210, 30, -30, 120];
  const accentHue = (hue + offsets[Math.floor(rand() * offsets.length)] + 360) % 360;
  const darkBase = rand() < 0.6;
  const primary = hslToHex(hue, 35 + rand() * 35, darkBase ? 12 + rand() * 16 : 82 + rand() * 10);
  const accent = hslToHex(accentHue, 60 + rand() * 30, 45 + rand() * 15);
  const text = contrastRatio('#ffffff', accent) >= contrastRatio('#111827', accent) ? '#ffffff' : '#111827';
  return { primary, accent, text };
}

export function isDarkHex(hex: string): boolean {
  if (!/^#[0-9a-f]{3,8}$/i.test(hex)) return true;
  const [r, g, b] = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.55;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** The shape path in a 400x400 box. The shape is the "to" color; the base is "from". */
function shapePath(shape: ShapeId): { d: string; shadow: boolean } {
  switch (shape) {
    case 'diagonal':
      return { d: 'M400,0 L400,400 L0,400 Z', shadow: false };
    case 'wave':
      return {
        d: 'M400,30 C370,30 360,60 350,100 C340,140 320,130 290,130 C255,130 250,160 245,200 C240,240 215,235 190,235 C160,235 160,265 155,300 C150,335 130,335 100,340 C70,345 60,380 10,400 L400,400 Z',
        shadow: true,
      };
    case 'steps':
      return { d: 'M400,44 L322,68 L300,140 L222,164 L200,236 L122,260 L100,332 L22,356 L0,400 L400,400 Z', shadow: true };
    case 'arc':
      return { d: 'M400,80 A320,320 0 0 0 80,400 L400,400 Z', shadow: false };
    case 'stripes':
      return { d: 'M0,0 H400 V56 H0 Z M0,112 H400 V168 H0 Z M0,224 H400 V280 H0 Z M0,336 H400 V392 H0 Z', shadow: false };
  }
}

function titleFont(size: TitleSpec['size']): number {
  return size === 'S' ? 26 : size === 'M' ? 36 : size === 'XL' ? 60 : 48;
}

/** Approximate advance width of heavy system text, in em, good enough to decide line breaks. */
const EM_PER_CHAR = 0.58;

/**
 * Wrap a label into at most two lines that fit maxWidth at the given font
 * size. Breaks at spaces when possible, otherwise inside the word; the second
 * line is cut with an ellipsis if the text still does not fit.
 */
export function wrapTitle(label: string, fontSize: number, maxWidth: number): string[] {
  const fits = (s: string) => s.length * fontSize * EM_PER_CHAR <= maxWidth;
  const maxChars = Math.max(1, Math.floor(maxWidth / (fontSize * EM_PER_CHAR)));
  const text = label.trim().replace(/\s+/g, ' ');
  if (!text) return [];
  if (fits(text)) return [text];

  // Break opportunities: after a space (dropped) or after a hyphen (kept).
  const tokens = text.split(' ').flatMap((w, wi) => w.split(/(?<=-)/).map((part, pi) => ({ part, spaceBefore: pi === 0 && wi > 0 })));
  const join = (from: number, to: number) => tokens.slice(from, to).map((t, k) => (k > 0 && t.spaceBefore ? ` ${t.part}` : t.part)).join('');
  let i = 0;
  let first = '';
  for (; i < tokens.length; i++) {
    const candidate = join(0, i + 1);
    if (fits(candidate)) first = candidate;
    else break;
  }
  if (!first) {
    // A single token longer than the line: break inside it.
    first = tokens[0].part.slice(0, maxChars);
    tokens[0] = { part: tokens[0].part.slice(maxChars), spaceBefore: false };
    i = 0;
  }
  let rest = join(i, tokens.length).trim();
  if (!rest) return [first];
  if (!fits(rest)) rest = `${rest.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
  return [first, rest];
}

export interface PosterRenderOptions {
  /** Short name to overlay bottom-left when title.show. */
  title?: string;
  /** Omit the title overlay entirely (thumbnails). */
  noTitle?: boolean;
  /** Aspect: square (400x400) or banner (400 wide, height from the spec's size preset). */
  aspect?: 'square' | 'banner';
}

/** Banner height in the 400-wide box per size preset, with the title's font scale and edge padding. */
export const BANNER_SIZES: Record<BannerSize, { height: number; font: number; pad: number }> = {
  large: { height: 225, font: 0.8, pad: 24 },
  medium: { height: 150, font: 0.66, pad: 20 },
  small: { height: 90, font: 0.5, pad: 14 },
};

/** Render a poster spec to a standalone SVG string. Fills are solid: primary base, accent figure, text overlay. */
export function posterSvg(spec: PosterSpec, opts: PosterRenderOptions = {}): string {
  const { palette, title } = spec;
  const W = 400;
  const banner = opts.aspect === 'banner' ? BANNER_SIZES[spec.size] ?? BANNER_SIZES.large : null;
  const H = banner ? banner.height : 400;
  const isPattern = spec.source === 'pattern';
  const base = palette.primary;
  const fig = palette.accent;

  let body = '';
  let defs = '';
  if (isPattern) {
    const p = heroPatternById(spec.pattern.id) ?? HERO_PATTERNS[0];
    const s = spec.pattern.scale;
    defs += `<pattern id="hp" width="${(p.w * s).toFixed(2)}" height="${(p.h * s).toFixed(2)}" patternUnits="userSpaceOnUse"><g fill="${fig}" fill-opacity="${spec.pattern.opacity}" transform="scale(${s})">${p.body}</g></pattern>`;
    body = `<rect width="${W}" height="${H}" fill="${base}"/><rect width="${W}" height="${H}" fill="url(#hp)"/>`;
  } else {
    const path = shapePath(spec.shape);
    if (path.shadow) defs += `<filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="-6" dy="6" stdDeviation="9" flood-color="#000" flood-opacity="0.35"/></filter>`;
    // The shape is authored in a 400x400 box; for banners, anchor it to the bottom so the composition survives the crop.
    const shift = H - 400;
    body = `<rect width="${W}" height="${H}" fill="${base}"/><path d="${path.d}" fill="${fig}"${path.shadow ? ' filter="url(#sh)"' : ''}${shift ? ` transform="translate(0 ${shift})"` : ''}/>`;
  }

  let text = '';
  const label = (opts.title ?? '').trim();
  if (!opts.noTitle && label) {
    const fs = Math.round(titleFont(title.size) * (banner ? banner.font : 1));
    const pad = banner ? banner.pad : 24;
    const shadow = `text-shadow: 0 2px 8px rgba(0,0,0,.35)`;
    // Up to two lines, anchored to the same bottom baseline whether there are one or two.
    const lines = wrapTitle(label, fs, W - pad * 2);
    const lineHeight = Math.round(fs * 1.02);
    const baseline = H - pad;
    const x = title.align === 'center' ? W / 2 : title.align === 'right' ? W - pad : pad;
    const anchor = title.align === 'center' ? 'middle' : title.align === 'right' ? 'end' : 'start';
    const tspans = lines.map((line, idx) => `<tspan x="${x}" y="${baseline - (lines.length - 1 - idx) * lineHeight}">${esc(line)}</tspan>`).join('');
    text = `<text text-anchor="${anchor}" font-family="-apple-system, 'SF Pro Display', Inter, system-ui, sans-serif" font-size="${fs}" font-weight="800" letter-spacing="-0.02em" fill="${palette.text}" style="${shadow}">${tspans}</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"><defs>${defs}</defs>${body}${text}</svg>`;
}

export function posterDataUri(spec: PosterSpec, opts: PosterRenderOptions = {}): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(posterSvg(spec, opts))}`;
}

/** Dominant color of a poster, used for tile fallbacks. */
export function posterAccent(p: Palette): string {
  return p.accent;
}

/** True for POSIX (`/x`), Windows drive (`C:\x`, `C:/x`) and UNC (`\\server\share`) paths. */
export function isAbsolutePath(p: string): boolean {
  return p.startsWith('/') || p.startsWith('\\\\') || /^[A-Za-z]:[\\/]/.test(p);
}

/** Join a project path and a look-file path (relative or absolute) into an absolute path with forward slashes. */
export function resolveProjectPath(projectPath: string, file: string): string {
  const abs = isAbsolutePath(file) ? file : `${projectPath.replace(/[\\/]+$/, '')}/${file}`;
  return abs.replace(/\\/g, '/');
}

/**
 * file:// URL for a project file. Handles POSIX paths, Windows drive-letter paths
 * (`H:\proj\x.svg` -> `file:///H:/proj/x.svg`) and UNC paths (`\\srv\share\x` -> `file://srv/share/x`).
 * A drive-letter path needs a leading slash, otherwise Chromium reads the drive letter as the URL host.
 */
export function fileUrl(projectPath: string, relative: string): string {
  const abs = resolveProjectPath(projectPath, relative);
  if (abs.startsWith('//')) return `file:${encodeURI(abs)}`;
  return `file://${encodeURI(abs.startsWith('/') ? abs : `/${abs}`)}`;
}

/** Image source for a look's poster, or null when it has none. */
export function posterSrc(projectPath: string, look: { poster: PosterSpec } | null, opts: PosterRenderOptions = {}): string | null {
  if (!look) return null;
  const p = look.poster;
  if (p.source === 'generated' || p.source === 'pattern') return posterDataUri(p, opts);
  if (p.source === 'image' && p.file) return fileUrl(projectPath, p.file);
  return null;
}
