/**
 * Offline checks for the pure model code (no app needed): rail layout merge,
 * look-file normalization across 0.2 / 0.3 / current formats, the poster SVG,
 * and the short-name wrap. Run with `npm test`.
 *
 * Run from the repository root (npm test does). These replace the throwaway
 * /tmp scripts used during the 2026-09-20 and 2026-09-23 sessions
 * (pt-check.ts, pt-wrap.ts, pt-layout.ts).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeRailLayout, normalizeLook, tileLettersOf, type RailEntry } from '../src/types';
import { contrastRatio, fileUrl, isAbsolutePath, PALETTES, posterSvg, randomPalette, resolveProjectPath, wrapTitle } from '../src/poster';

let n = 0;
const ok = (m: string) => { n++; console.log('PASS', m); };

// ---- mergeRailLayout: deleted dividers stay deleted, closed projects are carried over
const saved: RailEntry[] = [
  { kind: 'project', path: '/a' },
  { kind: 'rule', id: 'r1' },
  { kind: 'text', id: 't1', label: 'Work' },
  { kind: 'project', path: '/b' },
  { kind: 'project', path: '/closed' },
];
const without = (id: string) => saved.filter((e) => e.kind === 'project' ? e.path !== '/closed' : e.id !== id);
assert.deepEqual(mergeRailLayout(without('r1'), saved).map((e) => e.kind), ['project', 'text', 'project', 'project']); ok('deleting a rule removes it');
assert.deepEqual(mergeRailLayout(without('t1'), saved).map((e) => e.kind), ['project', 'rule', 'project', 'project']); ok('deleting a heading removes it');
const reordered: RailEntry[] = [{ kind: 'project', path: '/b' }, { kind: 'rule', id: 'r1' }, { kind: 'text', id: 't1', label: 'Work' }, { kind: 'project', path: '/a' }];
const merged = mergeRailLayout(reordered, saved);
assert.deepEqual(merged.slice(0, 4), reordered); assert.deepEqual(merged[4], { kind: 'project', path: '/closed' }); ok('reorder keeps the closed project at the end');

// ---- normalizeLook: a sample 0.3-era look file
const sample = normalizeLook(JSON.parse(readFileSync('tests/fixtures/project-theme.json', 'utf8')));
assert.equal(sample.version, 1); assert.equal(sample.themeId, 'grove-dark-juicy'); assert.equal(sample.shortName, 'Sandbox');
assert.deepEqual(sample.poster.palette, { primary: '#1e293b', accent: '#10b981', text: '#ffffff' });
assert.equal(sample.poster.openFolderButton, true); assert.equal(sample.poster.show, true); ok('sample look file normalizes');

// ---- normalizeLook: a 0.2 file maps onto the current model
const v02 = normalizeLook({
  shortName: 'Old', icon: { kind: 'emoji', emoji: 'x' }, tile: { kind: 'auto' },
  poster: { source: 'none', shape: 'diagonal-shadow', palette: { from: '#000000', to: '#ffffff', gradient: true }, title: { color: 'auto', show: true } },
});
assert.equal(v02.poster.shape, 'diagonal'); assert.equal(v02.poster.show, false); assert.deepEqual(v02.icon, { kind: 'initials' });
assert.deepEqual(v02.tile, { kind: 'gradient', from: '#000000', to: '#ffffff', angle: 135 });
assert.equal(v02.poster.palette.text, '#111827'); ok('0.2 file: diagonal-shadow, source none, emoji icon, auto tile, auto text');

// ---- posterSvg: solid fills only, text in the palette's text color
const svg = posterSvg(sample.poster, { title: 'Sandbox', aspect: 'banner' });
assert.ok(!svg.includes('linearGradient')); assert.ok(svg.includes('fill="#1e293b"')); assert.ok(svg.includes('fill="#ffffff"'));
assert.ok(svg.includes('viewBox="0 0 400 225"')); ok('banner SVG: no gradient, palette fills, 16:9');

// ---- tile letters: up to three, trimmed, empty falls back to initials; the over-picture flag survives
assert.equal(sample.tileLetters, ''); assert.equal(tileLettersOf(sample, 'GitHub'), 'GI');
assert.equal(normalizeLook({ tileLetters: '  G ' }).tileLetters, 'G'); assert.equal(normalizeLook({ tileLetters: 'ABCD' }).tileLetters, 'ABC');
assert.equal(tileLettersOf(normalizeLook({ tileLetters: 'G' }), 'GitHub'), 'G');
assert.deepEqual(normalizeLook({ icon: { kind: 'poster', letters: true } }).icon, { kind: 'poster', letters: true });
assert.deepEqual(normalizeLook({ icon: { kind: 'image', file: 'x.png' } }).icon, { kind: 'image', file: 'x.png', letters: false }); ok('tile letters normalize');

// ---- banner size presets: default large, file value kept, junk falls back; SVG height and title follow the size
assert.equal(sample.poster.size, 'large'); assert.equal(normalizeLook({ poster: { size: 'medium' } }).poster.size, 'medium');
assert.equal(normalizeLook({ poster: { size: 'small', show: false } }).poster.size, 'small'); assert.equal(normalizeLook({ poster: { size: 'huge' } }).poster.size, 'large');
assert.equal(normalizeLook({ poster: { size: 'small', show: false } }).poster.show, false); ok('banner size normalizes');
const sized = (size: 'small' | 'medium' | 'large') => posterSvg({ ...sample.poster, size }, { title: 'Sandbox', aspect: 'banner' });
assert.ok(sized('large').includes('viewBox="0 0 400 225"') && sized('large').includes('font-size="38"'));
assert.ok(sized('medium').includes('viewBox="0 0 400 150"') && sized('medium').includes('font-size="32"'));
assert.ok(sized('small').includes('viewBox="0 0 400 90"') && sized('small').includes('font-size="24"') && sized('small').includes('<tspan x="14" y="76">'));
assert.ok(sized('small').includes('translate(0 -310)'));
assert.ok(posterSvg({ ...sample.poster, size: 'small' }, { noTitle: true }).includes('viewBox="0 0 400 400"')); ok('banner SVG height, title size and padding follow the size; square is unaffected');

// ---- short name: XL size and left / center / right alignment
assert.deepEqual(sample.poster.title, { size: 'L', align: 'left' });
assert.deepEqual(normalizeLook({ poster: { title: { size: 'XL', align: 'center' } } }).poster.title, { size: 'XL', align: 'center' });
assert.equal(normalizeLook({ poster: { title: { align: 'middle' } } }).poster.title.align, 'left');
const titled = (align: 'left' | 'center' | 'right') => posterSvg({ ...sample.poster, title: { size: 'XL', align } }, { title: 'Sandbox', aspect: 'banner' });
assert.ok(titled('left').includes('text-anchor="start"') && titled('left').includes('<tspan x="24"') && titled('left').includes('font-size="48"'));
assert.ok(titled('center').includes('text-anchor="middle"') && titled('center').includes('<tspan x="200"'));
assert.ok(titled('right').includes('text-anchor="end"') && titled('right').includes('<tspan x="376"')); ok('short name XL and alignment');

// ---- palettes: 20 unique built-ins; random palettes are valid hex and pick the better text color for the accent
assert.equal(PALETTES.length, 20); assert.equal(new Set(PALETTES.map((p) => p.id)).size, 20);
let seed = 7; const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
for (let i = 0; i < 200; i++) {
  const p = randomPalette(rng);
  assert.ok([p.primary, p.accent, p.text].every((c) => /^#[0-9a-f]{6}$/.test(c)), JSON.stringify(p));
  const other = p.text === '#ffffff' ? '#111827' : '#ffffff';
  assert.ok(contrastRatio(p.text, p.accent) >= contrastRatio(other, p.accent));
}
assert.ok(Math.abs(contrastRatio('#ffffff', '#000000') - 21) < 0.01); ok('palettes and randomPalette');

// ---- wrapTitle: at most two lines, break after hyphens or at spaces, ellipsis on overflow
assert.deepEqual(wrapTitle('Sandbox', 40, 352), ['Sandbox']);
assert.deepEqual(wrapTitle('UX-review-checklist', 40, 352), ['UX-review-', 'checklist']);
assert.deepEqual(wrapTitle('Field Notes Q3 partner review board', 40, 352), ['Field Notes Q3', 'partner review…']); ok('short-name wrap');


// ---- fileUrl: POSIX, Windows drive-letter and UNC paths all become URLs Chromium will load
const WIN = 'H:' + String.fromCharCode(92) + 'AI-Workhub';             // H:\AI-Workhub
const BS = String.fromCharCode(92);
assert.equal(fileUrl('/Users/me/proj', '.nimbalyst/icon.svg'), 'file:///Users/me/proj/.nimbalyst/icon.svg');
assert.equal(fileUrl('/Users/me/proj/', '/abs/elsewhere.png'), 'file:///abs/elsewhere.png');
assert.equal(fileUrl(WIN, '.nimbalyst/icon.svg'), 'file:///H:/AI-Workhub/.nimbalyst/icon.svg');
assert.equal(fileUrl('H:/AI-Workhub/', `.nimbalyst${BS}icon.svg`), 'file:///H:/AI-Workhub/.nimbalyst/icon.svg');
assert.equal(fileUrl(WIN, `C:${BS}Shared${BS}logo.png`), 'file:///C:/Shared/logo.png');
assert.equal(fileUrl(WIN, '/H:/AI-Workhub/.nimbalyst/icon.svg'), 'file:///H:/AI-Workhub/.nimbalyst/icon.svg');
assert.equal(fileUrl(`${BS}${BS}srv${BS}share${BS}proj`, 'icon.svg'), 'file://srv/share/proj/icon.svg');
assert.equal(fileUrl('/Users/me/my proj', 'icon 2.svg'), 'file:///Users/me/my%20proj/icon%202.svg'); ok('fileUrl handles POSIX, Windows and UNC paths');
assert.equal(isAbsolutePath('/x'), true); assert.equal(isAbsolutePath(`C:${BS}x`), true); assert.equal(isAbsolutePath('c:/x'), true);
assert.equal(isAbsolutePath(`${BS}${BS}srv${BS}x`), true); assert.equal(isAbsolutePath('.nimbalyst/x'), false); assert.equal(isAbsolutePath('x:y'), false);
assert.equal(resolveProjectPath(`H:${BS}p${BS}`, `a${BS}b.png`), 'H:/p/a/b.png'); ok('isAbsolutePath / resolveProjectPath');

console.log(`\n${n} passed`);
