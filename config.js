// Konfiguration: Seiten, Auflösungen, kritische Elemente.
// Kritische Elemente werden automatisch gefunden (Text-/Struktur-Heuristik).
// Wenn die Heuristik falsch greift, pro Seite "selectors" überschreiben.

module.exports = {
  // ---- Seiten ------------------------------------------------------------
  // type bestimmt, welche kritischen Elemente geprüft werden (siehe criticalByType).
  // Auswahl nach Contentsquare-Views (Template-Mapping 119262), Montag 16.11.2026.
  // PDPs während der Black Days wöchentlich prüfen: Top-Produkte wechseln mit den Aktionen.
  pages: [
    // Home – 180k Besuche/Woche, größte Einzelseite
    { name: 'Home', type: 'home', url: 'https://www.alkosto.com/' },

    // Black-Days-/Angebots-Landings (Views am 16.11.)
    { name: 'Ofertas', type: 'plp', url: 'https://www.alkosto.com/ofertas/c/ofertas' },                        // 17.682
    { name: 'Black Days', type: 'landing', url: 'https://www.alkosto.com/temporadas/blackdays/c/blackdays' },       //  8.732 (z. Zt. Teaser-Seite ohne Produkte -> 'landing'; auf 'plp' stellen, sobald Produkte drauf sind)
    { name: 'Ofertas Tarjeta Alkosto', type: 'plp', url: 'https://www.alkosto.com/ofertas-medios-pago/ofertas-tarjeta-alkosto/c/ofertas-tarjeta-alkosto' }, // 1.256

    // PLPs
    { name: 'PLP Smartphones', type: 'plp', url: 'https://www.alkosto.com/celulares/smartphones/c/BI_101_ALKOS' },                 // 38.585
    { name: 'PLP Smart TV', type: 'plp', url: 'https://www.alkosto.com/tv/smart-tv/c/BI_120_ALKOS' },                             // 17.944
    { name: 'PLP Pequeños electro', type: 'plp', url: 'https://www.alkosto.com/electrodomesticos/pequenos-electrodomesticos/c/BI_150_ALKOS' }, // 7.651
    { name: 'PLP Neveras', type: 'plp', url: 'https://www.alkosto.com/electrodomesticos/refrigeracion/neveras/c/BI_0583_ALKOS' }, //  5.118
    { name: 'PLP Portátiles', type: 'plp', url: 'https://www.alkosto.com/computadores-tablet/computadores-portatiles/c/BI_104_ALKOS' }, // 5.601

    // PDPs – Top-Produkte, bewusst verschiedene Kategorien/Template-Varianten
    // Freidora Universal (8.753 Views) am 17.11. ausverkauft -> nächstes Top-Produkt
    { name: 'PDP Olla Hamilton Beach', type: 'pdp', url: 'https://www.alkosto.com/olla-multifuncional-compacta-hamilton-beach-14-litros/p/040094375240' }, // 2.688
    { name: 'PDP Honor Play 20', type: 'pdp', url: 'https://www.alkosto.com/celular-honor-play-20-128gb-4g-azul/p/6942785109339' },                       // 3.644
    { name: 'PDP TV Kalley 55', type: 'pdp', url: 'https://www.alkosto.com/tv-kalley-55-pulgadas-139-cm-55sb300-4k-uhd-smart-tv-linux/p/7705946480031' },  // 3.203
    { name: 'PDP Redmi Note 17 Pro', type: 'pdp', url: 'https://www.alkosto.com/celular-redmi-note-17-pro-256gb-5g-azul-ram-6gb-bateria/p/6939093010549' }, // 2.843
    { name: 'PDP Asus TUF F16', type: 'pdp', url: 'https://www.alkosto.com/computador-portatil-gamer-asus-tuf-f16-fx607vjr-intel-core/p/4711636623834' }, // 1.978
    { name: 'PDP Nevecón Electrolux', type: 'pdp', url: 'https://www.alkosto.com/nevecon-electrolux-side-by-side-423-litros-ers45f3c5eb/p/7909569483831' }, // 1.151
    { name: 'PDP Nevera Mabe 394L', type: 'pdp', url: 'https://www.alkosto.com/nevera-mabe-no-frost-congelador-superior-394-litros/p/7704712454955' },   //   568
  ],

  // ---- Auflösungen -------------------------------------------------------
  // engine: 'chromium' | 'webkit' (WebKit ≈ Safari/iOS)
  viewports: [
    { name: 'iPhone 14 hoch',      width: 390,  height: 844,  dpr: 3, mobile: true,  engine: 'webkit' },
    { name: 'iPhone 14 quer',      width: 844,  height: 390,  dpr: 3, mobile: true,  engine: 'webkit' },
    { name: 'Surface Duo quer',    width: 890,  height: 626,  dpr: 2, mobile: true,  engine: 'chromium' },
    { name: 'Android quer',        width: 915,  height: 412,  dpr: 3, mobile: true,  engine: 'chromium' },
    { name: 'Android hoch',        width: 412,  height: 915,  dpr: 3, mobile: true,  engine: 'chromium' },
    { name: 'iPad hoch',           width: 768,  height: 1024, dpr: 2, mobile: true,  engine: 'webkit' },
    { name: 'iPad quer',           width: 1024, height: 768,  dpr: 2, mobile: true,  engine: 'webkit' },
    { name: 'Laptop',              width: 1280, height: 800,  dpr: 1, mobile: false, engine: 'chromium' },
    { name: 'Desktop',             width: 1440, height: 900,  dpr: 1, mobile: false, engine: 'chromium' },
  ],

  // ---- Kritische Elemente pro Seitentyp ---------------------------------
  // auto-Locator: 'h1' | 'price' | 'addToCart' | 'search'
  // Alternativ CSS-Selektor als String.
  criticalByType: {
    pdp:     { 'Produktname': 'h1', 'Preis': 'price', 'Agregar al carrito': 'addToCart' },
    plp:     { 'Seitentitel': 'h1', 'Erster Preis': 'price' },
    home:    { 'Suche': 'search' },
    landing: {},
  },

  // Elemente, die beim Verdeckungs-Check ignoriert werden (z. B. Chat-Bubble),
  // weil sie bewusst über dem Inhalt schweben. Leer lassen = auch die melden.
  ignoreCoveringSelectors: [],

  // Elemente vor dem Screenshot ausblenden (Cookie-Banner, Popups).
  hideSelectors: ['#js-cookie-notification', '.js-cookie-notification'],

  // Wie viele Bildschirmhöhen pro Seite auf verdeckten Text gescannt werden
  textScanScreens: 3,

  // Bildvergleich: ab diesem Anteil geänderter Pixel (oberer Bildschirm) wird markiert
  diffThreshold: 0.25,

  // Seite laden
  navigationTimeoutMs: 45000,
  settleMs: 2500,
};
