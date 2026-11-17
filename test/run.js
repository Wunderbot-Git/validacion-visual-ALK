// Startet einen lokalen Server für die Fixture-Seite und führt den Check dagegen aus.
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const srv = http.createServer((q, s) => { s.setHeader('content-type', 'text/html'); s.end(fs.readFileSync(path.join(__dirname, 'fixture-pdp.html'))); });
srv.listen(8765, '127.0.0.1', () => {
  const p = spawn(process.execPath, [path.join(__dirname, '..', 'check.js')], { stdio: 'inherit',
    env: { ...process.env, CONFIG: path.join(__dirname, 'config.test.js'), OUT_DIR: 'report-test', BASELINE_DIR: 'baseline-test' } });
  p.on('exit', (code) => { srv.close(); process.exitCode = code; });
});
