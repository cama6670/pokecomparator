import sharp from 'sharp';
import fs from 'node:fs/promises';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2b5a58"/><stop offset="1" stop-color="#5a2f3e"/></linearGradient></defs>
  <rect width="512" height="512" rx="110" fill="url(#g)"/>
  <g transform="translate(256 256)">
    <circle r="150" fill="#f4f4f4"/>
    <path d="M-150 0 A150 150 0 0 1 150 0 L 0 0 Z" fill="#e63946"/>
    <rect x="-150" y="-14" width="300" height="28" fill="#1b1b1f"/>
    <circle r="52" fill="#1b1b1f"/><circle r="38" fill="#f4f4f4"/><circle r="22" fill="#1b1b1f"/>
  </g>
  <rect x="98" y="378" width="120" height="26" rx="8" fill="#ffd54a"/>
  <rect x="98" y="418" width="180" height="26" rx="8" fill="#ffd54a"/>
  <rect x="294" y="378" width="160" height="26" rx="8" fill="#ff8c3a"/>
  <rect x="294" y="418" width="90" height="26" rx="8" fill="#ff8c3a"/>
</svg>`;
await fs.mkdir('assets', { recursive: true });
await sharp(Buffer.from(svg)).resize(1024, 1024).png().toFile('assets/icon.png');
await sharp(Buffer.from(svg)).resize(512, 512).png().toFile('www/icon.png');
await sharp(Buffer.from(svg)).resize(256, 256).png().toFile('assets/icon-256.png');
// Splash: icon centered on dark background
const splash = `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732"><rect width="2732" height="2732" fill="#1b1b1f"/></svg>`;
const icon = await sharp(Buffer.from(svg)).resize(600, 600).png().toBuffer();
await sharp(Buffer.from(splash)).composite([{ input: icon, gravity: 'centre' }]).png().toFile('assets/splash.png');
await sharp(Buffer.from(splash)).composite([{ input: icon, gravity: 'centre' }]).png().toFile('assets/splash-dark.png');
console.log('icons written');
