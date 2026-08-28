import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const publicDir = path.join(projectRoot, 'public');

const PAGES = [
  'https://homedesigns.app/',
  'https://homedesigns.app/ai-interior-design',
  'https://homedesigns.app/ai-exterior-design',
  'https://homedesigns.app/ai-floor-plan',
];

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchHtml(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return await res.text();
}

function extractUrls(html) {
  const urls = new Set();
  
  // CDN regex
  const cdnRegex = /https:\/\/cdn\.homedesigns\.app\/[^"'\s\)\\]+/g;
  let match;
  while ((match = cdnRegex.exec(html)) !== null) {
    let u = match[0].replace(/&amp;/g, '&');
    u = u.replace(/[,\)]+$/, '');
    urls.add(u);
  }

  // Next.js static images or assets
  const logoRegex = /"((\/logo[^"]*|\/favicon[^"]*|\/og-image[^"]*|\/apple-touch-icon[^"]*))"/g;
  while ((match = logoRegex.exec(html)) !== null) {
    urls.add(`https://homedesigns.app${match[1]}`);
  }

  return Array.from(urls);
}

async function downloadFile(url, destPath) {
  try {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    if (fs.existsSync(destPath)) {
      const stat = fs.statSync(destPath);
      if (stat.size > 0) {
        console.log(`[SKIPPED] ${destPath} (already exists)`);
        return true;
      }
    }
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.warn(`[FAIL] ${url} -> HTTP ${res.status}`);
      return false;
    }
    const arrayBuffer = await res.arrayBuffer();
    fs.writeFileSync(destPath, Buffer.from(arrayBuffer));
    console.log(`[DOWNLOADED] ${url} -> ${path.relative(projectRoot, destPath)} (${arrayBuffer.byteLength} bytes)`);
    return true;
  } catch (err) {
    console.error(`[ERROR] downloading ${url}:`, err.message);
    return false;
  }
}

async function main() {
  console.log('--- Starting asset crawl from homedesigns.app ---');
  const allUrls = new Set();

  for (const pageUrl of PAGES) {
    console.log(`Fetching ${pageUrl}...`);
    try {
      const html = await fetchHtml(pageUrl);
      const urls = extractUrls(html);
      console.log(`Found ${urls.length} media URLs on ${pageUrl}`);
      urls.forEach((u) => allUrls.add(u));
    } catch (err) {
      console.error(`Error fetching page ${pageUrl}:`, err.message);
    }
  }

  console.log(`\nTotal unique media URLs discovered: ${allUrls.size}`);
  
  const manifest = [];

  for (const urlStr of allUrls) {
    try {
      const parsed = new URL(urlStr);
      let localRelPath = parsed.pathname.replace(/^\/+/, '');
      
      const destPath = path.join(publicDir, localRelPath);
      const success = await downloadFile(urlStr, destPath);
      if (success) {
        manifest.push({ url: urlStr, local: `/${localRelPath}` });
      }
    } catch (err) {
      console.error(`Invalid URL ${urlStr}:`, err.message);
    }
  }

  fs.writeFileSync(
    path.join(projectRoot, 'docs', 'design', 'crawled-assets.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8'
  );
  console.log(`\nDone! Saved asset manifest to docs/design/crawled-assets.json (${manifest.length} assets).`);
}

main();
