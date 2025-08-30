const express = require('express');
const router = express.Router();

function parseNumberDE(input) {
  if (input == null) return NaN;
  let s = String(input).trim();
  if (!s) return NaN;
  s = s.replace(/[\s\u00A0\u202F]/g, '');
  s = s.replace(/\./g, '').replace(',', '.');
  return Number(s);
}

function extractM3ValuesRobust(text) {
  const out = [];
  let i = 0;
  const len = text.length;
  while (i < len) {
    const idx1 = text.toLowerCase().indexOf('m3', i);
    const idx2 = text.indexOf('m³', i);
    let idx = -1;
    if (idx1 === -1) idx = idx2; else if (idx2 === -1) idx = idx1; else idx = idx1 < idx2 ? idx1 : idx2;
    if (idx === -1) break;
    let j = idx - 1;
    while (j >= 0) {
      const ch = text[j];
      if (ch === ' ' || ch === '\u00A0' || ch === '\u202F') j--; else break;
    }
    let k = j;
    while (k >= 0) {
      const ch2 = text[k];
      if ((ch2 >= '0' && ch2 <= '9') || ch2 === '.' || ch2 === ',' || ch2 === ' ' || ch2 === '\u00A0' || ch2 === '\u202F') k--; else break;
    }
    const numStr = text.slice(k + 1, j + 1).trim();
    if (numStr) {
      let norm = '';
      for (let p = 0; p < numStr.length; p++) {
        const c = numStr[p];
        if (c === ' ' || c === '\u00A0' || c === '\u202F') continue;
        if (c === '.') continue;
        if (c === ',') norm += '.'; else norm += c;
      }
      const num = Number(norm);
      if (Number.isFinite(num)) out.push(num);
    }
    i = idx + 2;
  }
  return out;
}

function groupByLabel(text) {
  const lines = text.split(/\r?\n/);
  const map = new Map();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const parts = line.split('\t');
    const label = (parts[0] || '').trim() || '—';
    let firstVal = 0;
    if (parts.length > 1) {
      const cleaned = String(parts[1]).replace(/[^0-9.,]/g, '');
      const n = parseNumberDE(cleaned);
      if (Number.isFinite(n)) firstVal = n;
    } else {
      const mFirst = /(\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?|\d+(?:,\d+)?)/.exec(line);
      if (mFirst) firstVal = Number(mFirst[1].replace(/\./g, '').replace(/,/g, '.')) || 0;
    }
    const lineVols = extractM3ValuesRobust(line);
    const lineSum = lineVols.reduce((a, b) => a + b, 0);
    const lineCount = lineVols.length;
    if (lineCount > 0) {
      const prev = map.get(label) || { sum: 0, count: 0, ore: 0 };
      prev.sum += lineSum;
      prev.count += lineCount;
      prev.ore += firstVal;
      map.set(label, prev);
    }
  }
  const out = [];
  map.forEach((v, label) => {
    out.push({ label: label, sum: v.sum, count: v.count, ore: v.ore });
  });
  out.sort((a, b) => b.sum - a.sum);
  return out;
}

router.post('/table', (req, res) => {
  const raw = req.body && req.body.raw ? String(req.body.raw) : '';
  const table = groupByLabel(raw);
  res.json(table);
});

module.exports = router;
