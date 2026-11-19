// Läuft IM Browser (page.evaluate). Muss in sich geschlossen sein.
// Liefert eine Liste von Befunden mit Element-Rechtecken (Dokument-Koordinaten).

async function runInPageChecks(opts) {
  const { critical, ignoreCovering, textScanScreens } = opts;
  const issues = [];
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const isIgnored = (el) => ignoreCovering.some((s) => { try { return el.closest(s); } catch { return false; } });

  function describe(el) {
    if (!el || !el.tagName) return '?';
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    const cls = (typeof el.className === 'string' ? el.className : '').trim().split(/\s+/).filter(Boolean).slice(0, 3);
    if (cls.length) s += '.' + cls.join('.');
    if (!el.id && !cls.length) {
      const anc = el.parentElement && el.parentElement.closest('[id],[class]');
      if (anc && anc !== document.body) s += ' in ' + describe(anc);
    }
    return s;
  }

  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
    }
    return true;
  }

  function docRect(el) {
    const r = el.getBoundingClientRect();
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const p = getComputedStyle(n).position;
      if (p === 'fixed' || p === 'sticky') return { x: r.left, y: r.top, w: r.width, h: r.height, fixed: true };
    }
    return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
  }

  // Malt `el` am Punkt (x,y) wirklich etwas Deckendes? Wenn nicht, zählt es nicht als Verdeckung.
  // Deckend = (weitgehend) undurchsichtiger Hintergrund, Bild/Medien/Formularfeld, oder eigene Schrift genau an diesem Punkt.
  function effectiveOpacity(el) {
    let o = 1;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity);
    return o;
  }
  function paintsNothing(el, x, y) {
    if (effectiveOpacity(el) < 0.5) return true;
    if (['IMG', 'VIDEO', 'CANVAS', 'IFRAME', 'PICTURE', 'svg', 'SVG', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) return false;
    const cs = getComputedStyle(el);
    const bg = cs.backgroundColor;
    const alpha = bg.startsWith('rgba') ? parseFloat(bg.split(',')[3]) : (bg === 'transparent' ? 0 : 1);
    if (alpha >= 0.6 || /url\(/.test(cs.backgroundImage)) return false; // Verläufe (z. B. Durchstreich-Diagonale) zählen nicht
    // eigene Schrift nur dort, wo die Glyphen tatsächlich liegen
    const col = cs.color;
    const colAlpha = col.startsWith('rgba') ? parseFloat(col.split(',')[3]) : 1;
    if (colAlpha < 0.3) return true;
    for (const c of el.childNodes) {
      if (c.nodeType !== 3 || !c.textContent.trim()) continue;
      const rg = document.createRange();
      rg.selectNodeContents(c);
      for (const r of rg.getClientRects()) if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return false;
    }
    return true;
  }

  function debugInfo(el, x, y) {
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    const own = [...el.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent.trim()).join(' ').slice(0, 20);
    return `${el.tagName} bg=${cs.backgroundColor} img=${cs.backgroundImage.slice(0, 30)} op=${effectiveOpacity(el).toFixed(2)} color=${cs.color} `
      + `text="${own}" box=${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)}x${Math.round(r.height)} pt=${Math.round(x)},${Math.round(y)} `
      + `pseudo:before=${getComputedStyle(el, '::before').content}/${getComputedStyle(el, '::before').backgroundColor} after=${getComputedStyle(el, '::after').content}/${getComputedStyle(el, '::after').backgroundColor}`;
  }

  function inFixedLayer(el) {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const p = getComputedStyle(n).position;
      if (p === 'fixed' || p === 'sticky') return true;
    }
    return false;
  }

  // Liegt `target` an Punkt (x,y) oben? Gibt null (ok) oder das verdeckende Element zurück.
  function coveringAt(target, x, y) {
    if (x < 0 || y < 0 || x >= vw || y >= vh) return null;
    const stack = document.elementsFromPoint(x, y);
    // Kommt das Ziel an diesem Punkt gar nicht vor (abgeschnitten/eingeklappt), ist es nicht sichtbar, nicht verdeckt
    if (!stack.some((n) => n === target || target.contains(n))) return null;
    for (const n of stack) {
      if (n === target || target.contains(n) || n.contains(target)) return null;
      if (isIgnored(n)) continue;
      if (paintsNothing(n, x, y)) continue;
      return n;
    }
    return null;
  }

  // ---- Kritische Elemente finden ---------------------------------------
  const PRICE_RE = /^\$\s?\d{1,3}([.,]\d{3})+$/;
  const locators = {
    h1: () => [...document.querySelectorAll('h1')].find(isVisible) || document.querySelector('h1'),
    price: () => {
      const cands = [];
      for (const el of document.querySelectorAll('body *')) {
        if (el.children.length > 2) continue;
        const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (t.length > 16 || !PRICE_RE.test(t)) continue;
        if (getComputedStyle(el).textDecorationLine.includes('line-through')) continue; // Streichpreis
        if (el.closest('del,s')) continue;
        cands.push(el);
      }
      const vis = cands.filter(isVisible);
      const pool = vis.length ? vis : cands;
      const cta = locators.addToCart && locators.addToCart();
      if (cta && isVisible(cta) && vis.length) {
        const maxFs = Math.max(...vis.map((e) => parseFloat(getComputedStyle(e).fontSize)));
        const big = vis.filter((e) => parseFloat(getComputedStyle(e).fontSize) >= maxFs * 0.75);
        const c = cta.getBoundingClientRect();
        const d = (e) => { const r = e.getBoundingClientRect(); return Math.hypot(r.left + r.width / 2 - (c.left + c.width / 2), r.top + r.height / 2 - (c.top + c.height / 2)); };
        // Kombo-/Bundle-Preise ausschließen
        const main = big.filter((e) => !e.closest('[class*=kombo i],[class*=bundle i],[class*=combo i],[class*=recommend i]'));
        const list = (main.length ? main : big).sort((a, b) => d(a) - d(b));
        if (list.length) return list[0];
      }
      pool.sort((a, b) => parseFloat(getComputedStyle(b).fontSize) - parseFloat(getComputedStyle(a).fontSize)
        || a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      return pool[0];
    },
    addToCart: () => {
      const els = [...document.querySelectorAll('button, a, input[type=submit]')]
        .filter((e) => /agregar al carrito/i.test(e.textContent || e.value || ''));
      return els.find(isVisible) || els[0];
    },
    search: () => {
      const sel = 'input[type=search], input[name*=search i], input[id*=search i], input[class*=search i], input[placeholder*=busca i], input[name=text], '
        + '[role=searchbox], [role=search] input, [role=search] button, .aa-Input, .aa-DetachedSearchButton, '
        + 'button[aria-label*=busca i], button[class*=search i], [class*=search i] input, [class*=search i] button, [id*=search i] button';
      const els = [...document.querySelectorAll(sel)];
      return els.find(isVisible) || els[0];
    },
  };

  function locate(spec) {
    if (locators[spec]) return locators[spec]();
    try { return [...document.querySelectorAll(spec)].find(isVisible) || document.querySelector(spec); } catch { return null; }
  }

  // Ausverkaufte PDP: Preis/CTA fehlen gewollt -> eigener Hinweis statt Layoutfehler
  const bodyText = document.body.innerText || '';
  const soldOut = /producto agotado|no cuenta con (unidades|inventario|existencias)|sin stock/i.test(bodyText) && !(locators.addToCart() && isVisible(locators.addToCart()));
  if (soldOut && ('Preis' in critical || 'Agregar al carrito' in critical)) {
    delete critical['Preis'];
    delete critical['Agregar al carrito'];
    issues.push({ severity: 'low', type: 'sold-out', label: 'Produkt', message: 'Produkt ausverkauft – Preis/CTA nicht geprüft (PDP in config.js tauschen)' });
  }

  // ---- 1) Kritische Elemente: vorhanden, sichtbar, nicht verdeckt, nicht abgeschnitten
  const found = {};
  for (const [label, spec] of Object.entries(critical)) {
    const el = locate(spec);
    if (!el) {
      issues.push({ severity: 'high', type: 'missing', label, message: `${label}: nicht gefunden` });
      continue;
    }
    found[label] = el;
    document.documentElement.style.scrollBehavior = 'auto';
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    await sleep(700);
    if (!isVisible(el)) {
      issues.push({ severity: 'high', type: 'hidden', label, message: `${label}: vorhanden, aber unsichtbar`, rect: docRect(el), selector: describe(el) });
      continue;
    }
    const r = el.getBoundingClientRect();
    // Abtastpunkte: jede Textzeile in 10 Schritten; ohne Text (Input/Button) Box in 2 Reihen
    const pts = [];
    const range = document.createRange();
    range.selectNodeContents(el);
    const lines = [...range.getClientRects()].filter((l) => l.width > 4 && l.height > 4);
    if (lines.length && el.tagName !== 'INPUT') {
      for (const l of lines) for (let k = 0; k < 10; k++) pts.push([l.left + ((k + 0.5) * l.width) / 10, l.top + l.height / 2]);
    } else {
      for (const fy of [0.3, 0.7]) for (let k = 0; k < 10; k++) pts.push([r.left + ((k + 0.5) * r.width) / 10, r.top + r.height * fy]);
    }
    const coverers = new Map();
    let covered = 0;
    
    for (const [x, y] of pts) {
      const c = coveringAt(el, x, y);
      if (c) { covered++; coverers.set(c, (coverers.get(c) || 0) + 1); }
    }
    // Zweiter Versuch: erneut zentrieren und messen, damit Scroll-/Lade-Animationen nicht als Verdeckung zählen
    if (covered >= 2 && covered / pts.length >= 0.1) {
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      await sleep(900);
      const r2 = el.getBoundingClientRect();
      const dx = r2.left - r.left, dy = r2.top - r.top;
      covered = 0; coverers.clear();
      for (const [x, y] of pts) {
        const c = coveringAt(el, x + dx, y + dy);
        if (c) { covered++; coverers.set(c, (coverers.get(c) || 0) + 1); }
      }
    }
    if (covered >= 2 && covered / pts.length >= 0.1) {
      const top = [...coverers.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const share = Math.round((covered / pts.length) * 100);
      issues.push({
        severity: 'high', type: 'covered', label,
        message: `${label}: zu ~${share}% verdeckt von <${describe(top)}>`,
        rect: docRect(el), coverRect: docRect(top), selector: describe(el), coveredBy: describe(top), scrollY: scrollY,
      });
    }
    // außerhalb des Viewports (horizontal)
    let clippedX = false;
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      if (/(hidden|auto|scroll|clip)/.test(getComputedStyle(a).overflowX)) { clippedX = true; break; }
    }
    if (!clippedX && (r.right > vw + 1 || r.left < -1)) {
      issues.push({ severity: 'high', type: 'offscreen', label, message: `${label}: ragt seitlich aus dem Bildschirm`, rect: docRect(el), selector: describe(el) });
    }
    // abgeschnittener Text
    const cs = getComputedStyle(el);
    if ((el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 4)
        && /(hidden|clip)/.test(cs.overflow + cs.overflowX + cs.overflowY)
        && cs.textOverflow !== 'ellipsis' && !/-webkit-box/.test(cs.display)) {
      issues.push({ severity: 'medium', type: 'clipped', label, message: `${label}: Text wird abgeschnitten`, rect: docRect(el), selector: describe(el) });
    }
    if (parseFloat(cs.fontSize) < 11) {
      issues.push({ severity: 'medium', type: 'tiny-font', label, message: `${label}: Schrift nur ${cs.fontSize}`, rect: docRect(el), selector: describe(el) });
    }
  }

  // kritische Elemente überlappen einander
  const labels = Object.keys(found);
  for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
    const a = found[labels[i]], b = found[labels[j]];
    if (a.contains(b) || b.contains(a) || !isVisible(a) || !isVisible(b)) continue;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
    const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (ox > 4 && oy > 4) {
      issues.push({ severity: 'high', type: 'overlap', label: `${labels[i]} × ${labels[j]}`,
        message: `${labels[i]} und ${labels[j]} überlappen sich`, rect: docRect(a), coverRect: docRect(b) });
    }
  }

  // ---- 2) Horizontaler Überlauf ----------------------------------------
  window.scrollTo(0, 0);
  await sleep(200);
  const sw = document.documentElement.scrollWidth;
  if (sw > vw + 2) {
    const culprits = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.right <= vw + 2 || r.width === 0 || !isVisible(el)) continue;
      // wird von einem Vorfahren abgeschnitten (Karussell etc.)? dann egal
      let clipped = false;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (/(hidden|auto|scroll|clip)/.test(cs.overflowX) && p.getBoundingClientRect().right <= vw + 2) { clipped = true; break; }
      }
      if (clipped) continue;
      if (culprits.some((c) => c.contains(el))) continue;
      culprits.push(el);
      if (culprits.length >= 3) break;
    }
    issues.push({ severity: 'medium', type: 'h-overflow', label: 'Seite',
      message: `Seite ist ${sw - vw}px breiter als der Bildschirm (seitliches Scrollen)` +
        (culprits.length ? ` – Verursacher: ${culprits.map(describe).join(', ')}` : ''),
      rect: culprits[0] ? docRect(culprits[0]) : null });
  }

  // ---- 3) Verdeckter Text allgemein (erste N Bildschirmhöhen) ------------
  const seen = new Set();
  const textIssues = [];
  const maxY = Math.min(document.documentElement.scrollHeight, vh * textScanScreens);
  for (let y = 0; y < maxY; y += Math.floor(vh * 0.8)) {
    window.scrollTo(0, y);
    await sleep(250);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.textContent.trim().length >= 3 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    let n;
    while ((n = walker.nextNode())) {
      const el = n.parentElement;
      if (!el || seen.has(el) || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'OPTION'].includes(el.tagName)) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const rr = range.getBoundingClientRect();
      if (rr.width < 8 || rr.height < 6 || rr.top < 0 || rr.bottom > vh || rr.left < 0 || rr.right > vw) continue;
      if (!isVisible(el)) continue;
      seen.add(el);
      const cx = rr.left + rr.width / 2, cy = rr.top + rr.height / 2;
      const c1 = coveringAt(el, cx, cy);
      const c2 = coveringAt(el, rr.left + Math.min(6, rr.width / 4), cy);
      if (c1 && c2 && c1 === c2 && !inFixedLayer(c1)) {
        textIssues.push({ severity: 'medium', type: 'text-covered', label: 'Text',
          message: `Text „${n.textContent.trim().slice(0, 40)}“ verdeckt von <${describe(c1)}>`,
          rect: docRect(el), coverRect: docRect(c1), selector: describe(el), coveredBy: describe(c1), scrollY: scrollY, debug: debugInfo(c1, cx, cy) });
      }
    }
  }
  // Gleiche Verdecker zusammenfassen (max. 2 Beispiele pro Verdecker)
  const byCover = {};
  for (const t of textIssues) (byCover[t.coveredBy] = byCover[t.coveredBy] || []).push(t);
  for (const list of Object.values(byCover)) {
    issues.push(...list.slice(0, 2));
    if (list.length > 2) issues.push({ ...list[0], rect: null, coverRect: null, message: `… und ${list.length - 2} weitere Texte verdeckt von <${list[0].coveredBy}>` });
  }

  // ---- 4) Kaputte Bilder -------------------------------------------------
  const broken = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.src && isVisible(i));
  if (broken.length) issues.push({ severity: 'low', type: 'broken-img', label: 'Bilder',
    message: `${broken.length} Bild(er) laden nicht, z. B. ${broken[0].src.slice(0, 120)}`, rect: docRect(broken[0]) });

  window.scrollTo(0, 0);
  return { issues, docHeight: document.documentElement.scrollHeight, scrollWidth: sw };
}

module.exports = { runInPageChecks };
