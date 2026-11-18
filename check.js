#!/usr/bin/env node
// Alkosto Visual Check – Black Days
// Lädt jede Seite in jeder Auflösung, prüft Layout-Konflikte, macht Screenshots,
// vergleicht mit dem letzten Lauf, schreibt report/index.html und alarmiert n8n.

const fs = require('fs');
const path = require('path');
const { chromium, webkit } = require('playwright');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');
const config = require(process.env.CONFIG || './config.js');
const { runInPageChecks } = require('./lib/inpage');
const { writeReport } = require('./lib/report');

const OUT = path.resolve(process.env.OUT_DIR || 'report');
const BASELINE = path.resolve(process.env.BASELINE_DIR || 'baseline');
const WEBHOOK = process.env.N8N_WEBHOOK_URL || '';
const REPORT_URL = process.env.REPORT_URL || '';
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY, 'i') : null; // z. B. ONLY="PDP|quer"

const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
fs.mkdirSync(BASELINE, { recursive: true });

const engines = { chromium, webkit };
const launchOpts = (name) => (name === 'chromium' && process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});

function diffRatio(curFile, baseFile, diffFile) {
  if (!fs.existsSync(baseFile)) return null;
  const a = PNG.sync.read(fs.readFileSync(curFile));
  const b = PNG.sync.read(fs.readFileSync(baseFile));
  if (a.width !== b.width || a.height !== b.height) return 1;
  const d = new PNG({ width: a.width, height: a.height });
  const n = pixelmatch(a.data, b.data, d.data, a.width, a.height, { threshold: 0.15 });
  fs.writeFileSync(diffFile, PNG.sync.write(d));
  return n / (a.width * a.height);
}

// Rote Rahmen um Befunde ins Dokument zeichnen
async function annotate(page, issue) {
  await page.evaluate(({ rect, coverRect, msg }) => {
    document.querySelectorAll('.__vc_box').forEach((e) => e.remove());
    const box = (r, color, label) => {
      if (!r) return;
      const d = document.createElement('div');
      d.className = '__vc_box';
      Object.assign(d.style, {
        position: r.fixed ? 'fixed' : 'absolute', left: r.x - 3 + 'px', top: r.y - 3 + 'px', width: r.w + 6 + 'px', height: r.h + 6 + 'px',
        outline: `3px solid ${color}`, background: color + '22', zIndex: 2147483647, pointerEvents: 'none',
      });
      if (label) {
        const t = document.createElement('div');
        t.textContent = label;
        Object.assign(t.style, { position: 'absolute', left: '0', top: '-22px', background: color, color: '#fff',
          font: 'bold 12px Arial', padding: '2px 6px', whiteSpace: 'nowrap', maxWidth: '90vw', overflow: 'hidden' });
        d.appendChild(t);
      }
      document.body.appendChild(d);
    };
    box(coverRect, '#f59e0b', 'verdeckt durch');
    box(rect, '#e11d48', msg);
  }, { rect: issue.rect, coverRect: issue.coverRect, msg: issue.message.slice(0, 80) });
  // Zum Befund scrollen; bei fixierten Elementen zum (nicht fixierten) Verdecker oder gar nicht
  if (issue.rect.fixed) await page.evaluate((y) => window.scrollTo(0, y || 0), issue.scrollY);
  else await page.evaluate((r) => window.scrollTo(0, Math.max(0, r.y + r.h / 2 - window.innerHeight / 2)), issue.rect);
  await page.waitForTimeout(250);
}

async function checkOne(browser, pageCfg, vp) {
  const key = `${slug(pageCfg.name)}__${slug(vp.name)}`;
  const result = { page: pageCfg.name, url: pageCfg.url, viewport: vp.name, size: `${vp.width}×${vp.height}`, engine: vp.engine, key, issues: [], shots: {} };
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dpr || 1,
    isMobile: !!vp.mobile,
    hasTouch: !!vp.mobile,
    locale: 'es-CO',
    userAgent: process.env.USER_AGENT || undefined,
  });
  const page = await ctx.newPage();
  const failed = [];
  page.on('response', (r) => {
    const t = r.request().resourceType();
    if (r.status() >= 400 && (t === 'stylesheet' || t === 'script' || t === 'font')) failed.push(`${r.status()} ${t} ${r.url().slice(0, 140)}`);
  });
  page.on('requestfailed', (r) => {
    const t = r.resourceType();
    if (t === 'stylesheet') failed.push(`FAILED ${t} ${r.url().slice(0, 140)}`);
  });

  try {
    const resp = await page.goto(pageCfg.url, { waitUntil: 'domcontentloaded', timeout: config.navigationTimeoutMs });
    if (resp && resp.status() >= 400) result.issues.push({ severity: 'high', type: 'http', label: 'Seite', message: `HTTP ${resp.status()}` });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
    if (config.hideSelectors.length) await page.addStyleTag({ content: `${config.hideSelectors.join(',')}{display:none!important}` });
    await page.waitForTimeout(config.settleMs);

    // Sauberer Screenshot oben (für Bildvergleich)
    const top = path.join(OUT, 'shots', `${key}__top.png`);
    await page.screenshot({ path: top, scale: 'css' });
    result.shots.top = `shots/${key}__top.png`;
    const ratio = diffRatio(top, path.join(BASELINE, `${key}__top.png`), path.join(OUT, 'shots', `${key}__diff.png`));
    result.diff = ratio;
    if (ratio !== null) result.shots.diff = `shots/${key}__diff.png`;
    if (ratio !== null && ratio > config.diffThreshold) {
      result.issues.push({ severity: 'low', type: 'visual-diff', label: 'Bildvergleich', message: `${Math.round(ratio * 100)}% des oberen Bildschirms anders als beim letzten Lauf` });
    }

    const critical = config.criticalByType[pageCfg.type] || {};
    const res = await page.evaluate(runInPageChecks, {
      critical: { ...critical, ...(pageCfg.selectors || {}) },
      ignoreCovering: config.ignoreCoveringSelectors,
      textScanScreens: config.textScanScreens,
    });
    result.issues.push(...res.issues);
    for (const f of failed.slice(0, 5)) result.issues.push({ severity: 'high', type: 'resource', label: 'Ressource', message: `Lädt nicht: ${f}` });

    // Annotierte Screenshots für die wichtigsten Befunde
    const withRect = result.issues.filter((i) => i.rect).sort((a, b) => sev(a) - sev(b)).slice(0, 3);
    let n = 0;
    for (const issue of withRect) {
      await annotate(page, issue);
      const f = `shots/${key}__issue${++n}.png`;
      await page.screenshot({ path: path.join(OUT, f), scale: 'css' });
      issue.shot = f;
    }
  } catch (e) {
    result.issues.push({ severity: 'high', type: 'error', label: 'Lauf', message: `Seite konnte nicht geprüft werden: ${e.message.split('\n')[0]}` });
  } finally {
    await ctx.close();
  }
  return result;
}

const sev = (i) => ({ high: 0, medium: 1, low: 2 }[i.severity] ?? 3);

(async () => {
  const started = new Date();
  const results = [];
  const byEngine = {};
  for (const vp of config.viewports) (byEngine[vp.engine] = byEngine[vp.engine] || []).push(vp);

  // Engines parallel (Chromium und WebKit gleichzeitig), Seiten je Engine nacheinander
  await Promise.all(Object.entries(byEngine).map(async ([engineName, vps]) => {
    let browser;
    try {
      browser = await engines[engineName].launch(launchOpts(engineName));
    } catch (e) {
      console.warn(`⚠ ${engineName} nicht verfügbar (${e.message.split('\n')[0]}) – übersprungen`);
      return;
    }
    for (const p of config.pages) for (const vp of vps) {
      if (ONLY && !ONLY.test(`${p.name} ${vp.name}`)) continue;
      const r = await checkOne(browser, p, vp);
      const h = r.issues.filter((i) => i.severity === 'high').length;
      console.log(`→ ${p.name} @ ${vp.name} … ${r.issues.length ? `${r.issues.length} Befund(e)${h ? `, ${h} kritisch` : ''}` : 'ok'}`);
      results.push(r);
    }
    await browser.close();
  }));
  // stabile Reihenfolge wie in config.js
  const order = (r) => config.pages.findIndex((p) => p.name === r.page) * 100 + config.viewports.findIndex((v) => v.name === r.viewport);
  results.sort((a, b) => order(a) - order(b));

  // Neu vs. bekannt: Vergleich mit den Befunden des letzten Laufs
  const FINDINGS = path.join(BASELINE, 'findings.json');
  const prev = fs.existsSync(FINDINGS) ? new Set(JSON.parse(fs.readFileSync(FINDINGS, 'utf8'))) : null;
  const fkey = (r, i) => `${r.key}|${i.type}|${i.label}|${i.coveredBy || ''}`;
  for (const r of results) for (const i of r.issues) i.isNew = prev ? !prev.has(fkey(r, i)) : true;
  const checkedKeys = new Set(results.map((r) => r.key));
  const keep = prev ? [...prev].filter((k) => !checkedKeys.has(k.split('|')[0])) : [];
  fs.writeFileSync(FINDINGS, JSON.stringify([...keep, ...results.flatMap((r) => r.issues.map((i) => fkey(r, i)))]));

  // Ergebnis + Baseline aktualisieren
  const summary = {
    startedAt: started.toISOString(),
    finishedAt: new Date().toISOString(),
    checks: results.length,
    high: results.reduce((s, r) => s + r.issues.filter((i) => i.severity === 'high').length, 0),
    medium: results.reduce((s, r) => s + r.issues.filter((i) => i.severity === 'medium').length, 0),
    low: results.reduce((s, r) => s + r.issues.filter((i) => i.severity === 'low').length, 0),
    newHigh: results.reduce((s, r) => s + r.issues.filter((i) => i.severity === 'high' && i.isNew).length, 0),
    newMedium: results.reduce((s, r) => s + r.issues.filter((i) => i.severity === 'medium' && i.isNew).length, 0),
    firstRun: !prev,
    runId: process.env.GITHUB_RUN_ID || null,
    only: process.env.ONLY || null,
  };
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ summary, results }, null, 2));
  writeReport(path.join(OUT, 'index.html'), summary, results, config);
  for (const r of results) if (r.shots.top) fs.copyFileSync(path.join(OUT, r.shots.top), path.join(BASELINE, `${r.key}__top.png`));

  // Befunde im Log und (auf GitHub) als Lauf-Zusammenfassung
  const lines = [];
  for (const r of results) for (const i of r.issues.filter((x) => x.severity !== 'low')) {
    lines.push(`| ${i.severity === 'high' ? '🔴' : '🟠'}${i.isNew && !summary.firstRun ? ' 🆕' : ''} | ${r.page} | ${r.viewport} | ${i.message.replace(/\|/g, '/')} |`);
  }
  console.log('\nBefunde:\n' + lines.join('\n'));
  if (process.env.DEBUG) for (const r of results) for (const i of r.issues) if (i.debug) console.log(`DEBUG ${r.page} @ ${r.viewport}: ${i.debug}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `## Visual Check: ${summary.newHigh} neue kritische · ${summary.high} kritisch · ${summary.medium} mittel · ${summary.low} niedrig\n\n` +
      `Report mit Screenshots: Artefakt *visual-check-report* unten auf dieser Seite.\n\n` +
      `| | Seite | Auflösung | Befund |\n|---|---|---|---|\n${lines.slice(0, 300).join('\n')}\n`);
  }

  console.log(`\nFertig: ${summary.checks} Checks · ${summary.newHigh} NEUE kritische · ${summary.high} kritisch · ${summary.medium} mittel · ${summary.low} niedrig`);
  console.log(`Report: ${path.join(OUT, 'index.html')}`);

  // Alarm an n8n: nur bei NEUEN kritischen Befunden (bekannte stehen im Report), ALERT_ALWAYS=1 erzwingt
  if (WEBHOOK && (summary.newHigh > 0 || process.env.ALERT_ALWAYS === '1')) {
    const payload = {
      source: 'alkosto-visual-check',
      summary,
      reportUrl: REPORT_URL,
      issues: results.flatMap((r) => r.issues.filter((i) => i.severity === 'high' && i.isNew).map((i) => ({
        page: r.page, url: r.url, viewport: `${r.viewport} (${r.size})`, type: i.type, message: i.message,
      }))).slice(0, 40),
    };
    try {
      const res = await fetch(WEBHOOK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      console.log(`n8n-Webhook: HTTP ${res.status}`);
    } catch (e) {
      console.warn(`n8n-Webhook fehlgeschlagen: ${e.message}`);
    }
  }
  process.exitCode = summary.high > 0 && process.env.FAIL_ON_HIGH === '1' ? 1 : 0;
})();
