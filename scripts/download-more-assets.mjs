import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const publicDir = path.join(projectRoot, 'public');

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
};

const stepFiles = [
  'C:/Users/monet/.gemini/antigravity/brain/516c1668-80f1-4ab9-ae40-b87a3d8a3cef/.system_generated/steps/14/content.md',
  'C:/Users/monet/.gemini/antigravity/brain/516c1668-80f1-4ab9-ae40-b87a3d8a3cef/.system_generated/steps/18/content.md',
  'C:/Users/monet/.gemini/antigravity/brain/516c1668-80f1-4ab9-ae40-b87a3d8a3cef/.system_generated/steps/20/content.md',
  'C:/Users/monet/.gemini/antigravity/brain/516c1668-80f1-4ab9-ae40-b87a3d8a3cef/.system_generated/steps/22/content.md',
];

const urlsToDownload = new Set();

for (const sf of stepFiles) {
  if (!fs.existsSync(sf)) continue;
  const content = fs.readFileSync(sf, 'utf-8');
  
  // url=%2Fassets...
  const encodedRegex = /url=(%2F[^&"\s]+)/g;
  let m;
  while ((m = encodedRegex.exec(content)) !== null) {
    const decoded = decodeURIComponent(m[1]);
    urlsToDownload.add(`https://homedesigns.app${decoded}`);
  }

  // direct src="/assets..."
  const srcRegex = /src="(\/assets\/[^"]+)"/g;
  while ((m = srcRegex.exec(content)) !== null) {
    urlsToDownload.add(`https://homedesigns.app${m[1]}`);
  }

  // cdn urls
  const cdnRegex = /(https:\/\/cdn\.homedesigns\.app\/[^\s"'\)>]+)/g;
  while ((m = cdnRegex.exec(content)) !== null) {
    let clean = m[1].replace(/&amp;/g, '&').replace(/[,\)]+$/, '');
    urlsToDownload.add(clean);
  }
}

console.log(`Discovered ${urlsToDownload.size} assets from step HTML files.`);

async function downloadFile(urlStr, destPath) {
  try {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    if (fs.existsSync(destPath) && fs.statSync(destPath).size > 0) {
      return true;
    }
    const res = await fetch(urlStr, { headers });
    if (!res.ok) {
      console.warn(`[FAIL ${res.status}] ${urlStr}`);
      return false;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(destPath, buf);
    console.log(`[SAVED] ${urlStr} -> ${path.relative(projectRoot, destPath)} (${buf.byteLength} bytes)`);
    return true;
  } catch (err) {
    console.error(`[ERROR] ${urlStr}:`, err.message);
    return false;
  }
}

async function run() {
  for (const u of urlsToDownload) {
    try {
      const parsed = new URL(u);
      let rel = parsed.pathname.replace(/^\/+/, '');
      const dest = path.join(publicDir, rel);
      await downloadFile(u, dest);
    } catch (e) {
      console.error('Invalid URL:', u, e.message);
    }
  }
  console.log('Finished downloading all assets.');
}

run();
