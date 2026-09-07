#!/usr/bin/env node
/*
 * Regression tests for upshot.fyi.
 *
 * The page and the share image are two independent implementations of the
 * same design: the browser lays out the card from CSS, and layout() in
 * index.html re-derives it in canvas ops. They can drift silently - a
 * position:fixed on .foot once shortened every PNG by 34px, because
 * getComputedStyle hands back the USED margin of a positioned element. These
 * tests exist to make that kind of drift loud.
 *
 *   node test/run.js            check against test/baselines.json
 *   node test/run.js --update   rewrite the baselines from current output
 *
 * No dependencies. Drives the Chrome that is already on the machine.
 */
'use strict';

const {execFileSync} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, 'index.html');
const BASELINES = path.join(__dirname, 'baselines.json');

const CHROME_CANDIDATES = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
].filter(Boolean);

/* Canvas dimension ceilings. iOS Safari is the tight one, and going past it
   throws nothing - you get a truncated bitmap. This is what used to clip long
   exports, so every case is checked against it. */
const MAX_SIDE = 4096;
const MAX_AREA = 16777216;

const POINT = 'A key point with enough words in it that it will wrap to two or three lines inside the card body';
const WORDY = 'word '.repeat(90);

const CASES = [
  ['short',     `#s=explainer&m=GPT-5&d=2026-09-07&a=Short one&h=A short headline&v=One sentence verdict&p=First point&p=Second point`],
  ['long',      `#m=Claude Opus 5&d=2026-09-07&a=Scope line&h=A considerably longer headline that will wrap onto three lines&v=A verdict sentence long enough to wrap across several lines in the card${`&p=${POINT}`.repeat(4)}`],
  ['broken',    `#nonsense`],
  ['longtoken', `#h=${'A'.repeat(120)}&v=ok&p=fine`],
  ['nodate',    `#h=No date here&v=ok&p=fine&m=GPT-5`],
  ['noscope',   `#h=No scope line&v=ok&p=one&p=two&m=GPT-5&d=2026-09-07`],
  ['checklist',      `#s=checklist&m=GPT-5&d=2026-09-07&a=Before the launch&h=What is left to do&v=Two of these block the release&c=Vendor the library into the repo&c=Swap the script tag for a local path&c=Drop the CSP exception&c=${POINT}`],
  ['checklistTicked', `#s=checklist&m=GPT-5&d=2026-09-07&h=Half done&v=Progress&c=First item&c=Second item&c=Third item&k=101`],
  ['compare',        `#s=compare&m=Claude Opus 5&d=2026-09-07&a=Picking a database for the new service&h=Postgres or SQLite&v=Postgres, unless you are shipping to the edge&l=Postgres&la=Concurrent writes without a global lock&la=Real types, extensions, and a query planner worth trusting&r=SQLite&ra=Zero ops - it is one file on disk&ra=Faster for read-heavy work at small scale`],
  ['compareOneSided', `#s=compare&h=Only one option given&v=Should still render&l=Postgres&la=One point&la=Two points`],
  ['absurd',    `#h=Tall&v=v${`&p=${WORDY}`.repeat(9)}`],
  ['gigantic',  `#h=Tall&v=v${`&p=${WORDY}`.repeat(40)}`]
];

const fail = [];
const note = m => console.log('  ' + m);
const check = (ok, label, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
  if(!ok) fail.push(label);
};

function findChrome(){
  for(const c of CHROME_CANDIDATES) if(fs.existsSync(c)) return c;
  console.error('No Chrome found. Set CHROME=/path/to/chrome');
  process.exit(2);
}

/* ---- 1. static checks: regressions that need no browser ---- */
function staticChecks(raw){
  console.log('\nstatic');
  // Comments explain why some of these rules exist and name the very patterns
  // being banned, so strip them before matching or the docs fail the tests.
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  check(!/<script[^>]+src=/i.test(src), 'no external script tags',
        'the page must fetch nothing from a third party');
  check(!/@import|url\(\s*['"]?https?:/i.test(src), 'no external stylesheets or url() fetches');
  check(!/min-height\s*:\s*[^;]*\b\d+vh/i.test(src), 'no vh units',
        'on iOS 100vh is the large viewport and scrolls every page');

  // The renderer reads .foot's computed margin-top. Positioning rewrites that
  // to its USED value, which the abspos algorithm resolves to 0.
  const foot = /\.foot\s*\{([^}]*)\}/.exec(src);
  check(foot && /margin-top/.test(foot[1]), '.foot still declares margin-top',
        'layout() reads it to place the signature');
  check(!/\.foot\s*\{[^}]*position\s*:\s*(fixed|absolute|sticky)/.test(src),
        '.foot is not positioned',
        'positioning silently zeroes the margin the renderer reads');
}

/* ---- 2. the page's own JavaScript parses ---- */
function syntaxCheck(src){
  console.log('\nsyntax');
  const js = /<script>([\s\S]*)<\/script>/.exec(src);
  if(!js){ check(false, 'found an inline <script>'); return; }
  const tmp = path.join(os.tmpdir(), `upshot-syntax-${process.pid}.js`);
  fs.writeFileSync(tmp, js[1]);
  try {
    execFileSync(process.execPath, ['--check', tmp], {stdio: 'pipe'});
    check(true, 'inline script parses');
  } catch(e){
    check(false, 'inline script parses', String(e.stderr || e).split('\n')[0]);
  } finally { fs.unlinkSync(tmp); }
}

/* ---- 3. render every case in a real browser ---- */
const PROBE = `
<script>
addEventListener('load', () => {
  document.fonts.ready.then(() => {
    const cases = __CASES__;
    const out = cases.map(([name, hash]) => {
      try {
        location.hash = hash;
        draw();
        const L = shareImage.layout();
        const canvas = shareImage.paint(L);
        // what the browser actually laid the card out as, for comparison
        const sheet = document.getElementById('sheet').getBoundingClientRect();
        return {
          name,
          imageHeight: L.height,
          imageWidth: L.width,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          ops: L.ops.length,
          domHeight: Math.round(sheet.height)
        };
      } catch(e){
        return {name, error: e && e.message ? e.message : String(e)};
      }
    });
    const el = document.createElement('div');
    el.id = '__RESULT__';
    el.textContent = btoa(JSON.stringify(out));
    document.body.appendChild(el);
  });
});
</script>
`;

function renderAll(chrome, src){
  const harness = path.join(os.tmpdir(), `upshot-harness-${process.pid}.html`);
  fs.writeFileSync(harness, src.replace('</body>',
    PROBE.replace('__CASES__', JSON.stringify(CASES)) + '</body>'));
  let dom;
  try {
    dom = execFileSync(chrome, [
      '--headless', '--disable-gpu', '--hide-scrollbars', '--no-sandbox',
      '--force-device-scale-factor=2',
      '--virtual-time-budget=20000',
      '--window-size=500,900',
      '--dump-dom', 'file://' + harness
    ], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024});
  } finally { fs.unlinkSync(harness); }

  const m = /<div id="__RESULT__">([A-Za-z0-9+/=]*)<\/div>/.exec(dom);
  if(!m){
    console.error('The page produced no result. Did layout()/paint() throw before reporting?');
    process.exit(2);
  }
  return JSON.parse(Buffer.from(m[1], 'base64').toString('utf8'));
}

/* ---- 4. compare ---- */
function main(){
  const update = process.argv.includes('--update');
  const src = fs.readFileSync(PAGE, 'utf8');
  const chrome = findChrome();

  staticChecks(src);
  syntaxCheck(src);

  const results = renderAll(chrome, src);

  console.log('\nrender');
  for(const r of results){
    if(r.error){ check(false, r.name, 'threw: ' + r.error); continue; }
    const underCap = r.canvasWidth <= MAX_SIDE && r.canvasHeight <= MAX_SIDE &&
                     r.canvasWidth * r.canvasHeight <= MAX_AREA;
    check(underCap, `${r.name}: canvas within the size cap`,
          `${r.canvasWidth}x${r.canvasHeight}`);

    // The renderer and the browser should agree on how tall the card is.
    // A few px of slack for half-leading and sub-pixel rounding; anything
    // larger means the two implementations have drifted apart.
    const drift = Math.abs(r.imageHeight - r.domHeight);
    check(drift <= 8, `${r.name}: image height agrees with the DOM`,
          `image ${r.imageHeight} vs dom ${r.domHeight} (${drift}px)`);
  }

  if(update){
    const baselines = {};
    for(const r of results) if(!r.error) baselines[r.name] = r.imageHeight;
    fs.writeFileSync(BASELINES, JSON.stringify(baselines, null, 2) + '\n');
    console.log(`\nwrote ${path.relative(ROOT, BASELINES)}`);
  } else if(fs.existsSync(BASELINES)){
    /* Exact heights, which catch changes the DOM comparison is too loose to
       see. Font metrics differ between operating systems, so these are only
       meaningful on the machine that generated them - rerun with --update
       after an intentional design change, or when moving machines. */
    console.log('\nbaselines');
    const baselines = JSON.parse(fs.readFileSync(BASELINES, 'utf8'));
    for(const r of results){
      if(r.error) continue;
      const want = baselines[r.name];
      if(want === undefined){ note(`--    ${r.name}: no baseline yet`); continue; }
      check(r.imageHeight === want, `${r.name}: image height unchanged`,
            r.imageHeight === want ? `${want}px` : `expected ${want}, got ${r.imageHeight}`);
    }
  } else {
    console.log('\nNo baselines yet. Run: node test/run.js --update');
  }

  console.log(fail.length ? `\n${fail.length} failed\n` : '\nall passed\n');
  process.exit(fail.length ? 1 : 0);
}

main();
