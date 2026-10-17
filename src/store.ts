/**
 * Shared state for the Mr. Projects extension: extension context, the
 * user-wide cache of project looks (so the rail can paint projects that are
 * not open), the rail layout (order plus dividers), a tiny event bus, both
 * bridges (to and from Mr. Themes), and the two host actions the SDK
 * does not expose (open a folder, open the Mr. Projects settings screen).
 */
import type { ExtensionContext } from '@nimbalyst/extension-sdk';
import { assetFileName, posterSrc } from './poster';
import { defaultLook, LOOK_FILE, newId, normalizeLayout, normalizeLook, normalizeSavedPalettes, projectNameOf, type Palette, type ProjectLook, type RailEntry, type RailSize, type SavedPalette } from './types';

const NS = 'com.fireworklabs.project-theme';
const KEY_LOOKS = 'projectLooks';
const KEY_WIDE = 'wideRail';
const KEY_RAIL_SIZE = 'railSize';
const KEY_LAYOUT = 'railLayout';
const KEY_PALETTES = 'customPalettes';

let ctx: ExtensionContext | null = null;
export function setExtensionContext(c: ExtensionContext | null): void {
  ctx = c;
}
export function getExtensionContext(): ExtensionContext | null {
  return ctx;
}

type Listener = () => void;
const listeners = new Set<Listener>();
export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function emit(): void {
  listeners.forEach((l) => l());
}

function lsGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(`${NS}/${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function lsSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(`${NS}/${key}`, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}
function cfgGet<T>(key: string): T | null {
  try {
    return ctx?.services.configuration?.get<T | null>(key, null) ?? null;
  } catch {
    return null;
  }
}
async function cfgSet(key: string, value: unknown): Promise<void> {
  try {
    await ctx?.services.configuration?.update(key, value, 'user');
  } catch (e) {
    console.warn('[project-theme] configuration update failed', e);
  }
}

/* ---- Looks cache ---- */

let looksCache: Record<string, ProjectLook> | null = null;

export function getLooksCache(): Record<string, ProjectLook> {
  if (looksCache) return looksCache;
  const raw = cfgGet<Record<string, unknown>>(KEY_LOOKS) ?? lsGet<Record<string, unknown>>(KEY_LOOKS) ?? {};
  const out: Record<string, ProjectLook> = {};
  for (const [k, v] of Object.entries(raw)) out[k] = normalizeLook(v);
  looksCache = out;
  return out;
}

export function getLook(projectPath: string): ProjectLook | null {
  return getLooksCache()[projectPath] ?? null;
}

async function persistCache(): Promise<void> {
  const c = getLooksCache();
  lsSet(KEY_LOOKS, c);
  await cfgSet(KEY_LOOKS, c);
}

export async function setLookInCache(projectPath: string, look: ProjectLook | null): Promise<void> {
  const c = getLooksCache();
  if (look) c[projectPath] = look;
  else delete c[projectPath];
  await persistCache();
  emit();
}

/* ---- User-wide preferences ---- */

const RAIL_SIZES: RailSize[] = ['small', 'medium', 'wide'];

/** Rail size; before railSize existed, the wideRail boolean chose between small and wide. */
export function getRailSize(): RailSize {
  const v = cfgGet<string>(KEY_RAIL_SIZE) ?? lsGet<string>(KEY_RAIL_SIZE);
  if (RAIL_SIZES.includes(v as RailSize)) return v as RailSize;
  const wide = cfgGet<boolean>(KEY_WIDE);
  return (typeof wide === 'boolean' ? wide : lsGet<boolean>(KEY_WIDE) ?? false) ? 'wide' : 'small';
}

export async function setRailSize(size: RailSize): Promise<void> {
  lsSet(KEY_RAIL_SIZE, size);
  await cfgSet(KEY_RAIL_SIZE, size);
  // Keep wideRail in step so an older Mr. Projects still shows a sensible rail.
  lsSet(KEY_WIDE, size === 'wide');
  await cfgSet(KEY_WIDE, size === 'wide');
  emit();
}

let layoutCache: RailEntry[] | null = null;
export function getRailLayout(): RailEntry[] {
  if (layoutCache) return layoutCache;
  layoutCache = normalizeLayout(cfgGet<unknown>(KEY_LAYOUT) ?? lsGet<unknown>(KEY_LAYOUT) ?? []);
  return layoutCache;
}

export async function setRailLayout(layout: RailEntry[]): Promise<void> {
  layoutCache = normalizeLayout(layout);
  lsSet(KEY_LAYOUT, layoutCache);
  await cfgSet(KEY_LAYOUT, layoutCache);
  emit();
}

/* ---- User-wide saved palettes ---- */

let palettesCache: SavedPalette[] | null = null;
export function getSavedPalettes(): SavedPalette[] {
  if (palettesCache) return palettesCache;
  palettesCache = normalizeSavedPalettes(cfgGet<unknown>(KEY_PALETTES) ?? lsGet<unknown>(KEY_PALETTES) ?? []);
  return palettesCache;
}

async function persistPalettes(next: SavedPalette[]): Promise<void> {
  palettesCache = normalizeSavedPalettes(next);
  lsSet(KEY_PALETTES, palettesCache);
  await cfgSet(KEY_PALETTES, palettesCache);
  emit();
}

export async function savePalette(name: string, colors: Palette): Promise<SavedPalette> {
  const entry: SavedPalette = { id: newId(), name: name.trim() || 'Custom', ...colors };
  await persistPalettes([...getSavedPalettes(), entry]);
  return entry;
}

export async function deletePalette(id: string): Promise<void> {
  await persistPalettes(getSavedPalettes().filter((p) => p.id !== id));
}

/* ---- Project files ---- */

/** Read <project>/.nimbalyst/project-theme.json. Returns null when absent or unreadable. */
export async function readLookFile(projectPath: string): Promise<ProjectLook | null> {
  const fs = ctx?.services.filesystem;
  if (!fs) return null;
  const path = `${projectPath.replace(/\/+$/, '')}/${LOOK_FILE}`;
  try {
    if (!(await fs.fileExists(path))) return null;
    return normalizeLook(JSON.parse(await fs.readFile(path)));
  } catch (e) {
    console.warn('[project-theme] could not read', path, e);
    return null;
  }
}

export async function writeLookFile(projectPath: string, look: ProjectLook): Promise<void> {
  const fs = ctx?.services.filesystem;
  if (!fs) throw new Error('File system access is not available');
  const path = `${projectPath.replace(/\/+$/, '')}/${LOOK_FILE}`;
  await fs.writeFile(path, JSON.stringify(look, null, 2) + '\n');
}

export async function writeProjectFile(projectPath: string, relative: string, content: string | Uint8Array): Promise<void> {
  const fs = ctx?.services.filesystem;
  if (!fs) throw new Error('File system access is not available');
  await fs.writeFile(`${projectPath.replace(/\/+$/, '')}/${relative}`, content);
}

const MAX_ASSET_BYTES = 25 * 1024 * 1024;

/** Write an image into the project's .nimbalyst/ folder; returns its project-relative path. */
export async function writeProjectAsset(projectPath: string, fileName: string, bytes: Uint8Array): Promise<string> {
  if (bytes.byteLength > MAX_ASSET_BYTES) throw new Error(`The image is ${(bytes.byteLength / 1048576).toFixed(1)} MB; the limit is 25 MB`);
  const rel = `.nimbalyst/${fileName}`;
  await writeProjectFile(projectPath, rel, bytes);
  return rel;
}

/** Download an image URL into the project's .nimbalyst/ folder; returns its project-relative path. */
export async function downloadProjectAsset(projectPath: string, url: string): Promise<string> {
  const res = await fetch(url.trim());
  if (!res.ok) throw new Error(`the server answered ${res.status}`);
  const type = res.headers.get('content-type') ?? '';
  if (type && !type.toLowerCase().startsWith('image/')) {
    throw new Error(type.includes('html') ? 'that address is a web page, not an image (copy the image address instead)' : `that address is ${type.split(';')[0]}, not an image`);
  }
  return writeProjectAsset(projectPath, assetFileName(url, type), new Uint8Array(await res.arrayBuffer()));
}

/** Refresh one project's cache entry from its file on disk. */
export async function refreshFromDisk(projectPath: string): Promise<ProjectLook | null> {
  const fromDisk = await readLookFile(projectPath);
  const cached = getLook(projectPath);
  const same = JSON.stringify(fromDisk) === JSON.stringify(cached);
  if (!same) await setLookInCache(projectPath, fromDisk);
  return fromDisk;
}

/** Save a look to the project file and the cache in one go. */
export async function saveLook(projectPath: string, look: ProjectLook): Promise<void> {
  await writeLookFile(projectPath, look);
  await setLookInCache(projectPath, look);
}

export function toast(kind: 'info' | 'warning' | 'error', message: string): void {
  const ui = ctx?.services.ui;
  if (!ui) return;
  if (kind === 'info') ui.showInfo(message);
  else if (kind === 'warning') ui.showWarning(message);
  else ui.showError(message);
}

/* ---- Host actions outside the SDK ---- */

type HostFn = (...args: unknown[]) => Promise<unknown>;
interface HostApi {
  openInDefaultApp?: HostFn;
  showInFinder?: HostFn;
  invokeWindowMenuItem?: HostFn;
}

function hostApi(): HostApi {
  return ((window as unknown as { electronAPI?: HostApi }).electronAPI ?? {}) as HostApi;
}

export function isMac(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform) || /Macintosh/.test(navigator.userAgent);
}
export function isWindows(): boolean {
  return /Win/.test(navigator.platform);
}

/** "Open in Finder" on macOS, "Open in Explorer" on Windows, "Open folder" elsewhere. */
export function openFolderLabel(): string {
  return isMac() ? 'Open in Finder' : isWindows() ? 'Open in Explorer' : 'Open folder';
}

/**
 * Open the project folder in the platform file manager. Nimbalyst's preload
 * bridge (window.electronAPI) exposes openInDefaultApp, which for a folder
 * opens it in the Finder; showInFinder is the fallback. Verified on 0.77.5.
 */
export async function openProjectFolder(projectPath: string): Promise<void> {
  const api = hostApi();
  const attempt = async (fn: HostFn | undefined): Promise<boolean> => {
    if (typeof fn !== 'function') return false;
    try {
      const r = (await fn.call(api, projectPath)) as { success?: boolean } | undefined;
      return r === undefined || r === null || r.success !== false;
    } catch {
      return false;
    }
  };
  if (await attempt(api.openInDefaultApp)) return;
  if (await attempt(api.showInFinder)) return;
  toast('error', 'Could not open the project folder from this version of Nimbalyst.');
}

const SETTINGS_VIEW = '.settings-view';
const SETTINGS_PROJECT_TAB = '[data-testid="settings-scope-project"]';
// Extension routes are keyed "ext:<extensionId>:<routeId>" in the Settings sidebar (0.77.5).
const SETTINGS_OUR_ROUTE = '[data-testid="settings-route-ext:com.fireworklabs.project-theme:project-theme"]';

async function waitFor<T extends Element>(selector: string, timeoutMs: number): Promise<T | null> {
  const started = performance.now();
  for (;;) {
    const el = document.querySelector<T>(selector);
    if (el) return el;
    if (performance.now() - started > timeoutMs) return null;
    await new Promise((r) => setTimeout(r, 60));
  }
}

/**
 * Open Project Settings › Mr. Projects for the active project.
 *
 * The SDK has no settings navigation, so this drives the app's own UI:
 * window.electronAPI.openAccountSettings() opens the Settings view (verified
 * on 0.77.5; a synthetic ⌘, keydown does nothing), then we click the
 * "Project" scope tab and our route's sidebar entry
 * (settings-route-ext:<extensionId>:<routeId>), both of which carry
 * data-testid attributes.
 */
export async function openProjectThemeSettings(): Promise<void> {
  const api = hostApi() as HostApi & { openAccountSettings?: HostFn };
  if (!document.querySelector(SETTINGS_VIEW)) {
    if (typeof api.openAccountSettings !== 'function') {
      toast('info', 'Open Settings (⌘,) › Project › Extensions › Mr. Projects.');
      return;
    }
    try {
      await api.openAccountSettings.call(api);
    } catch {
      /* fall through to the wait below */
    }
    if (!(await waitFor(SETTINGS_VIEW, 3000))) {
      toast('info', 'Open Settings (⌘,) › Project › Extensions › Mr. Projects.');
      return;
    }
  }
  const projectTab = await waitFor<HTMLButtonElement>(SETTINGS_PROJECT_TAB, 1500);
  if (projectTab && !document.querySelector(SETTINGS_OUR_ROUTE)) projectTab.click();
  const route = await waitFor<HTMLButtonElement>(SETTINGS_OUR_ROUTE, 2500);
  if (!route) {
    toast('info', 'In Settings, choose Project › Extensions › Mr. Projects.');
    return;
  }
  route.click();
}

/* ---- Rail projects (fed by RailEnhancer) ---- */

export interface RailProject {
  path: string;
  name: string;
  active: boolean;
  badge: string;
}

let railProjects: RailProject[] = [];
export function setRailProjects(items: RailProject[]): void {
  const sig = JSON.stringify(items);
  if (sig === JSON.stringify(railProjects)) return;
  railProjects = items;
  emit();
}
export function getRailProjects(): RailProject[] {
  return railProjects;
}

/**
 * Projects in rail order: the saved layout first (skipping projects that are
 * not open), then any open project the layout does not know yet.
 */
export function orderedEntries(items: RailProject[] = railProjects): RailEntry[] {
  const open = new Map(items.map((i) => [i.path, i]));
  const out: RailEntry[] = [];
  const placed = new Set<string>();
  for (const e of getRailLayout()) {
    if (e.kind === 'project') {
      if (!open.has(e.path)) continue;
      placed.add(e.path);
    }
    out.push(e);
  }
  for (const i of items) if (!placed.has(i.path)) out.push({ kind: 'project', path: i.path });
  return out;
}

export function orderedProjects(items: RailProject[] = railProjects): RailProject[] {
  const byPath = new Map(items.map((i) => [i.path, i]));
  return orderedEntries(items).flatMap((e) => (e.kind === 'project' ? [byPath.get(e.path)!] : []));
}

/* ---- Mr. Themes bridge (what we consume) ---- */

export interface ThemeSummary {
  id: string;
  name: string;
  isDark: boolean;
  colors: Record<string, string | undefined>;
}

interface Bridge {
  version: number;
  listThemes(): ThemeSummary[];
  getTheme(id: string): ThemeSummary | null;
  setOverride(themeOrId: unknown): void;
  subscribe(fn: (s: unknown) => void): () => void;
}

export function getBridge(): Bridge | null {
  const b = (window as unknown as { __nimbalystThemeEditor?: Bridge }).__nimbalystThemeEditor;
  return b && typeof b.listThemes === 'function' && typeof b.setOverride === 'function' ? b : null;
}

export const THEME_EDITOR_ID = 'com.fireworklabs.theme-editor';

/* ---- Mr. Projects bridge (what we provide to Mr. Themes) ---- */

export interface ProjectInfo {
  path: string;
  name: string;
  label: string;
  active: boolean;
  themeId: string | null;
  posterUri: string | null;
}

export interface ProjectThemeBridge {
  version: 1;
  listProjects(): ProjectInfo[];
  setProjectTheme(path: string, themeId: string | null): Promise<void>;
  subscribe(fn: () => void): () => void;
}

export function installProjectBridge(): void {
  const bridge: ProjectThemeBridge = {
    version: 1,
    listProjects: () =>
      orderedProjects().map((p) => {
        const look = getLook(p.path);
        return {
          path: p.path,
          name: p.name,
          label: look?.shortName || p.name || projectNameOf(p.path),
          active: p.active,
          themeId: look?.themeId ?? null,
          posterUri: posterSrc(p.path, look, { noTitle: true }),
        };
      }),
    setProjectTheme: async (path, themeId) => {
      const current = (await readLookFile(path)) ?? getLook(path) ?? defaultLook();
      const next: ProjectLook = { ...current, themeId };
      await saveLook(path, next);
    },
    subscribe: (fn) => subscribe(fn),
  };
  (window as unknown as { __nimbalystProjectTheme?: ProjectThemeBridge }).__nimbalystProjectTheme = bridge;
}

export function uninstallProjectBridge(): void {
  delete (window as unknown as { __nimbalystProjectTheme?: ProjectThemeBridge }).__nimbalystProjectTheme;
}
