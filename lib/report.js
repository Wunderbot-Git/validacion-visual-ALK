const fs = require('fs');

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SEV = { high: ['Kritisch', '#e11d48'], medium: ['Mittel', '#f59e0b'], low: ['Niedrig', '#64748b'] };

function cellStatus(r) {
  if (r.issues.some((i) => i.severity === 'high')) return 'high';
  if (r.issues.some((i) => i.severity === 'medium')) return 'medium';
  if (r.issues.length) return 'low';
  return 'ok';
}

function writeReport(file, summary, results, config) {
  const pages = [...new Set(results.map((r) => r.page))];
  const vps = config.viewports.filter((v) => results.some((r) => r.viewport === v.name));
  const get = (p, v) => results.find((r) => r.page === p && r.viewport === v);
  const color = { high: '#e11d48', medium: '#f59e0b', low: '#94a3b8', ok: '#16a34a' };
  const icon = { high: '✖', medium: '!', low: '·', ok: '✓' };

  const grid = `
<table class="grid"><thead><tr><th></th>${vps.map((v) => `<th>${esc(v.name)}<br><small>${v.width}×${v.height}</small></th>`).join('')}</tr></thead>
<tbody>${pages.map((p) => `<tr><th>${esc(p)}</th>${vps.map((v) => {
    const r = get(p, v.name);
    if (!r) return '<td>–</td>';
    const s = cellStatus(r);
    return `<td><a href="#${r.key}" style="background:${color[s]}" title="${r.issues.length} Befund(e)">${icon[s]} ${r.issues.length || ''}</a></td>`;
  }).join('')}</tr>`).join('')}</tbody></table>`;

  const details = results.filter((r) => r.issues.length).sort((a, b) =>
    ['high', 'medium', 'low', 'ok'].indexOf(cellStatus(a)) - ['high', 'medium', 'low', 'ok'].indexOf(cellStatus(b))).map((r) => `
<section id="${r.key}">
  <h3>${esc(r.page)} · ${esc(r.viewport)} <small>${r.size} · ${r.engine}</small></h3>
  <p class="url"><a href="${esc(r.url)}">${esc(r.url)}</a></p>
  <ul>${r.issues.map((i) => `<li><span class="sev" style="background:${SEV[i.severity][1]}">${SEV[i.severity][0]}</span>${i.isNew && !summary.firstRun ? ' <span class="sev" style="background:#004797">NEU</span>' : ''} ${esc(i.message)}${i.shot ? ` – <a href="${i.shot}">Screenshot</a>` : ''}</li>`).join('')}</ul>
  <div class="shots">${r.issues.filter((i) => i.shot).map((i) => `<a href="${i.shot}"><img src="${i.shot}" loading="lazy"></a>`).join('')}
  ${r.shots.top ? `<figure><a href="${r.shots.top}"><img src="${r.shots.top}" loading="lazy"></a><figcaption>Oben, sauber</figcaption></figure>` : ''}
  ${r.shots.diff && r.diff > 0.01 ? `<figure><a href="${r.shots.diff}"><img src="${r.shots.diff}" loading="lazy"></a><figcaption>Diff ${(r.diff * 100).toFixed(1)}%</figcaption></figure>` : ''}</div>
</section>`).join('');

  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Alkosto Visual Check – ${esc(summary.startedAt.slice(0, 10))}</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;margin:0;color:#1e293b;background:#f8fafc}
header{background:#004797;color:#fff;padding:20px 28px}header h1{margin:0;font-size:22px}header p{margin:6px 0 0;opacity:.85}
main{padding:24px 28px;max-width:1400px}
.kpis{display:flex;gap:12px;margin-bottom:22px}.kpi{background:#fff;border-radius:10px;padding:14px 18px;min-width:120px;box-shadow:0 1px 3px #0001}
.kpi b{display:block;font-size:26px}
.grid{border-collapse:collapse;background:#fff;box-shadow:0 1px 3px #0001;border-radius:10px;overflow:hidden;margin-bottom:28px}
.grid th,.grid td{padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:13px}.grid tbody th{text-align:left}
.grid td a{display:inline-block;min-width:42px;padding:5px 8px;border-radius:6px;color:#fff;text-decoration:none;font-weight:bold}
section{background:#fff;border-radius:10px;padding:16px 20px;margin-bottom:16px;box-shadow:0 1px 3px #0001}
section h3{margin:0}section small{color:#64748b;font-weight:normal}.url{margin:4px 0 8px;font-size:12px}
.sev{color:#fff;font-size:11px;font-weight:bold;padding:2px 7px;border-radius:4px;margin-right:4px}
li{margin:4px 0;font-size:14px}.shots{display:flex;gap:12px;flex-wrap:wrap;margin-top:10px}
.shots img{max-height:280px;max-width:420px;border:1px solid #e2e8f0;border-radius:6px}figure{margin:0}figcaption{font-size:12px;color:#64748b}
</style></head><body>
<header><h1>Alkosto Visual Check · Black Days</h1><p>${esc(new Date(summary.startedAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' }))} · ${summary.checks} Kombinationen geprüft</p></header>
<main>
<div class="kpis">
  <div class="kpi"><b style="color:#004797">${summary.firstRun ? '–' : summary.newHigh}</b>neu kritisch</div>
  <div class="kpi"><b style="color:#e11d48">${summary.high}</b>kritisch</div>
  <div class="kpi"><b style="color:#f59e0b">${summary.medium}</b>mittel</div>
  <div class="kpi"><b style="color:#64748b">${summary.low}</b>niedrig</div>
</div>
${grid}
${details || '<p>Keine Befunde. 🎉</p>'}
</main></body></html>`;
  fs.writeFileSync(file, html);
}

module.exports = { writeReport };
