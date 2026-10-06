const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 8993;

const testHtml = `<!DOCTYPE html>
<html>
<head><title>Verify Page Test</title></head>
<body>
  <h1>DOM & Thumbnail Verifier</h1>
  <iframe id="appFrame" src="http://localhost:8999/index.html" style="width: 1280px; height: 900px;"></iframe>
  <div id="results">Running...</div>

  <script>
    async function runTest() {
      const frame = document.getElementById('appFrame');
      await new Promise(r => frame.onload = r);
      // Wait 2 seconds for React to mount and hydrate
      await new Promise(r => setTimeout(r, 2000));

      const doc = frame.contentDocument || frame.contentWindow.document;
      const win = frame.contentWindow;

      const report = {
        thumbnails: [],
        collisionCtaText: '',
        modalOpenedOnCtaClick: false
      };

      // 1. Check all 3 thumbnails in Hero section
      const thumbImgs = doc.querySelectorAll('button[aria-label^="Switch to video"] img');
      for (let i = 0; i < thumbImgs.length; i++) {
        const img = thumbImgs[i];
        report.thumbnails.push({
          index: i,
          src: img.getAttribute('src'),
          currentSrc: img.currentSrc,
          complete: img.complete,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight
        });
      }

      // 2. Check Collision CTA button
      const ctaBtn = doc.getElementById('collision-lets-discuss-btn');
      if (ctaBtn) {
        report.collisionCtaText = ctaBtn.innerText.trim();
        // Click the CTA button to test opening modal
        ctaBtn.click();
        await new Promise(r => setTimeout(r, 500));
        
        // Check if discuss modal opened
        const modalHeading = doc.querySelector('h2');
        const modalVisible = doc.body.innerText.includes("LET'S DISCUSS") && doc.body.innerText.includes("START A PROJECT • DIRECT INQUIRY");
        report.modalOpenedOnCtaClick = modalVisible;
      }

      // Send results to server
      await fetch('/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report)
      });
    }

    window.onload = runTest;
  </script>
</body>
</html>`;

fs.writeFileSync(path.join(__dirname, 'verifier.html'), testHtml, 'utf8');

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/report') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const report = JSON.parse(body);
      console.log('=== VERIFICATION REPORT ===');
      console.log(JSON.stringify(report, null, 2));
      console.log('===========================');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      setTimeout(() => {
        chrome.kill();
        server.close();
        process.exit(0);
      }, 500);
    });
    return;
  }

  if (req.url === '/' || req.url === '/verifier.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(testHtml);
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

let chrome;
server.listen(PORT, () => {
  console.log(`Verifier server running on port ${PORT}`);
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  chrome = spawn(chromePath, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    `http://localhost:${PORT}/verifier.html`
  ]);

  setTimeout(() => {
    console.log('Timeout reached');
    if (chrome) chrome.kill();
    server.close();
    process.exit(1);
  }, 15000);
});
