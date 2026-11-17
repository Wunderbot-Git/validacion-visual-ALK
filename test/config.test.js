const base = require('../config.js');
module.exports = { ...base,
  pages: [{ name: 'Fixture PDP', type: 'pdp', url: 'http://127.0.0.1:8765/fixture-pdp.html' }],
  viewports: base.viewports.filter(v => v.engine === 'chromium'),
  settleMs: 300 };
