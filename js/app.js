import { analyze, describeLayout, fromPastedText } from './layout.js';

const $ = (id) => document.getElementById(id);
const els = {
  file: $('file'), choose: $('choose'), pasteImg: $('paste-img'), sample: $('sample'), drop: $('drop'),
  preview: $('preview'), dropHint: $('drop-hint'), ocrState: $('ocr-state'), gap: $('gap'),
  pasted: $('pasted'), useText: $('use-text'), summary: $('summary'), lines: $('lines'),
  prev: $('prev'), next: $('next'), repeat: $('repeat'), all: $('all'), stop: $('stop'), layout: $('layout'),
  vo: $('vo-mode'), caps: $('fix-caps'), voice: $('voice'), rate: $('rate'), rateOut: $('rate-out'),
  announcer: $('announcer'),
};

const hasDetector = typeof window.TextDetector === 'function';
const hasSpeech = 'speechSynthesis' in window;
let result = { bubbles: [], lines: [], width: 0, height: 0 };
let lastItems = null;      // detector or sample boxes, kept so the caps setting can re-run
let idx = -1;
let readingAll = false;

let annT;
function announce(msg) { clearTimeout(annT); els.announcer.textContent = ''; annT = setTimeout(() => { els.announcer.textContent = msg; }, 60); }

// ---------- speech ----------
function loadVoices() {
  if (!hasSpeech) return;
  const vs = speechSynthesis.getVoices();
  const keep = els.voice.value;
  els.voice.length = 1;
  vs.filter((v) => /^en/i.test(v.lang)).concat(vs.filter((v) => !/^en/i.test(v.lang)))
    .forEach((v) => els.voice.add(new Option(`${v.name} (${v.lang})`, v.name)));
  els.voice.value = keep;
}
function say(text, onEnd) {
  if (!hasSpeech) { announce(text); onEnd && onEnd(); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = speechSynthesis.getVoices().find((x) => x.name === els.voice.value);
  if (v) u.voice = v;
  u.rate = +els.rate.value;
  if (onEnd) u.onend = onEnd;
  speechSynthesis.speak(u);
}
function stop() { readingAll = false; if (hasSpeech) speechSynthesis.cancel(); }

// ---------- reader ----------
function lineLabel(l) {
  return (l.linesInBubble > 1 ? `Bubble ${l.bubble}, line ${l.lineInBubble} of ${l.linesInBubble}` : `Bubble ${l.bubble}`) + ':';
}
function render() {
  els.lines.textContent = '';
  result.lines.forEach((l, i) => {
    const li = document.createElement('li');
    li.tabIndex = -1; li.id = 'line-' + i;
    const tag = document.createElement('span'); tag.className = 'bub'; tag.textContent = lineLabel(l);
    const t = document.createElement('span'); t.textContent = l.text;
    li.append(tag, document.createTextNode(' '), t);
    els.lines.append(li);
  });
  const n = result.lines.length, b = result.bubbles.length;
  els.summary.textContent = n ? `${n} ${n === 1 ? 'line' : 'lines'} in ${b} ${b === 1 ? 'bubble' : 'bubbles'}. Press Read line to start.` : 'No text found.';
  idx = n ? 0 : -1;
  mark();
}
function mark() {
  [...els.lines.children].forEach((li, i) => li.classList.toggle('current', i === idx));
}
function speakLine(i, onEnd) {
  if (!result.lines.length) { announce('Nothing loaded yet. Pick a screenshot or paste text.'); return; }
  idx = Math.max(0, Math.min(result.lines.length - 1, i));
  mark();
  const l = result.lines[idx];
  if (els.vo.checked) {
    const li = els.lines.children[idx];
    li.focus();
    onEnd && setTimeout(onEnd, 50);
  } else {
    const prefix = l.lineInBubble === 1 && result.bubbles.length > 1 ? `Bubble ${l.bubble}. ` : '';
    say(prefix + l.text, onEnd);
  }
}
function step(d) {
  if (!result.lines.length) return speakLine(0);
  const n = idx + d;
  if (n < 0) { announce('First line.'); return speakLine(0); }
  if (n >= result.lines.length) { announce('Last line.'); return; }
  stop(); speakLine(n);
}
function readAll() {
  if (!result.lines.length) return speakLine(0);
  if (els.vo.checked) {
    announce(result.lines.map((l) => l.text).join(' '));
    return;
  }
  readingAll = true;
  const go = (i) => {
    if (!readingAll || i >= result.lines.length) { readingAll = false; return; }
    speakLine(i, () => go(i + 1));
  };
  go(idx < 0 ? 0 : idx);
}
function layout() {
  const text = describeLayout(result);
  if (els.vo.checked) announce(text); else say(text);
}

// ---------- input ----------
function setResult(r, how) {
  result = r;
  render();
  announce(`${how} ${r.lines.length} ${r.lines.length === 1 ? 'line' : 'lines'} found.` + (r.lines.length ? ' Press Read line or N to start.' : ''));
}
async function detect(img) {
  const det = new window.TextDetector();
  const found = await det.detect(img);
  return found.map((f) => ({ text: f.rawValue || '', x: f.boundingBox.x, y: f.boundingBox.y, w: f.boundingBox.width, h: f.boundingBox.height }));
}
async function loadImage(blob, alt) {
  const url = URL.createObjectURL(blob);
  els.preview.src = url; els.preview.alt = alt || 'Your screenshot'; els.preview.hidden = false;
  els.dropHint.hidden = true;
  await els.preview.decode().catch(() => {});
  if (!hasDetector) {
    els.gap.hidden = false;
    els.ocrState.textContent = "Screenshot loaded, but this browser can't read text from pictures. See the options below.";
    announce("Screenshot loaded. This browser can't read text from pictures. Options are below.");
    return;
  }
  els.ocrState.textContent = 'Reading the text…';
  try {
    lastItems = { items: await detect(els.preview), w: els.preview.naturalWidth, h: els.preview.naturalHeight };
    els.ocrState.textContent = 'Done reading the screenshot.';
    setResult(analyze(lastItems.items, lastItems.w, lastItems.h, { fixCaps: els.caps.checked }), 'Screenshot read.');
  } catch (e) {
    console.warn(e);
    els.gap.hidden = false;
    els.ocrState.textContent = 'The text detector failed on this picture. You can paste the text instead.';
    announce('The text detector failed on this picture.');
  }
}
async function loadSample() {
  const [meta] = await Promise.all([fetch('samples/sample-rpg.json').then((r) => r.json())]);
  els.preview.src = 'samples/sample-rpg.svg';
  els.preview.alt = 'Sample game scene: a hero, a speech bubble on the right, a dialogue box along the bottom, and health and gold counters at the top.';
  els.preview.hidden = false; els.dropHint.hidden = true;
  els.gap.hidden = true;
  els.ocrState.textContent = 'Sample loaded. Its text positions are built in, so this works in every browser.';
  lastItems = { items: meta.items, w: meta.width, h: meta.height };
  setResult(analyze(meta.items, meta.width, meta.height, { fixCaps: els.caps.checked }), 'Sample loaded.');
}
function fileFromClipboardEvent(e) {
  const items = e.clipboardData ? [...e.clipboardData.items] : [];
  const it = items.find((i) => i.type.startsWith('image/'));
  return it ? it.getAsFile() : null;
}

function wire() {
  els.choose.addEventListener('click', () => els.file.click());
  els.file.addEventListener('change', () => { const f = els.file.files[0]; if (f) loadImage(f, 'Your screenshot: ' + f.name); });
  els.sample.addEventListener('click', loadSample);
  els.pasteImg.addEventListener('click', async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const it of items) {
        const type = it.types.find((t) => t.startsWith('image/'));
        if (type) { loadImage(await it.getType(type), 'Pasted screenshot'); return; }
      }
      announce('No picture on the clipboard. Copy a screenshot first.');
    } catch (e) {
      announce('The browser would not share the clipboard. Try Control or Command plus V instead.');
    }
  });
  document.addEventListener('paste', (e) => {
    const f = fileFromClipboardEvent(e);
    if (f) { e.preventDefault(); loadImage(f, 'Pasted screenshot'); }
  });
  els.drop.addEventListener('dragover', (e) => { e.preventDefault(); els.drop.classList.add('over'); });
  els.drop.addEventListener('dragleave', () => els.drop.classList.remove('over'));
  els.drop.addEventListener('drop', (e) => {
    e.preventDefault(); els.drop.classList.remove('over');
    const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/'));
    if (f) loadImage(f, 'Dropped screenshot: ' + f.name);
  });
  els.useText.addEventListener('click', () => {
    lastItems = null;
    setResult(fromPastedText(els.pasted.value, { fixCaps: els.caps.checked }), 'Text ready.');
  });
  els.caps.addEventListener('change', () => {
    if (lastItems) result = analyze(lastItems.items, lastItems.w, lastItems.h, { fixCaps: els.caps.checked });
    else if (els.pasted.value.trim()) result = fromPastedText(els.pasted.value, { fixCaps: els.caps.checked });
    else return;
    render();
  });
  els.prev.addEventListener('click', () => step(-1));
  els.next.addEventListener('click', () => step(1));
  els.repeat.addEventListener('click', () => { stop(); speakLine(idx < 0 ? 0 : idx); });
  els.all.addEventListener('click', () => { stop(); readAll(); });
  els.stop.addEventListener('click', () => { stop(); announce('Stopped.'); });
  els.layout.addEventListener('click', () => { stop(); layout(); });
  els.rate.addEventListener('input', () => {
    els.rateOut.textContent = `${(+els.rate.value).toFixed(1)}×`;
    els.rate.setAttribute('aria-valuetext', `${(+els.rate.value).toFixed(1)} times normal speed`);
  });
  els.rate.setAttribute('aria-valuetext', '1.0 times normal speed');
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (e.key === 'Escape') { stop(); return; }
    if (['input', 'textarea', 'select'].includes(tag)) return;
    const k = e.key.toLowerCase();
    if (k === 'n') { e.preventDefault(); step(1); }
    else if (k === 'p') { e.preventDefault(); step(-1); }
    else if (k === 'r') { e.preventDefault(); stop(); speakLine(idx < 0 ? 0 : idx); }
    else if (k === 'a') { e.preventDefault(); stop(); readAll(); }
    else if (k === 'l') { e.preventDefault(); stop(); layout(); }
  });
  if (hasSpeech) { loadVoices(); speechSynthesis.addEventListener?.('voiceschanged', loadVoices); }
  else { els.vo.checked = true; }
  els.ocrState.textContent = hasDetector
    ? 'This browser can read text from screenshots.'
    : "Heads up: this browser can't read text from pictures yet. The sample and pasted text still work.";
  window.__gamespeak = { get result() { return result; }, get idx() { return idx; }, hasDetector };
}
wire();
