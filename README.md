# ORIGIN HAWK — PRIME LIMITED

> **Strategy. Content. Technology. Growth. Everything under one roof.**

High-performance digital presence and marketing platform built for **Origin Hawk Prime Limited**.

---

## 🚀 One-Click Deployment to Vercel

1. Push this repository to GitHub.
2. In [Vercel](https://vercel.com/new), select **Import Repository**.
3. Framework Preset: **Other** / **Static** (default).
4. Root Directory: `./` (leave default).
5. Click **Deploy**!

Everything is pre-configured with `vercel.json` for optimal video streaming, fast CDN caching, and automatic routing.

---

## 💻 Local Preview & Development

To test locally with live range-seeking and video streaming:

```bash
node server.js
```

Then open `http://localhost:8999` in your browser.

---

## 📁 Project Structure

```
├── assets/
│   ├── hero.mp4                     # High-production Hero Background Video
│   ├── hero-thumb.jpg               # Video Poster / Fallback Thumbnail
│   └── Logo/
│       ├── Logo for tab heading.jpg # Official Tab Favicon Mark
│       ├── Logo for header.svg      # Header Vector Logo
│       └── Logo.svg                 # Full Brand Vector Emblem
├── public/                          # Static Favicon Assets for Web Crawlers & CDNs
├── index.html                       # Main Production Application
├── preview.html                     # Live Preview Page
├── vercel.json                      # Vercel CDN, Headers & Byte-Range Routing
└── server.js                        # Node.js Streaming HTTP Server
```
