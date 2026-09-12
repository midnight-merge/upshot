#!/usr/bin/env node
/*
 * Renders the link previews - no dependencies, drives whatever Chrome is here.
 *
 *   node og/make.js
 *
 * A fragment never reaches a crawler, so the unfurl cannot carry THIS card's
 * headline. It carries what is true of every card instead: who it is from and
 * what opening it costs. One plate per audience, because they differ: the
 * homepage is read by someone deciding whether to try it, a card by someone
 * who has just been handed one, and /made/ by someone browsing what other
 * people got out of it. A page that unfurls under another page's headline is
 * worse than no image at all, so every document carrying an og:image gets its
 * own - which the test suite enforces.
 *
 * Committed as PNGs. They change about never, and a build step nobody runs is
 * a build step that rots.
 */
const {execFileSync} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const CHROME_CANDIDATES = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
].filter(Boolean);

const chrome = CHROME_CANDIDATES.find(p => { try { return fs.statSync(p).isFile(); } catch(e){ return false; } });
if(!chrome){ console.error('No Chrome found. Set CHROME=/path/to/chrome'); process.exit(1); }

/* 1200x630 is the size every unfurler crops toward. Rendered at 2x and left
   there: the plate is flat colour and type, so the file stays small and the
   type stays sharp on a retina phone, which is where these are read. */
const W = 1200, H = 630, SCALE = 2;

const PLATE = (title, sub) => `<!doctype html>
<meta charset="utf-8">
<style>
  html,body{margin:0}
  body{
    width:${W}px;height:${H}px;overflow:hidden;
    background:#12131A;color:#F7F7F4;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
    -webkit-font-smoothing:antialiased;
    display:flex;flex-direction:column;justify-content:center;
    padding:0 96px;box-sizing:border-box;
  }
  /* the accent edge is the card's own hairline, turned up loud enough to
     survive being scaled into a chat bubble */
  body::before{content:"";position:fixed;left:0;top:0;bottom:0;width:10px;background:#C8FF3D}
  .brand{display:flex;align-items:center;gap:14px;margin-bottom:52px}
  .logo{width:34px;height:29px;fill:#C8FF3D;display:block}
  .wordmark{
    font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
    font-size:26px;letter-spacing:.01em;color:#8E91A6;
  }
  h1{
    font-weight:700;font-size:82px;line-height:1.04;letter-spacing:-.032em;
    margin:0 0 32px;max-width:17ch;text-wrap:balance;
  }
  p{
    font-size:32px;line-height:1.36;letter-spacing:-.008em;
    color:#B4B6C2;margin:0;max-width:31ch;
  }
</style>
<div class="brand">
  <svg class="logo" viewBox="0 0 12 10" aria-hidden="true">
    <rect x="0" y="0" width="12" height="2" rx="1"/>
    <rect x="0" y="4" width="7" height="2" rx="1"/>
    <circle cx="1.5" cy="8.5" r="1.5"/>
  </svg>
  <span class="wordmark">upshot.fyi</span>
</div>
<h1>${title}</h1>
<p>${sub}</p>`;

const PLATES = [
  {
    out: path.join(ROOT, 'og.png'),
    html: PLATE('Make the tiny tool you wish existed',
                'Describe it to your AI. Upshot turns it into a page that works - and the whole thing is the link.')
  },
  {
    out: path.join(ROOT, 'v2', 'og.png'),
    html: PLATE('Someone sent you an upshot',
                'The whole thing is the link.')
  },
  {
    out: path.join(ROOT, 'made', 'og.png'),
    html: PLATE('Made with upshot',
                'Cards people made by telling their AI to read upshot.fyi and export this.')
  }
];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'upshot-og-'));

for(const plate of PLATES){
  const src = path.join(tmp, path.basename(plate.out) + '.html');
  fs.writeFileSync(src, plate.html);
  execFileSync(chrome, [
    '--headless', '--disable-gpu', '--hide-scrollbars',
    '--force-color-profile=srgb',
    `--window-size=${W},${H}`,
    `--force-device-scale-factor=${SCALE}`,
    `--screenshot=${plate.out}`,
    'file://' + src
  ], {stdio: 'ignore'});
  console.log(path.relative(ROOT, plate.out), fs.statSync(plate.out).size + ' bytes');
}

fs.rmSync(tmp, {recursive: true, force: true});
