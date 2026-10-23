// GameSpeak layout engine: turns detected text boxes into lines and bubbles,
// in reading order, and describes where they sit on screen.
// Original code for GameSpeak (MIT). Idea credit: MrFlapstaart/GameOCRTTS (AGPL-3.0);
// no code from it is used here.

const GARBAGE = /[▼▲►◄▶◀■□●○◆◇★☆♥♦♣♠|_~`^<>«»¤§¶•·…]+/g;

export function cleanText(s, { fixCaps = true } = {}) {
  let t = String(s || '')
    .replace(/(\w)-\s*\n\s*(\w)/g, '$1$2')
    .replace(GARBAGE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Drop lone stray symbols left by OCR, keep real punctuation.
  t = t.split(' ').filter((w) => /[\p{L}\p{N}]/u.test(w) || /^[!?.,]+$/.test(w)).join(' ');
  if (fixCaps && /[A-Z]/.test(t) && t === t.toUpperCase() && t.replace(/[^A-Z]/g, '').length > 3) {
    t = t.toLowerCase().replace(/(^|[.!?]\s+)(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\bi\b/g, 'I');
  }
  return t;
}

const overlapY = (a, b) => Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const overlapX = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));

function union(boxes) {
  const x = Math.min(...boxes.map((b) => b.x)), y = Math.min(...boxes.map((b) => b.y));
  const r = Math.max(...boxes.map((b) => b.x + b.w)), btm = Math.max(...boxes.map((b) => b.y + b.h));
  return { x, y, w: r - x, h: btm - y };
}

// items: [{ text, x, y, w, h }] in image pixels.
export function buildLines(items, opts) {
  const sorted = items.filter((i) => i.text && i.text.trim()).slice().sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2));
  const lines = [];
  for (const it of sorted) {
    const line = lines.find((l) => overlapY(l.box, it) > 0.5 * Math.min(l.box.h, it.h) &&
      (it.x - (l.box.x + l.box.w) < 3 * it.h) && (l.box.x - (it.x + it.w) < 3 * it.h));
    if (line) { line.parts.push(it); line.box = union(line.parts); }
    else lines.push({ parts: [it], box: { x: it.x, y: it.y, w: it.w, h: it.h } });
  }
  return lines.map((l) => ({
    text: cleanText(l.parts.sort((a, b) => a.x - b.x).map((p) => p.text).join(' '), opts),
    box: l.box,
  })).filter((l) => l.text);
}

export function buildBubbles(lines) {
  const n = lines.length, parent = [...Array(n).keys()];
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = lines[i].box, b = lines[j].box;
    const gap = Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h);
    const lh = Math.max(a.h, b.h);
    if (gap < 0.9 * lh && overlapX(a, b) > 0.3 * Math.min(a.w, b.w)) parent[find(i)] = find(j);
  }
  const groups = new Map();
  lines.forEach((l, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(l); });
  const bubbles = [...groups.values()].map((ls) => {
    ls.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
    return { lines: ls, box: union(ls.map((l) => l.box)) };
  });
  // Reading order: top to bottom; bubbles side by side (overlapping rows) go left to right.
  bubbles.sort((a, b) => {
    const sameRow = overlapY(a.box, b.box) > 0.5 * Math.min(a.box.h, b.box.h);
    return sameRow ? a.box.x - b.box.x : a.box.y - b.box.y;
  });
  return bubbles;
}

export function where(box, W, H) {
  const cx = (box.x + box.w / 2) / W, cy = (box.y + box.h / 2) / H;
  const v = cy < 1 / 3 ? 'top' : cy < 2 / 3 ? 'middle' : 'bottom';
  const h = cx < 1 / 3 ? 'left' : cx < 2 / 3 ? 'center' : 'right';
  return v === 'middle' && h === 'center' ? 'center of the screen' : `${v} ${h}`;
}

export function kindOf(b, W, H) {
  const wide = b.box.w / W, cy = (b.box.y + b.box.h / 2) / H;
  if (wide > 0.6 && cy > 0.6) return 'dialogue box';
  if (b.lines.length === 1 && wide < 0.25 && (cy < 0.15 || cy > 0.9)) return 'small label, maybe a score or menu';
  if (b.lines.length >= 2) return 'speech bubble or text block';
  return 'single line';
}

export function analyze(items, W, H, opts) {
  const lines = buildLines(items, opts);
  const bubbles = buildBubbles(lines);
  bubbles.forEach((b, i) => { b.n = i + 1; b.where = where(b.box, W, H); b.kind = kindOf(b, W, H); });
  const flat = [];
  bubbles.forEach((b) => b.lines.forEach((l, j) => flat.push({ text: l.text, bubble: b.n, lineInBubble: j + 1, linesInBubble: b.lines.length })));
  return { bubbles, lines: flat, width: W, height: H };
}

export function describeLayout(result) {
  const { bubbles } = result;
  if (!bubbles.length) return 'No text found on this screen.';
  if (!result.width) {
    return `${bubbles.length} text ${bubbles.length === 1 ? 'block' : 'blocks'} from pasted text, ${result.lines.length} lines. Pasted text has no positions, so there is no layout to describe.`;
  }
  const parts = [`${bubbles.length} text ${bubbles.length === 1 ? 'area' : 'areas'}, ${result.lines.length} lines, top to bottom.`];
  for (const b of bubbles) parts.push(`Area ${b.n}: ${b.where}, ${b.lines.length} ${b.lines.length === 1 ? 'line' : 'lines'}, ${b.kind}. Starts with: ${b.lines[0].text.split(' ').slice(0, 6).join(' ')}.`);
  return parts.join(' ');
}

// Pasted text: blank lines split bubbles, each line is a line.
export function fromPastedText(text, opts) {
  const blocks = String(text || '').split(/\n\s*\n/).map((b) => b.split('\n').map((l) => cleanText(l, opts)).filter(Boolean)).filter((b) => b.length);
  const bubbles = blocks.map((ls, i) => ({ n: i + 1, lines: ls.map((t) => ({ text: t })), where: '', kind: '' }));
  const flat = [];
  bubbles.forEach((b) => b.lines.forEach((l, j) => flat.push({ text: l.text, bubble: b.n, lineInBubble: j + 1, linesInBubble: b.lines.length })));
  return { bubbles, lines: flat, width: 0, height: 0 };
}
