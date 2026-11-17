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
- `report/results.json`: maschinenlesbar
- n8n-Webhook (nur bei kritischen Befunden): `POST` mit `{ source, summary, reportUrl, issues[] }`

## Einrichten (GitHub Actions)

1. Repo anlegen, diesen Ordner pushen.
2. `config.js → pages`: echte URLs eintragen (Black-Days-Landing, 2–3 PLPs, 4–5 PDPs mit Bestand).
3. Settings → Secrets → `N8N_WEBHOOK_URL` setzen.
4. Optional Settings → Variables → `USER_AGENT`, falls der Bot-Schutz einen freigegebenen User-Agent verlangt.
5. Actions → „Visual Check Black Days“ → *Run workflow* zum ersten Test.

Läuft automatisch 05:47 und 12:47 Bogotá. Nach einem CSS-Deploy manuell starten (Feld `only`, z. B. `PDP|quer`).
Der Report liegt als Artefakt am Lauf (14 Tage).

## Lokal / Mac mini

```bash
npm ci
npx playwright install chromium webkit
N8N_WEBHOOK_URL=https://… node check.js
ONLY="PDP.*quer" node check.js        # nur ein Teil
npm test                               # Selbsttest gegen nachgebaute Fehlerseite
```

Umgebungsvariablen: `N8N_WEBHOOK_URL`, `REPORT_URL`, `USER_AGENT`, `ONLY`, `ALERT_ALWAYS=1` (Webhook auch ohne Befunde), `FAIL_ON_HIGH=1` (Exit-Code 1 bei kritischen Befunden), `CHROME_PATH`, `OUT_DIR`, `BASELINE_DIR`, `CONFIG`.

## Grenzen

- Emulierte Auflösungen, keine echten Geräte. Layout-Konflikte wie der vom 17.11. werden zuverlässig erkannt, Gerätebugs (z. B. iOS-Tastatur) nicht.
- Läuft vor dem Cookie-Banner/Popup-Handling: störende Elemente ggf. in `hideSelectors` eintragen.
- Falls alkosto.com Rechenzentrums-IPs (GitHub) blockt: auf dem Mac mini laufen lassen (cron/launchd).
