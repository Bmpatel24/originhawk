const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 8998;

let currentTarget = null;
let savedResults = {};

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/save_frame') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const data = JSON.parse(body);
      const base64Data = data.image.replace(/^data:image\/jpeg;base64,/, '');
      const buf = Buffer.from(base64Data, 'base64');
      
      const savePaths = [
        path.join(__dirname, 'assets/Hero section', data.name),
        path.join(__dirname, 'Ai Studio/assets/Hero section', data.name),
        path.join(__dirname, 'Ai Studio/public/assets/Hero section', data.name),
      ];

      savePaths.forEach(p => {
        fs.writeFileSync(p, buf);
        console.log(`Saved ${data.name} (${buf.length} bytes) to ${p}`);
      });

      savedResults[data.name] = buf.length;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    });
    return;
  }

  // Serve static files
  let reqPath = decodeURI(req.url.split('?')[0]);
  if (reqPath === '/' || reqPath === '/sampler') reqPath = '/thumb_sampler.html';

  const fullPath = path.join(__dirname, reqPath);
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    const ext = path.extname(fullPath).toLowerCase();
    const mimeMap = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.jpg': 'image/jpeg',
      '.mp4': 'video/mp4'
    };
    res.writeHead(200, { 'Content-Type': mimeMap[ext] || 'application/octet-stream' });
    fs.createReadStream(fullPath).pipe(res);
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

// Update thumb_sampler.html with client logic to extract at 2.0s
const samplerHtml = `<!DOCTYPE html>
<html>
<body>
  <h1>Thumbnail Extractor</h1>
  <video id="vid" crossorigin="anonymous" muted playsinline></video>
  <canvas id="cvs"></canvas>
  <div id="status">Starting...</div>

  <script>
    async function capture(videoSrc, targetTime, outputName) {
      document.getElementById('status').innerText = 'Capturing ' + outputName + ' from ' + videoSrc;
      const vid = document.getElementById('vid');
      const cvs = document.getElementById('cvs');
      const ctx = cvs.getContext('2d');

      return new Promise((resolve, reject) => {
        vid.src = videoSrc;
        vid.load();

        vid.onloadedmetadata = () => {
          cvs.width = vid.videoWidth || 1280;
          cvs.height = vid.videoHeight || 720;
          vid.currentTime = Math.min(targetTime, vid.duration * 0.35);
        };

        vid.onseeked = async () => {
          try {
            ctx.drawImage(vid, 0, 0, cvs.width, cvs.height);
            const dataUrl = cvs.toDataURL('image/jpeg', 0.95);
            
            await fetch('/save_frame', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: outputName, image: dataUrl })
            });
            document.getElementById('status').innerText = 'Saved ' + outputName;
            resolve();
          } catch (e) {
            reject(e);
          }
        };

        vid.onerror = (e) => reject(e);
      });
    }

    async function runAll() {
      try {
        await capture('/assets/Hero%20section/1.mp4', 1.0, 'thumb_1.jpg');
        await capture('/assets/Hero%20section/2.mp4', 2.0, 'thumb_2.jpg');
        await capture('/assets/Hero%20section/3.mp4', 2.5, 'thumb_3.jpg');
        document.getElementById('status').innerText = 'ALL_DONE';
      } catch (err) {
        document.getElementById('status').innerText = 'ERROR: ' + err.message;
      }
    }

    window.onload = runAll;
  </script>
</body>
</html>`;

fs.writeFileSync(path.join(__dirname, 'thumb_sampler.html'), samplerHtml, 'utf8');

server.listen(PORT, async () => {
  console.log(`Sampler server listening on http://localhost:${PORT}`);

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    `http://localhost:${PORT}/thumb_sampler.html`
  ]);

  // Check every 500ms if all 3 thumbs are saved
  const checkInterval = setInterval(() => {
    if (savedResults['thumb_1.jpg'] && savedResults['thumb_2.jpg'] && savedResults['thumb_3.jpg']) {
      console.log('All 3 thumbnails extracted with high clarity!');
      clearInterval(checkInterval);
      chrome.kill();
      server.close();
      process.exit(0);
    }
  }, 500);

  // Safety timeout after 15s
  setTimeout(() => {
    console.log('Timeout reached. Results:', savedResults);
    chrome.kill();
    server.close();
    process.exit(0);
  }, 15000);
});
