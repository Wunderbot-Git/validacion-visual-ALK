# Alkosto Visual Check (Black Days)

Lädt die wichtigsten Seiten von alkosto.com zweimal täglich in 9 Auflösungen (Hoch- und Querformat, iOS/WebKit und Android/Chromium, Tablet, Desktop) und meldet Layout-Konflikte, bevor Kunden sie sehen.

## Was geprüft wird

| Check | Schwere | Beispiel |
|---|---|---|
| Kritisches Element verdeckt (≥ 10 % der Textfläche) | kritisch | Thumbnail-Leiste liegt über Produktname/Preis (Surface Duo quer, 17.11.) |
| Kritisches Element fehlt / unsichtbar / ragt seitlich raus | kritisch | „Agregar al carrito“ per CSS ausgeblendet |
| Kritische Elemente überlappen sich | kritisch | Preis liegt auf dem CTA |
| CSS/JS/Font lädt nicht (4xx/5xx) | kritisch | Black-Days-Stylesheet 404 |
| Beliebiger Text verdeckt (erste 3 Bildschirmhöhen) | mittel | Sticker über Bottom-Nav |
| Seitliches Scrollen + Verursacher | mittel | Banner 60 px zu breit |
| Text abgeschnitten / Schrift < 11 px | mittel | |
| Bild lädt nicht | niedrig | |
| Oberer Bildschirm > 25 % anders als beim letzten Lauf | niedrig | Banner getauscht (Info) |

Kritische Elemente pro Seitentyp (`config.js → criticalByType`) werden automatisch gefunden: Produktname = `h1`, Preis = größter Preis-Text ohne Durchstreichung, CTA = Button „Agregar al carrito“, Suche = Suchfeld. Bei Bedarf pro Seite mit `selectors` überschreiben.
Transparente Overlays (z. B. aufgespannte Links über Produktkarten) zählen nicht als Verdeckung.

## Ergebnis

- `report/index.html`: Raster Seite × Auflösung, Befunde mit rot markierten Screenshots
- `report/results.json`: maschinenlesbar (inkl. `summary.runId`, `isNew` pro Befund)
- Jeder Lauf veröffentlicht den Report im Branch [`report-latest`](../../tree/report-latest) (Screenshots unter `shots/`), zusätzlich als Artefakt am Lauf (14 Tage).
- Auf GitHub zusätzlich als Tabelle in der Lauf-Zusammenfassung (🆕 = neu).

## Alarme (n8n)

Der n8n-Workflow **„Visual Check · Alertas Black Days Alkosto“** fragt alle 15 Minuten die GitHub-API ab (öffentliches Repo, kein Token nötig). Ist ein neuer Lauf fertig, liest er `results.json` aus `report-latest` und meldet nur **neue** Befunde gegenüber dem vorherigen Lauf:

| Stufe | Beispiele | Kanal |
|---|---|---|
| Kritisch (P2) | Produktname, Preis oder „Agregar al carrito“ verdeckt/fehlt, CSS lädt nicht | Teams „Monitoreo e-commerce“ + Mail |
| Mittel (P3) | verdeckter Text, seitliches Scrollen, abgeschnittener Text | nur Mail |
| Lauf fehlgeschlagen | | technischer Hinweis per Mail |

Bekannte Befunde stehen weiter im Report, lösen aber keinen erneuten Alarm aus.
Optional kann `check.js` zusätzlich direkt an einen Webhook senden (`N8N_WEBHOOK_URL`), das ist für den n8n-Workflow aber nicht nötig.

## Einrichten (GitHub Actions)

1. `config.js → pages`: Seiten pflegen (ausverkaufte PDPs tauschen, Black-Days-Landing auf `plp` stellen, sobald Produkte drauf sind).
2. Optional Settings → Variables → `USER_AGENT`, falls der Bot-Schutz einen freigegebenen User-Agent verlangt.
3. Actions → „Visual Check Black Days“ → *Run workflow* zum Testen.

Läuft automatisch 05:47 und 12:47 Bogotá. Nach einem CSS-Deploy manuell starten (Feld `only`, z. B. `PDP|quer`; Feld `debug` = 1 für Style-Details der verdeckenden Elemente).

## Lokal / Mac mini

```bash
npm ci
npx playwright install chromium webkit
N8N_WEBHOOK_URL=https://… node check.js
ONLY="PDP.*quer" node check.js        # nur ein Teil
npm test                               # Selbsttest gegen nachgebaute Fehlerseite
```

Umgebungsvariablen: `N8N_WEBHOOK_URL` (optional), `REPORT_URL`, `USER_AGENT`, `ONLY`, `ALERT_ALWAYS=1` (Webhook auch ohne neue Befunde), `FAIL_ON_HIGH=1` (Exit-Code 1 bei kritischen Befunden), `CHROME_PATH`, `OUT_DIR`, `BASELINE_DIR`, `CONFIG`.

## Grenzen

- Emulierte Auflösungen, keine echten Geräte. Layout-Konflikte wie der vom 17.11. werden zuverlässig erkannt, Gerätebugs (z. B. iOS-Tastatur) nicht.
- Läuft vor dem Cookie-Banner/Popup-Handling: störende Elemente ggf. in `hideSelectors` eintragen.
- Falls alkosto.com Rechenzentrums-IPs (GitHub) blockt: auf dem Mac mini laufen lassen (cron/launchd).
