// Run: node --test test/site.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze, describeLayout, cleanText, fromPastedText } from '../js/layout.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('page basics', () => {
  const html = read('index.html');
  assert.match(html, /<title>GameSpeak/);
  assert.match(html, /name="viewport"/);
  assert.equal((html.match(/<h1[ >]/g) || []).length, 1);
  assert.equal((html.match(/aria-live=/g) || []).length, 1);
  assert.doesNotMatch(html, /<table|<dl|aria-describedby|autoplay/);
  for (const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    if (/^https?:/.test(m[1])) { assert.match(m[1], /github\.com/); continue; }
    assert.ok(fs.existsSync(path.join(root, m[1])), 'missing ' + m[1]);
  }
  assert.doesNotMatch(html + read('credits.html') + read('README.md'), /Hasan|Altameemi|Looscid|TODO|lorem/i);
});

test('sample reads top to bottom in bubbles', () => {
  const s = JSON.parse(read('samples/sample-rpg.json'));
  const r = analyze(s.items, s.width, s.height);
  assert.equal(r.bubbles.length, 4);
  assert.deepEqual(r.lines.map((l) => l.bubble), [1, 2, 3, 3, 3, 4, 4, 4]);
  assert.equal(r.lines[1].text, 'Gold 120');
  assert.equal(r.lines[7].text, 'alone at night.');
  const d = describeLayout(r);
  assert.match(d, /4 text areas/);
  assert.match(d, /top left/);
  assert.match(d, /middle right, 3 lines/);
});

test('cleanup and pasted text', () => {
  assert.equal(cleanText('▼ PRESS  START ►'), 'Press start');
  assert.equal(cleanText('hel-\nlo world'), 'hello world');
  assert.equal(cleanText('WHO GOES THERE? I AM A KNIGHT.'), 'Who goes there? I am a knight.');
  assert.equal(cleanText('HP 42', { fixCaps: true }), 'HP 42');
  const r = fromPastedText('Line one\nLine two\n\nSecond bubble');
  assert.equal(r.bubbles.length, 2);
  assert.equal(r.lines.length, 3);
  assert.match(describeLayout(r), /no layout/);
});

test('side by side bubbles read left to right', () => {
  const items = [
    { text: 'Right bubble', x: 500, y: 100, w: 150, h: 20 },
    { text: 'Left bubble', x: 50, y: 104, w: 150, h: 20 },
  ];
  const r = analyze(items, 800, 600);
  assert.deepEqual(r.lines.map((l) => l.text), ['Left bubble', 'Right bubble']);
});
