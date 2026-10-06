const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 8995;
let framesSaved = {};

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/save_frame') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const data = JSON.parse(body);
      const base64Data = data.image.replace(/^data:image\/jpeg;base64,/, '');
      const buf = Buffer.from(base64Data, 'base64');
      
      const outDir = path.join(__dirname, 'assets/Hero section/test_samples');
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

      const filePath = path.join(outDir, data.name);
      fs.writeFileSync(filePath, buf);
      console.log(`Saved ${data.name} (${buf.length} bytes, avgBrightness: ${data.brightness})`);
      framesSaved[data.name] = { bytes: buf.length, brightness: data.brightness, time: data.time };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    });
    return;
  }

  let reqPath = decodeURI(req.url.split('?')[0]);
  if (reqPath === '/' || reqPath === '/sampler') reqPath = '/test_sampler.html';

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

const samplerHtml = `<!DOCTYPE html>
<html>
<body>
  <h1>Frame Sampler</h1>
  <video id="vid" crossorigin="anonymous" muted playsinline></video>
  <canvas id="cvs"></canvas>
  <div id="status">Starting...</div>

  <script>
    function getBrightness(ctx, width, height) {
      const imgData = ctx.getImageData(0, 0, width, height);
      const data = imgData.data;
      let total = 0;
      let nonBlackCount = 0;
      const step = 4 * 10; // sample every 10th pixel
      let samples = 0;
      for (let i = 0; i < data.length; i += step) {
        const r = data[i];
        const g = data[i+1];
        const b = data[i+2];
        const lum = 0.299*r + 0.587*g + 0.114*b;
        total += lum;
        if (lum > 20) nonBlackCount++;
        samples++;
      }
      return { avg: Math.round(total / samples), nonBlackRatio: Math.round((nonBlackCount / samples) * 100) };
    }

    async function inspectVideo(videoSrc, videoLabel) {
      const vid = document.getElementById('vid');
      const cvs = document.getElementById('cvs');
      const ctx = cvs.getContext('2d');

      return new Promise((resolve) => {
        vid.src = videoSrc;
        vid.load();

        vid.onloadedmetadata = async () => {
          cvs.width = vid.videoWidth || 1280;
          cvs.height = vid.videoHeight || 720;
          const dur = vid.duration;
          console.log(videoLabel, 'Duration:', dur, 'Resolution:', cvs.width, 'x', cvs.height);

          // Test times: 2s, 4s, 6s, 8s, 10s, 12s (or fractions of duration)
          const timeCandidates = [];
          for (let f = 0.15; f <= 0.85; f += 0.15) {
            timeCandidates.push(Math.round(dur * f * 10) / 10);
          }

          for (let i = 0; i < timeCandidates.length; i++) {
            const t = timeCandidates[i];
            await new Promise(resSeek => {
              vid.currentTime = t;
              vid.onseeked = async () => {
                ctx.drawImage(vid, 0, 0, cvs.width, cvs.height);
                const info = getBrightness(ctx, cvs.width, cvs.height);
                const dataUrl = cvs.toDataURL('image/jpeg', 0.9);
                const frameName = videoLabel + '_time_' + t.toFixed(1) + 's_bri_' + info.avg + '.jpg';
                
                await fetch('/save_frame', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    name: frameName,
                    image: dataUrl,
                    brightness: info.avg,
                    time: t
                  })
                });
                resSeek();
              };
            });
          }
          resolve();
        };

        vid.onerror = (e) => {
          console.error('Vid error', e);
          resolve();
        };
      });
    }

    async function run() {
      try {
        await inspectVideo('/assets/Hero%20section/1.mp4', 'vid1');
        await inspectVideo('/assets/Hero%20section/2.mp4', 'vid2');
        await inspectVideo('/assets/Hero%20section/3.mp4', 'vid3');
        document.getElementById('status').innerText = 'ALL_DONE';
      } catch (e) {
        document.getElementById('status').innerText = 'ERROR ' + e.message;
      }
    }

    window.onload = run;
  </script>
</body>
</html>`;

fs.writeFileSync(path.join(__dirname, 'test_sampler.html'), samplerHtml, 'utf8');

server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    `http://localhost:${PORT}/test_sampler.html`
  ]);

  setTimeout(() => {
    console.log('Finished waiting. Summary of saved frames:');
    console.log(JSON.stringify(framesSaved, null, 2));
    chrome.kill();
    server.close();
    process.exit(0);
  }, 20000);
});
