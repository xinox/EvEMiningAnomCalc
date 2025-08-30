// ——— Zahlen-Parsing ———
function parseNumberSmart(input) {
  if (typeof input !== 'string') return Number(input);
  var s = input.trim();
  if (!s) return NaN;
  var hasDot = s.indexOf('.') !== -1;
  var hasComma = s.indexOf(',') !== -1;
  if (hasDot && hasComma) {
    var lastDot = s.lastIndexOf('.');
    var lastComma = s.lastIndexOf(',');
    var dec = lastDot > lastComma ? '.' : ',';
    var thou = dec === '.' ? ',' : '.';
    s = s.split(thou).join('');
    if (dec === ',') s = s.replace(',', '.');
  } else if (hasComma && !hasDot) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  return Number(s);
}
function parseNumberDE(input) {
  if (input == null) return NaN;
  var s = String(input).trim();
  if (!s) return NaN;
  // Entferne alle Leerzeichen inkl. NBSP ( ) und schmale Leerzeichen ( )
  s = s.replace(new RegExp("[\\s\u00A0\u202F]","g"), '');
  // Punkte = Tausender, Komma = Dezimal
  s = s.replace(new RegExp("\\.","g"), '').replace(',', '.');
  return Number(s);
}
var fmtDE = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 });
// ——— Einheiten (ISK/Mio/Mrd) ———
var unitChoice = 'auto'; // 'auto' | 'isk' | 'mio' | 'mrd'
var activeUnit = 'isk';
function unitFactorOf(u){ return u === 'mrd' ? 1e9 : (u === 'mio' ? 1e6 : 1); }
function unitLabelOf(u){ return u === 'mrd' ? 'Mrd ISK' : (u === 'mio' ? 'Mio ISK' : 'ISK'); }
function fmtISK(v){
  var baseAbs = Math.abs(v);
  var factor = unitFactorOf(activeUnit);
  var scaled = v / factor;
  var decimals = baseAbs >= 1e6 ? 0 : 2;
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: decimals }).format(scaled);
}
// ——— Regex & Extraktion ———
var VALUE_BEFORE_M3 = /(\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?|\d+(?:,\d+)?)(?=\s*m3\b)/gim;
function extractM3Values(text) {
  var values = []; var m; VALUE_BEFORE_M3.lastIndex = 0;
  while ((m = VALUE_BEFORE_M3.exec(text)) !== null) {
    var num = Number(m[1].replace(/\./g, '').replace(/,/g, '.'));
    if (Number.isFinite(num)) values.push(num);
  }
  return values;
}
// ——— Gruppierung 1: nach Label ———
function groupByLabel(text) {
  var lines = text.split(/\r?\n/); var map = new Map();
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i]; if (!line.trim()) continue;
    var parts = line.split('\t');
    var label = (parts[0] || '').trim() || '—';
    // erster Zahlenwert als Erzanzahl (Punkt = Tausender, Komma = Dezimal)
    var firstVal = 0;
    if (parts.length > 1) {
      var cleaned = String(parts[1]).replace(/[^0-9.,]/g, '');
      var n = parseNumberDE(cleaned); if (Number.isFinite(n)) firstVal = n;
    } else {
      var mFirst = /(\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?|\d+(?:,\d+)?)/.exec(line);
      if (mFirst) firstVal = Number(mFirst[1].replace(/\./g, '').replace(/,/g, '.')) || 0;
    }
    var lineVols = extractM3ValuesRobust(line); var lineSum = lineVols.reduce(function(a,b){return a+b;},0); var lineCount = lineVols.length; if (lineCount > 0) {
      var prev = map.get(label) || { sum: 0, count: 0, ore: 0 };
      prev.sum += lineSum; prev.count += lineCount; prev.ore += firstVal; map.set(label, prev);
    }
  }
  var out = []; map.forEach(function(v, label){ out.push({ label: label, sum: v.sum, count: v.count, ore: v.ore }); });
  out.sort(function(a, b){ return b.sum - a.sum; }); return out;
}
// ——— Gruppierung 2: nach identischem m³-Wert ———
function groupByValue(values) {
  var map = new Map();
  for (var i = 0; i < values.length; i++) {
    var v = values[i];
    var prev = map.get(v) || { count: 0, total: 0 };
    prev.count += 1; prev.total += v; map.set(v, prev);
  }
  var out = []; map.forEach(function(v, value){ out.push({ value: value, count: v.count, total: v.total }); });
  out.sort(function(a, b){ return (b.total - a.total) || (b.count - a.count) || (b.value - a.value); });
  return out;
}
// ——— Sortierung ———
var groupSort = { key: 'sum', dir: 'desc' };
var lastRowsLabel = [];
function sortRowsLabel(rows) {
  var key = groupSort.key, dir = groupSort.dir, mul = dir === 'asc' ? 1 : -1;
  return rows.slice().sort(function(a, b){
    if (key === 'label') return mul * a.label.localeCompare(b.label, 'de', { numeric: true, sensitivity: 'base' });
    if (a[key] === b[key]) return mul * a.label.localeCompare(b.label, 'de', { numeric: true, sensitivity: 'base' });
    return (a[key] < b[key] ? -1 : 1) * mul;
  });
}
function attachSortHandlers() {
  var ths = document.querySelectorAll('#groupByLabelTable thead th.sortable');
  ths.forEach(function(th){
    th.addEventListener('click', function(){
      var key = th.dataset.key; if (!key) return;
      if (groupSort.key === key) groupSort.dir = groupSort.dir === 'asc' ? 'desc' : 'asc';
      else { groupSort.key = key; groupSort.dir = key === 'label' ? 'asc' : 'desc'; }
      rerenderGroupTable();
    });
  });
}
function updateSortIndicators() {
  var ths = document.querySelectorAll('#groupByLabelTable thead th.sortable');
  ths.forEach(function(th){
    th.classList.remove('sorted'); var ind = th.querySelector('.sort-ind'); if (ind) ind.textContent = '';
    if (th.dataset.key === groupSort.key) { th.classList.add('sorted'); if (ind) ind.textContent = groupSort.dir === 'asc' ? '▲' : '▼'; }
  });
}
// ——— Preise ———
var priceByLabel = new Map();
var typeIdCache = new Map();
var JITA_STATION = 60003760; var JITA_SYSTEM = 30000142; var FORGE_REGION = 10000002;
 async function resolveTypeId(label) {
  if (typeIdCache.has(label)) return typeIdCache.get(label);
  var esiUrl = 'https://esi.evetech.net/latest/search/?categories=inventory_type&language=en&search=' + encodeURIComponent(label) + '&strict=true';
  try { var res = await fetch(esiUrl, { mode: 'cors' }); if (res.ok) { var j = await res.json(); var id = Array.isArray(j && j.inventory_type) ? Number(j.inventory_type[0]) : NaN; if (Number.isFinite(id)) { typeIdCache.set(label, id); return id; } } } catch (e) {}
  var fwUrl = 'https://www.fuzzwork.co.uk/api/typeid.php?typename=' + encodeURIComponent(label);
  try { var res2 = await fetch(fwUrl, { mode: 'cors' }); if (res2.ok) { var j2 = await res2.json(); if (j2 && typeof j2.typeID === 'number') { typeIdCache.set(label, j2.typeID); return j2.typeID; } } } catch (e2) {}
  typeIdCache.set(label, null); return null;
}
async function getBestJitaPriceESI(typeId, side) {
  var page = 1, best = side === 'sell' ? Infinity : -Infinity, pages = 1;
  while (page <= pages) {
    var url = 'https://esi.evetech.net/latest/markets/' + FORGE_REGION + '/orders/?order_type=' + side + '&type_id=' + typeId + '&page=' + page;
    var res; try { res = await fetch(url, { mode: 'cors' }); } catch (e) { break; }
    if (!res.ok) break; var xPages = Number(res.headers.get('x-pages')); if (Number.isFinite(xPages) && xPages > pages) pages = xPages;
    var data = []; try { data = await res.json(); } catch (e2) { data = []; }
    for (var i = 0; i < data.length; i++) { var o = data[i]; if (o && o.location_id === JITA_STATION && Number.isFinite(o.price)) { if (side === 'sell') best = Math.min(best, o.price); else best = Math.max(best, o.price); } }
    page += 1; if (page > 20) break;
  }
  if (!Number.isFinite(best)) return null; return best;
}
async function fetchPricesESI(typeIds) {
  var out = {}; var limit = 3; var i = 0;
  var workers = new Array(limit).fill(0).map(async function(){
    while (i < typeIds.length) {
      var id = typeIds[i++];
      var pair = await Promise.all([ getBestJitaPriceESI(id, 'sell'), getBestJitaPriceESI(id, 'buy') ]);
      var sell = pair[0], buy = pair[1];
      if (sell != null || buy != null) out[id] = { sellMin: sell != null ? Number(sell) : undefined, buyMax: buy != null ? Number(buy) : undefined, source: 'esi' };
    }
  });
  await Promise.all(workers); return out;
}
async function fetchPricesFuzzwork(typeIds) {
  if (!typeIds.length) return {}; var url = 'https://market.fuzzwork.co.uk/aggregates/?station=' + JITA_STATION + '&types=' + typeIds.join(','); var out = {};
  try { var res = await fetch(url, { mode: 'cors' }); if (!res.ok) throw new Error('Fuzzwork HTTP ' + res.status); var j = await res.json();
    for (var i = 0; i < typeIds.length; i++) { var id = typeIds[i]; var r = j[id]; if (!r) continue; var buyMax = r && r.buy ? r.buy.max : undefined; var sellMin = r && r.sell ? r.sell.min : undefined; if (Number.isFinite(buyMax) || Number.isFinite(sellMin)) out[id] = { buyMax: Number(buyMax), sellMin: Number(sellMin), source: 'fuzzwork' }; }
  } catch (e) {}
  return out;
}
async function fetchPricesEveMarketer(typeIds) {
  if (!typeIds.length) return {}; var params = typeIds.map(function(id){ return 'typeid=' + encodeURIComponent(id); }).join('&'); var url = 'https://api.evemarketer.com/ec/marketstat/json?usesystem=' + JITA_SYSTEM + '&' + params; var out = {};
  try { var res = await fetch(url, { mode: 'cors' }); if (!res.ok) throw new Error('EVEMarketer HTTP ' + res.status); var j = await res.json(); var arr = Array.isArray(j) ? j : (j && j.marketstat && j.marketstat.type ? [].concat(j.marketstat.type) : []);
    for (var i = 0; i < arr.length; i++) { var entry = arr[i]; var id = Number(entry && (entry.id || (entry.type && entry.type.id) || entry.typeID)); var buyMax = Number(entry && entry.buy && entry.buy.max); var sellMin = Number(entry && entry.sell && entry.sell.min); if (Number.isFinite(id) && (Number.isFinite(buyMax) || Number.isFinite(sellMin))) out[id] = { buyMax: buyMax, sellMin: sellMin, source: 'evemarketer' }; }
  } catch (e) {}
  return out;
}
async function refreshPricesForLabels(labels) {
  var unique = Array.from(new Set(labels.filter(Boolean)));
  var pairs = await Promise.all(unique.map(async function(label){ return [label, await resolveTypeId(label)]; }));
  var idByLabel = new Map(pairs); var ids = pairs.map(function(p){ return p[1]; }).filter(function(v){ return Number.isFinite(v); });
  var byId = await fetchPricesESI(ids);
  var remaining = ids.filter(function(id){ return !byId[id]; });
  if (remaining.length) { var fz = await fetchPricesFuzzwork(remaining); Object.assign(byId, fz); remaining = remaining.filter(function(id){ return !byId[id]; }); }
  if (remaining.length) { var em = await fetchPricesEveMarketer(remaining); Object.assign(byId, em); }
  idByLabel.forEach(function(id, label){ var p = id ? byId[id] : null; priceByLabel.set(label, p || null); });
  rerenderGroupTable();
}
// ——— Anzeige ———
function updateCurrencyHeaders(){
  var label = unitLabelOf(activeUnit);
  var b = document.getElementById('colBuy');  if (b) { var sb=b.querySelector('span'); if (sb) sb.textContent = 'Buy (Jita 4-4, ' + label + ')'; }
  var s = document.getElementById('colSell'); if (s) { var ss=s.querySelector('span'); if (ss) ss.textContent = 'Sell (Jita 4-4, ' + label + ')'; }
  var p = document.getElementById('colSplit'); if (p) { var sp=p.querySelector('span'); if (sp) sp.textContent = 'Split (Mittelwert, ' + label + ')'; }
}
function updateKPIUnitLabels(){
  var label = unitLabelOf(activeUnit);
  ['kpiUnitSplit','kpiUnitSplitPH','kpiUnitRefined','kpiUnitRefinedPH'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.textContent = label;
  });
}
function renderTableRows(tbodyEl, rows) {
  tbodyEl.innerHTML = '';
  if (!rows.length) { tbodyEl.innerHTML = '<tr><td colspan="7" style="opacity:.7;padding:10px;">Keine Daten</td></tr>'; return; }
  var frag = document.createDocumentFragment();
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i]; var tr = document.createElement('tr');
    var price = priceByLabel.get(r.label);
    var buyTxt = (price && Number.isFinite(price.buyMax)) ? fmtISK(price.buyMax) : '–';
    var sellTxt = (price && Number.isFinite(price.sellMin)) ? fmtISK(price.sellMin) : '–';
    var mid = (price && Number.isFinite(price.buyMax) && Number.isFinite(price.sellMin)) ? ((price.buyMax + price.sellMin) / 2) : null;
    var splitTxt = (mid !== null) ? fmtISK(mid) : '–';
    var oreVal = Number(r.ore || 0);
    tr.innerHTML = '<td>' + r.label + '</td>' +
                   '<td class="num">' + fmtDE.format(r.count) + '</td>' +
                   '<td class="num">' + fmtDE.format(oreVal) + '</td>' +
                   '<td class="num">' + fmtDE.format(r.sum) + '</td>' +
                   '<td class="num">' + buyTxt + '</td>' +
                   '<td class="num">' + sellTxt + '</td>' +
                   '<td class="num">' + splitTxt + '</td>';
    frag.appendChild(tr);
  }
  tbodyEl.appendChild(frag);
}
// ——— KPIs & Gesamtsummen ———
var gTotalVolume = 0; // m³
var gEffRate = 0;     // m³/s
function determineActiveUnit(){
  if (unitChoice !== 'auto') return unitChoice;
  var maxAbs = 0;
  (lastRowsLabel || []).forEach(function(r){
    var price = priceByLabel.get(r.label); if (!price) return;
    if (Number.isFinite(price.buyMax)) maxAbs = Math.max(maxAbs, Math.abs(price.buyMax));
    if (Number.isFinite(price.sellMin)) maxAbs = Math.max(maxAbs, Math.abs(price.sellMin));
    if (Number.isFinite(price.buyMax) && Number.isFinite(price.sellMin)) maxAbs = Math.max(maxAbs, Math.abs((price.buyMax + price.sellMin) / 2));
    var oreVal = Number(r.ore || 0);
    if (Number.isFinite(oreVal)) {
      if (Number.isFinite(price.buyMax)) maxAbs = Math.max(maxAbs, Math.abs(oreVal * price.buyMax));
      if (Number.isFinite(price.sellMin)) maxAbs = Math.max(maxAbs, Math.abs(oreVal * price.sellMin));
      if (Number.isFinite(price.buyMax) && Number.isFinite(price.sellMin)) maxAbs = Math.max(maxAbs, Math.abs(oreVal * ((price.buyMax + price.sellMin) / 2)));
    }
  });
  if (maxAbs >= 1e9) return 'mrd'; if (maxAbs >= 1e6) return 'mio'; return 'isk';
}
function rerenderGroupTable() {
  activeUnit = determineActiveUnit(); updateCurrencyHeaders(); updateKPIUnitLabels();
  var tbody = document.querySelector('#groupByLabelTable tbody'); if (!tbody) return;
  var sorted = sortRowsLabel(lastRowsLabel || []); renderTableRows(tbody, sorted);
  updateSortIndicators();
  // Totals
  var totalBuy = 0, totalSell = 0, totalSplit = 0;
  (lastRowsLabel || []).forEach(function(r){
    var price = priceByLabel.get(r.label); var oreVal = Number(r.ore || 0);
    if (price && Number.isFinite(price.buyMax))  totalBuy  += oreVal * price.buyMax;
    if (price && Number.isFinite(price.sellMin)) totalSell += oreVal * price.sellMin;
    if (price && Number.isFinite(price.buyMax) && Number.isFinite(price.sellMin)) totalSplit += oreVal * ((price.buyMax + price.sellMin) / 2);
  });
  var elB  = document.getElementById('groupTotalBuyValue'); if (elB)  elB.textContent  = totalBuy  > 0 ? fmtISK(totalBuy)   : '–';
  var elS  = document.getElementById('groupTotalSellValue'); if (elS)  elS.textContent  = totalSell > 0 ? fmtISK(totalSell)  : '–';
  var elSp = document.getElementById('groupTotalSplitValue'); if (elSp) elSp.textContent = totalSplit> 0 ? fmtISK(totalSplit) : '–';
  // KPIs
  var kB = document.getElementById('kpiBuyTotal'); if (kB) kB.textContent = totalBuy  > 0 ? fmtISK(totalBuy)  : '–';
  var kS = document.getElementById('kpiSellTotal'); if (kS) kS.textContent = totalSell > 0 ? fmtISK(totalSell) : '–';
  var kP = document.getElementById('kpiSplitTotal'); if (kP) kP.textContent = totalSplit > 0 ? fmtISK(totalSplit) : '–';
  var kR = document.getElementById('kpiRefinedTotal'); if (kR) kR.textContent = totalSell > 0 ? fmtISK(totalSell) : '–';
  // ISK/h (Ø ISK/m³ × m³/s × 3600)
  var midPH  = (gEffRate > 0 && gTotalVolume > 0 && totalSplit> 0) ? (totalSplit/ gTotalVolume) * gEffRate * 3600 : NaN;
  var kPH = document.getElementById('kpiSplitPerHour');
  if (kPH) kPH.textContent = Number.isFinite(midPH) ? fmtISK(midPH) : '–';
  var refinedPH = (gEffRate > 0 && gTotalVolume > 0 && totalSell > 0) ? (totalSell / gTotalVolume) * gEffRate * 3600 : NaN;
  var kRPH = document.getElementById('kpiRefinedPerHour');
  if (kRPH) kRPH.textContent = Number.isFinite(refinedPH) ? fmtISK(refinedPH) : '–';
}
// ——— Zeit ———
function formatVerbose(totalSeconds) {
  totalSeconds = Math.max(0, Math.floor(totalSeconds));
  var d = Math.floor(totalSeconds / 86400);
  var h = Math.floor((totalSeconds % 86400) / 3600);
  var m = Math.floor((totalSeconds % 3600) / 60);
  var s = totalSeconds % 60; var chunks = [];
  if (d) chunks.push(d + ' Tage'); if (h) chunks.push(h + ' Std'); if (m) chunks.push(m + ' Min'); chunks.push(s + ' Sek');
  return chunks.join(' ');
}
function formatETA(totalSeconds) {
  if (!Number.isFinite(totalSeconds)) return null;
  var now = new Date(); var eta = new Date(now.getTime() + Math.max(0, totalSeconds) * 1000);
  var timeFmt = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
  var nowStr = timeFmt.format(now); var etaTime = timeFmt.format(eta);
  var sameDay = eta.getFullYear() === now.getFullYear() && eta.getMonth() === now.getMonth() && eta.getDate() === now.getDate();
  if (sameDay) return 'Jetzt: ' + nowStr + ' → Fertig um ' + etaTime;
  var dateStr = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(eta);
  return 'Jetzt: ' + nowStr + ' → Fertig am ' + dateStr + ' um ' + etaTime;
}
// ——— Hauptberechnung ———
function calculate() {
  var raw = document.getElementById('raw').value;
  var rateInput = document.getElementById('rate').value;
  var modulesInput = document.getElementById('modules').value;
  var charsInput = document.getElementById('chars').value;
   var volumes = extractM3ValuesRobust(raw);
  var sumVolume = volumes.reduce(function(a, b){ return a + b; }, 0);
  gTotalVolume = sumVolume;
   var m3ps = parseNumberSmart(rateInput);
  var modules = parseNumberSmart(modulesInput);
  var chars = parseNumberSmart(charsInput);
  var effRate = (Number.isFinite(m3ps) ? m3ps : 0) * (Number.isFinite(modules) ? modules : 0) * (Number.isFinite(chars) ? chars : 0);
  gEffRate = effRate;
   var seconds = (effRate > 0 && sumVolume > 0) ? (sumVolume / effRate) : NaN;
   var elSum = document.getElementById('sumVol'); if (elSum) elSum.textContent = sumVolume > 0 ? fmtDE.format(sumVolume) : '–';
  var elEff = document.getElementById('effRate'); if (elEff) elEff.textContent = effRate > 0 ? fmtDE.format(effRate) : '–';
  var elDur = document.getElementById('duration'); if (elDur) elDur.textContent = Number.isFinite(seconds) ? formatVerbose(seconds) : '–';
  var etaText = formatETA(seconds); var etaCell = document.getElementById('etaCell'); if (etaCell) etaCell.textContent = etaText || '–';
   var rowsLabel = groupByLabel(raw); lastRowsLabel = rowsLabel;
  var totalCount = rowsLabel.reduce(function(a, r){ return a + r.count; }, 0);
  var totalOre   = rowsLabel.reduce(function(a, r){ return a + (r.ore || 0); }, 0);
  var totalSum   = rowsLabel.reduce(function(a, r){ return a + r.sum; }, 0);
  var totalCountEl = document.getElementById('groupTotalCount'); if (totalCountEl) totalCountEl.textContent = totalCount ? fmtDE.format(totalCount) : '–';
  var totalOreEl   = document.getElementById('groupTotalOre');   if (totalOreEl)   totalOreEl.textContent   = totalOre ? fmtDE.format(totalOre)     : '–';
  var totalSumEl   = document.getElementById('groupTotalSum');   if (totalSumEl)   totalSumEl.textContent   = totalSum ? fmtDE.format(totalSum)     : '–';
   rerenderGroupTable();
  refreshPricesForLabels(rowsLabel.map(function(r){ return r.label; })).catch(function(){});
}
 function resetAll() {
  document.getElementById('rate').value = '';
  document.getElementById('modules').value = '';
  document.getElementById('chars').value = '';
  calculate();
  saveAppState();
}
// ——— State (localStorage) ———
var STATE_KEY = 'm3calc/v1/state';
function getAppState(){
  return {
    raw: document.getElementById('raw').value,
    rate: document.getElementById('rate').value,
    modules: document.getElementById('modules').value,
    chars: document.getElementById('chars').value,
    unit: (document.getElementById('unitSelect') ? document.getElementById('unitSelect').value : unitChoice)
  };
}
function applyAppState(s){
  if (!s) return;
  if (typeof s.raw === 'string')     document.getElementById('raw').value = s.raw;
  if (typeof s.rate === 'string')    document.getElementById('rate').value = s.rate;
  if (typeof s.modules === 'string') document.getElementById('modules').value = s.modules;
  if (typeof s.chars === 'string')   document.getElementById('chars').value = s.chars;
  if (typeof s.unit === 'string') {
    unitChoice = s.unit;
    var us = document.getElementById('unitSelect'); if (us) us.value = s.unit;
  }
}
function loadAppState(){ try { var raw = localStorage.getItem(STATE_KEY); return raw ? JSON.parse(raw) : null; } catch(e){ return null; } }
function saveAppState(){ try { localStorage.setItem(STATE_KEY, JSON.stringify(getAppState())); } catch(e){} }


function parseQueryState(){
  try {
    var params = new URLSearchParams(location.search);
    var obj = {};
    ['raw','rate','modules','chars','unit'].forEach(function(k){ if (params.has(k)) obj[k] = params.get(k); });
    return Object.keys(obj).length ? obj : null;
  } catch(e){ return null; }
}
function buildShareURL(){
  var s = getAppState();
  var params = new URLSearchParams();
  if (s.raw) params.set('raw', s.raw);
  if (s.rate) params.set('rate', s.rate);
  if (s.modules) params.set('modules', s.modules);
  if (s.chars) params.set('chars', s.chars);
  if (s.unit && s.unit !== 'auto') params.set('unit', s.unit);
  var qs = params.toString();
  return location.origin + location.pathname + (qs ? ('?' + qs) : '');
}

// ——— Theme Toggle ———
function updateThemeToggleUI(theme) { var btn = document.getElementById('themeToggle'); if (!btn) return; btn.textContent = theme === 'dark' ? '☀️ Hell' : '🌙 Dunkel'; btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false'); }
function applyTheme(theme) { document.documentElement.setAttribute('data-theme', theme); updateThemeToggleUI(theme); try { localStorage.setItem('m3calc/v1/theme', theme); } catch (e) {} }
// ——— Init ———
(function init(){
  var rawEl = document.getElementById('raw');
  var st = loadAppState(); if (st) applyAppState(st);
  var qs = parseQueryState();
  if (qs) { applyAppState(qs); try { history.replaceState(null, '', location.pathname); } catch(e){} }

  if (rawEl && !rawEl.value.trim()) {
    rawEl.value = 'Clear Griemeer\t116.085\t92.868 m3\t19 km\nClear Griemeer\t122.270\t97.816 m3\t78 km\nClear Griemeer\t125.198\t100.158 m3\t81 km\nClear Griemeer\t143.493\t114.794 m3\t36 km\nClear Griemeer\t153.104\t122.483 m3\t24 km\nFiery Kernite\t70.000\t84.000 m3\t17 km\nGriemeer\t78.204\t62.563 m3\t68 km\nGriemeer\t89.722\t71.777 m3\t66 km\nGriemeer\t97.035\t77.628 m3\t3.528 m\nGriemeer\t97.839\t78.271 m3\t50 km\nGriemeer\t118.601\t94.880 m3\t40 km\nGriemeer\t122.579\t98.063 m3\t31 km\nGriemeer\t139.418\t111.534 m3\t31 km\nGriemeer\t150.732\t120.585 m3\t54 km\nGriemeer\t296.826\t237.460 m3\t34 km\nInky Griemeer\t61.147\t48.917 m3\t62 km\nInky Griemeer\t125.905\t100.724 m3\t7.714 m\nInky Griemeer\t135.446\t108.356 m3\t86 km\nKernite\t66.667\t80.000 m3\t17 km\nKernite\t68.889\t82.666 m3\t21 km\nKernite\t71.111\t85.333 m3\t56 km\nKernite\t73.333\t87.999 m3\t70 km\nLuminous Kernite\t44.800\t53.760 m3\t64 km\nLuminous Kernite\t46.200\t55.440 m3\t28 km\nLuminous Kernite\t49.000\t58.800 m3\t17 km\nOpaque Griemeer\t49.702\t39.761 m3\t25 km\nOpaque Griemeer\t69.300\t55.440 m3\t58 km\nPrismatic Gneiss\t1.515\t7.575 m3\t16 km\nResplendant Kernite\t24.162\t28.994 m3\t45 km\nResplendant Kernite\t34.300\t41.160 m3\t13 km';
  }
   // Events
  var onInput = function(){ calculate(); saveAppState(); };
  document.getElementById('calc').addEventListener('click', onInput);
  var rb = document.getElementById('reset'); if (rb) rb.addEventListener('click', function(){ resetAll(); saveAppState(); });
  var sb = document.getElementById('share'); if (sb) sb.addEventListener('click', function(){
    var url = buildShareURL();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function(){ sb.textContent = 'Link kopiert'; setTimeout(function(){ sb.textContent = 'Link teilen'; }, 2000); }, function(){ window.prompt('Link kopieren:', url); });
    } else {
      window.prompt('Link kopieren:', url);
    }
  });

  document.getElementById('reset').addEventListener('click', function(){ resetAll(); saveAppState(); });
  document.getElementById('raw').addEventListener('input', onInput);
  document.getElementById('rate').addEventListener('input', onInput);
  document.getElementById('modules').addEventListener('input', onInput);
  document.getElementById('chars').addEventListener('input', onInput);
  var unitSel = document.getElementById('unitSelect'); if (unitSel) unitSel.addEventListener('change', function(){ unitChoice = unitSel.value; rerenderGroupTable(); saveAppState(); });
  var t = document.getElementById('themeToggle'); if (t) t.addEventListener('click', function(){ var next = (document.documentElement.getAttribute('data-theme') === 'dark') ? 'light' : 'dark'; applyTheme(next); });
   attachSortHandlers(); updateSortIndicators();
  onInput();
})();
   // ——— Robust: Zahlen direkt vor m3/m³ aus beliebigem Text extrahieren ———
function extractM3ValuesRobust(text) {
  var out = [];
  var i = 0;
  var len = text.length;
  while (i < len) {
    var idx1 = text.toLowerCase().indexOf('m3', i);
    var idx2 = text.indexOf('m³', i);
    var idx = -1;
    if (idx1 === -1) idx = idx2; else if (idx2 === -1) idx = idx1; else idx = (idx1 < idx2 ? idx1 : idx2);
    if (idx === -1) break;
    var j = idx - 1;
    while (j >= 0) { var ch = text[j]; if (ch === ' ' || ch === ' ' || ch === ' ') j--; else break; }
    var k = j;
    while (k >= 0) {
      var ch2 = text[k];
      if ((ch2 >= '0' && ch2 <= '9') || ch2 === '.' || ch2 === ',' || ch2 === ' ' || ch2 === ' ' || ch2 === ' ') k--;
      else break;
    }
    var numStr = text.slice(k + 1, j + 1).trim();
    if (numStr) {
      var norm = '';
      for (var p = 0; p < numStr.length; p++) {
        var c = numStr[p];
        if (c === ' ' || c === ' ' || c === ' ') continue;
        if (c === '.') continue;
        if (c === ',') norm += '.'; else norm += c;
      }
      var num = Number(norm);
      if (Number.isFinite(num)) out.push(num);
    }
    i = idx + 2;
  }
  return out;
}

