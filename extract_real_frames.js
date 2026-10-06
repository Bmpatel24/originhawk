const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 8996;
const results = {};

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/save_frame') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const data = JSON.parse(body);
      const base64Data = data.image.replace(/^data:image\/jpeg;base64,/, '');
      const buf = Buffer.from(base64Data, 'base64');
      
      const outDir = path.join(__dirname, 'assets/Hero section/candidates');
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

      const filePath = path.join(outDir, data.name);
      fs.writeFileSync(filePath, buf);
      console.log(`Saved candidate ${data.name} (${buf.length} bytes, bri: ${data.brightness})`);
      if (!results[data.video]) results[data.video] = [];
      results[data.video].push({
        name: data.name,
        time: data.time,
        brightness: data.brightness,
        nonBlack: data.nonBlack,
        bytes: buf.length,
        path: filePath
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    });
    return;
  }

  let reqPath = decodeURI(req.url.split('?')[0]);
  if (reqPath === '/' || reqPath === '/sampler') reqPath = '/video_sampler.html';

  const fullPath = path.join(__dirname, reqPath);
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const stat = fs.statSync(fullPath);
  const fileSize = stat.size;
  const ext = path.extname(fullPath).toLowerCase();
  const mimeMap = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.jpg': 'image/jpeg',
    '.mp4': 'video/mp4'
  };
  const contentType = mimeMap[ext] || 'application/octet-stream';

  const range = req.headers.range;
  if (range && ext === '.mp4') {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(fullPath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': contentType,
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes'
    };
    res.writeHead(200, head);
    fs.createReadStream(fullPath).pipe(res);
  }
});

const samplerHtml = `<!DOCTYPE html>
<html>
<head><title>Video Sampler with Range Support</title></head>
<body>
  <h1>Sampling Frames</h1>
  <video id="vid" crossorigin="anonymous" muted playsinline></video>
  <canvas id="cvs"></canvas>
  <div id="status">Ready</div>

  <script>
    function analyze(ctx, w, h) {
      const data = ctx.getImageData(0, 0, w, h).data;
      let totalLum = 0;
      let nonBlack = 0;
      let samples = 0;
      for (let i = 0; i < data.length; i += 40) {
        const r = data[i];
        const g = data[i+1];
        const b = data[i+2];
        const lum = 0.299*r + 0.587*g + 0.114*b;
        totalLum += lum;
        if (lum > 25) nonBlack++;
        samples++;
      }
      return {
        avgLum: Math.round(totalLum / samples),
        nonBlackPct: Math.round((nonBlack / samples) * 100)
      };
    }

    async function sampleVideo(videoSrc, vidKey) {
      document.getElementById('status').innerText = 'Starting ' + vidKey;
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
          console.log(vidKey, 'duration:', dur);

          // Test 8 points across the video from 10% to 85%
          const checkTimes = [];
          for (let p = 0.10; p <= 0.85; p += 0.10) {
            checkTimes.push(Math.round(dur * p * 10) / 10);
          }

          for (const t of checkTimes) {
            await new Promise(r => {
              const onSeeked = async () => {
                vid.removeEventListener('seeked', onSeeked);
                // small delay for render
                setTimeout(async () => {
                  ctx.drawImage(vid, 0, 0, cvs.width, cvs.height);
                  const stat = analyze(ctx, cvs.width, cvs.height);
                  const dataUrl = cvs.toDataURL('image/jpeg', 0.92);
                  const fileName = vidKey + '_t' + t.toFixed(1) + 's_lum' + stat.avgLum + '_nb' + stat.nonBlackPct + '.jpg';

                  await fetch('/save_frame', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      video: vidKey,
                      name: fileName,
                      image: dataUrl,
                      brightness: stat.avgLum,
                      nonBlack: stat.nonBlackPct,
                      time: t
                    })
                  });
                  r();
                }, 100);
              };
              vid.addEventListener('seeked', onSeeked);
              vid.currentTime = t;
            });
          }
          resolve();
        };

        vid.onerror = (e) => {
          console.error(vidKey, 'error', e);
          resolve();
        };
      });
    }

    async function main() {
      await sampleVideo('/assets/Hero%20section/1.mp4', 'vid1');
      await sampleVideo('/assets/Hero%20section/2.mp4', 'vid2');
      await sampleVideo('/assets/Hero%20section/3.mp4', 'vid3');
      document.getElementById('status').innerText = 'ALL_VIDEOS_DONE';
    }

    window.onload = main;
  </script>
</body>
</html>`;

fs.writeFileSync(path.join(__dirname, 'video_sampler.html'), samplerHtml, 'utf8');

server.listen(PORT, async () => {
  console.log(`Server listening on port ${PORT} with HTTP 206 Range support`);
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    `http://localhost:${PORT}/video_sampler.html`
  ]);

  const timeout = setTimeout(() => {
    console.log('Finished extraction.');
    chrome.kill();
    server.close();
    process.exit(0);
  }, 25000);
});
