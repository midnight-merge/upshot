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
const CARD = path.join(ROOT, 'v1', 'index.html');
const LANDING = path.join(ROOT, 'index.html');
const BROKEN = path.join(ROOT, 'broken', 'index.html');
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

/* The evaluator is the first thing here that is right or wrong on its own
   terms rather than by how tall it draws - and a wrong formula fails silently,
   which makes this the cheapest test in the file and probably the most
   valuable. It runs inside the page because that is where evaluate() lives;
   the alternative is loading a script that expects a document. */
const EXPRS = [
  ['1+2*3',           {},           7],
  ['(1+2)*3',         {},           9],
  ['10/4',            {},           2.5],
  ['-4+1',            {},           -3],
  ['2*-3',            {},           -6],
  ['a+b',             {a: 2, b: 3}, 5],
  // a leading + is allowed to mean nothing, so arithmetic a model might
  // reasonably write does not cost a card its number
  ['a++b',            {a: 2, b: 3}, 5],
  ['+5',              {},           5],
  ['2*+3',            {},           6],
  ['round(10/3,2)',   {},           3.33],
  ['round(10/3)',     {},           3],
  ['min(3,9)+max(1,2)', {},         5],
  ['pow(2,10)',       {},           1024],
  ['sqrt(16)',        {},           4],
  ['a>b?1:2',         {a: 5, b: 1}, 1],
  ['a>b?1:2',         {a: 0, b: 1}, 2],
  ['a>=b?a:b',        {a: 3, b: 7}, 7],

  // everything below must come back as null, and draw as a dash
  ['1/0',             {},           null],
  ['sqrt(0-1)',       {},           null],
  ['missing+1',       {a: 1},       null],
  ['1+',              {},           null],
  ['(1+2',            {},           null],
  ['1 2',             {},           null],
  ['',                {},           null],
  // the whole reason this is a parser and not eval()
  ['alert(1)',        {},           null],
  ['constructor',     {},           null],
  ['toString',        {},           null],
  ['__proto__',       {},           null],
  ['a.b',             {a: 1},       null]
];

const NUMS = [
  [240000,   '240,000'],
  [1234567,  '1,234,567'],
  [0,        '0'],
  [10.5,     '10.5'],
  [3.333,    '3.33'],
  [-4200.5,  '-4,200.5'],
  [null,     '\u2014']
];

const CASES = [
  // the frame on its own, and one block of each kind
  ['bare',       `#h=Just a headline and a verdict&v=No blocks at all&m=GPT-5&d=2026-09-08`],
  ['bullets',    `#m=GPT-5&d=2026-09-08&a=Short one&h=A short headline&v=One sentence verdict&p=First point&p=Second point`],
  ['steps',      `#m=GPT-5&d=2026-09-08&a=Moving off the CDN build&h=Vendoring the library&v=About an hour, no downtime needed&o=Vendor the library into the repo&o=Swap the script tag for a local path&o=${POINT}&o=Drop the CSP exception`],
  ['checks',     `#m=GPT-5&d=2026-09-08&a=Before the launch&h=What is left to do&v=Two of these block the release&c=Vendor the library into the repo&c=Swap the script tag for a local path&c=Drop the CSP exception&c=${POINT}`],
  ['checksTicked', `#m=GPT-5&d=2026-09-08&h=Half done&v=Progress&c=First item&c=Second item&c=Third item&k=101`],
  ['facts',      `#m=Claude Opus 5&d=2026-09-08&a=What the new service costs&h=Runtime and cost&v=Cheaper at every tier we measured&f=Runtime~Node 20&f=Cold start~180ms&f=Cost~$0.40 per million requests&f=Region~eu-west-2&f=A very long label that will wrap~and a value long enough to push it onto another line`],
  ['stats',      `#m=GPT-5&d=2026-09-08&a=What the migration bought us&h=What the migration cost&v=Worth it, but not for the reasons we expected&n=42%~fewer timeouts&n=3.1x~faster cold start&n=6 wks~of engineer time`],

  ['inputs',     `#m=GPT-5&d=2026-09-08&a=What four more seats would cost&h=Four seats fit&v=Change the numbers and the card follows&g=Your numbers&i=s~Seats~4&i=p~Price per seat~18&g=What it costs&r=m~~s*p&r=~Per month~m&r=~Per year~m*12`],
  // the same card as someone else left it: w= is what they typed
  ['inputsWritten', `#h=Passed on half-filled&v=The numbers came with the link&i=s~Seats~4&i=p~Price~18&r=~Per year~s*p*12&w=10~25`],
  ['inputsBare', `#h=An input with no default&v=Empty reads as zero&i=n~How many&r=~Doubled~n*2`],
  ['results',    `#m=GPT-5&d=2026-09-08&a=What the new seats will cost&h=Adding four seats&v=Under the quarter budget, with room to spare&g=What it costs&r=y~~4*12&r=~Per year~y*18&r=~Per seat~18*12&r=~Spare~9000-y*18`],
  // an unlabelled row is a working step: it feeds the rows below and is not
  // drawn, so this card must come out exactly as tall as one with two rows
  ['resultsHidden', `#h=One row, one hidden step&v=The step is not drawn&r=n~~12*3&r=~Total~n*5&r=~Half~n*5/2`],
  ['resultsBroken', `#h=Broken formulas&v=Every one of these draws a dash&g=Nothing computable&r=~Divided by zero~1/0&r=~Unknown name~nope*2&r=~Not a formula~1+&r=~Not code~alert(1)`],
  // a model that writes "2 + 3" instead of 2%2B3 is the common slip, and the
  // restored form has to be right in both places: the arithmetic and the
  // formula printed under it, which is the whole point of printing it
  ['resultsSpaced', `#h=Formulas written with spaces&v=Both halves have to survive it&r=~Sum~2 + 3&r=~Rate~(1000 + 250) * 4%2E5&r=~Rounded~round(10 / 3, 2)`],
  ['resultsWrap',  `#h=A result that wraps&v=Long labels and long formulas still measure&r=base~~1000&r=~A label long enough that the row has to wrap onto a second line~base*3+base/7-base*0.5`],

  // composition: labels, several blocks, the cap
  ['labelled',   `#m=GPT-5&d=2026-09-08&h=One labelled block&v=The label sits above it&g=What changed&p=First point&p=Second point`],
  ['comparison', `#m=Claude Opus 5&d=2026-09-08&a=Picking a database&h=Postgres or SQLite&v=Postgres, unless you are shipping to the edge&g=Postgres&p=Concurrent writes without a global lock&p=Real types, extensions, a planner worth trusting&g=SQLite&p=Zero ops - it is one file on disk&p=Faster for read-heavy work at small scale`],
  ['threeBlocks', `#m=GPT-5&d=2026-09-08&a=Everything at once&h=Three blocks stacked&v=The maximum the card allows&g=The numbers&n=42%~fewer timeouts&n=3.1x~faster cold start&g=What changed&p=The renderer draws the card itself now&p=Nothing is fetched from a third party&g=Still to do&c=Check it on a real phone&c=Merge the branch`],
  ['overCap',    `#h=Four blocks, one dropped&v=Only the first three render&g=One&p=a&p=b&g=Two&o=c&o=d&g=Three&f=e~f&g=Four&n=9~should not appear`],
  ['mixedNoLabels', `#h=Blocks without labels&v=Still stack in order&p=A bullet&f=Key~Value&n=7~things`],

  // shapes of failure. A fragment with nothing renderable in it is not here:
  // /v1/ redirects it to /broken/ rather than drawing a card that says it is
  // not a card, and a redirect is checked statically below.
  ['unknownKey', `#s=explainer&m=GPT-5&d=2026-09-08&h=An unknown key&v=s= is not in the grammar, so parse() drops it and the card renders&p=Anything not in the grammar is ignored, never fatal`],
  ['longtoken',  `#h=${'A'.repeat(120)}&v=ok&p=fine`],
  ['bareFacts',  `#h=Rows with no value&v=Should not break&f=Just a label&f=Another~with a value`],
  ['absurd',     `#h=Tall&v=v${`&p=${WORDY}`.repeat(9)}`],
  ['gigantic',   `#h=Tall&v=v${`&p=${WORDY}`.repeat(40)}`]
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

  // The card ships no copy of its own. This is the whole reason the site is
  // three documents: a card link that carries the landing page with it lays
  // out a tall page and then shrinks it, and on iOS that page comes up
  // scrolled with its header behind the browser chrome.
  check(/<main id="main"><\/main>/.test(raw), '/v1/ ships an empty <main>',
        'copy here means a card link lays out a tall page and then shrinks it');

  // The two actions are icons, so the glyph is the only thing naming them on
  // screen. Without these they are two unlabelled squares to a screen reader.
  for(const id of ['copyBtn', 'shareBtn']){
    const btn = new RegExp(`id="${id}"[^>]*`).exec(src);
    check(btn && /aria-label="/.test(btn[0]) && /title="/.test(btn[0]),
          `${id} carries a title and an aria-label`,
          'an icon-only control has no accessible name of its own');
  }
}

/* ---- the other two documents ---- */
function siblingChecks(){
  console.log('\nlanding + broken');
  const landing = fs.readFileSync(LANDING, 'utf8');
  const brokenPage = fs.readFileSync(BROKEN, 'utf8');

  // A fragment never reaches GitHub Pages, so nothing but the page itself can
  // send an unversioned link to the card. Head script, ahead of <body>, or the
  // landing copy lays out first for a reader who is on their way to a card.
  check(/location\.replace\(['"]\/v1\/['"]\s*\+\s*location\.hash\)/.test(landing),
        'the landing page forwards unversioned #links to /v1/');
  check(landing.indexOf('<script>') < landing.indexOf('<body'),
        'that redirect is in the head, ahead of the landing copy');

  // The spec itself stays static: fetchers do not run JS, and a spec built by
  // JS would be invisible to the thing it exists for. Matching on the
  // renderer's identifiers is no good here - the page teaches the format, so
  // its prose says "BLOCKS" and "p=". Match on the shape: that one script, and
  // no function declared anywhere.
  check((landing.match(/<script/g) || []).length === 1 && !/\bfunction\b/.test(landing),
        'the landing page carries nothing but that redirect',
        'it is the document AIs fetch - the spec may not depend on JS');
  check(/upshot\.fyi\/v1\/#a=ASK/.test(landing),
        'the landing page teaches the versioned URL');

  /* The spec exists twice - on the page and in /llms.txt - and most models
     only ever read the page. So the page is the authoritative one, and these
     check the copy in llms.txt has not drifted away from it. Encoding is
     where drift actually bites: a missing escape is a link that arrives
     broken, silently, in WhatsApp. */
  const llms = fs.readFileSync(path.join(ROOT, 'llms.txt'), 'utf8');
  const codes = t => [...new Set(t.match(/%[0-9A-F]{2}/g) || [])].sort().join(' ');
  const pageEscapes = codes(/Encode inside values:(.*)/.exec(landing)[1]);
  const llmsEscapes = codes(/Escape inside values:([\s\S]*?)\n- /.exec(llms)[1]);
  check(pageEscapes === llmsEscapes && pageEscapes.length > 0,
        'the page and llms.txt escape the same characters',
        pageEscapes === llmsEscapes ? pageEscapes : `page ${pageEscapes} vs llms ${llmsEscapes}`);

  // One real URL, byte-identical in both, that a model can copy the shape of.
  // Rules alone have never been enough here - see the WhatsApp findings in
  // VISION.md - and an example that has drifted from the grammar is worse
  // than none, so the render tests below cover this exact URL too.
  const example = /(https:\/\/upshot\.fyi\/v1\/#a=Whether[^\s<]*)/.exec(llms);
  check(!!example, 'llms.txt carries the worked example');
  if(example){
    check(landing.includes(example[1].replace(/&/g, '&amp;')),
          'the page carries the same worked example, byte for byte');
  }

  check(!/<script/.test(brokenPage), '/broken/ is static HTML');
  check(/Make your own/.test(brokenPage), '/broken/ still says how to make one');
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
   try {
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

    /* The formula is on the card so the number can be checked, which makes how
       it reads part of what it is for. Restoring + from a space produces
       "2+++3" before it is collapsed - correct arithmetic, and a formula that
       looks like a typo. */
    location.hash = '#h=x&v=y&r=~Sum~2 + 3&r=~Nested~(1 + 2) * 3' +
                    '&r=~Args~min(3, 9)&r=~Minus~10 - 4&r=~Tight~2+3';
    draw();
    out.push({
      name: 'formulaText',
      shown: [...document.querySelectorAll('.fx')].map(el => el.textContent),
      values: [...document.querySelectorAll('.calc .fv')].map(el => el.textContent)
    });

    /* Typing has to move three things at once: the results on the card, the
       w= in the link, and - because the link is the state - what a reader sees
       when the card is passed on and opened fresh. */
    location.hash = '#h=x&v=y&i=s~Seats~4&i=p~Price~18&r=m~~s*p&r=~Per year~m*12';
    draw();
    const shown = () => [...document.querySelectorAll('.calc .fv')].map(el => el.textContent).join(' ');
    const sent = shown();
    const boxes = [...document.querySelectorAll('.ins input')];
    boxes[0].value = '10';
    boxes[0].dispatchEvent(new Event('input'));
    const typed = shown();
    const written = (/w=([^&]*)/.exec(location.hash) || [, ''])[1];
    const passedOn = location.hash;
    location.hash = '#h=reset&v=reset';
    draw();
    location.hash = passedOn;
    draw();
    out.push({
      name: 'roundTrip', sent, typed, written, reopened: shown(),
      values: [...document.querySelectorAll('.ins input')].map(el => el.value).join(' ')
    });

    // the evaluator and the number formatter, checked directly
    out.push({
      name: 'expressions',
      // concatenated, not a template: this text is itself inside PROBE's
      // template literal, so a dollar-brace here would interpolate one level early
      bad: __EXPRS__.filter(([src, env, want]) => evaluate(src, env) !== want)
                    .map(([src, env, want]) => src + ' -> ' + evaluate(src, env) + ', wanted ' + want),
      badNums: __NUMS__.filter(([v, want]) => showNumber(v) !== want)
                       .map(([v, want]) => v + ' -> ' + showNumber(v) + ', wanted ' + want)
    });

    /* Confirming an action swaps the glyph inside a button the renderer never
       sees. If that swap changes the card's height, every share image taken
       during those two seconds is the wrong size - and nothing else here
       would notice, because layout() would still agree with itself. */
    const sheetH = () => Math.round(document.getElementById('sheet').getBoundingClientRect().height);
    const settled = sheetH();
    actionResult(document.getElementById('copyBtn'), true, 'Copied');
    const confirmed = sheetH();
    actionResult(document.getElementById('shareBtn'), false, 'Failed');
    const failed = sheetH();
    out.push({name: 'actionFeedback', settled, confirmed, failed,
              said: document.getElementById('said').textContent});
    report(out);
   } catch(e){
     report([{name: 'probe', error: String(e && e.stack || e)}]);
   }
  });
});

function report(out){
  const el = document.createElement('div');
  el.id = '__RESULT__';
  el.textContent = btoa(unescape(encodeURIComponent(JSON.stringify(out))));
  document.body.appendChild(el);
}
</script>
`;

function renderAll(chrome, src){
  const harness = path.join(os.tmpdir(), `upshot-harness-${process.pid}.html`);
  fs.writeFileSync(harness, src.replace('</body>',
    PROBE.replace('__CASES__', JSON.stringify(CASES))
         .replace('__EXPRS__', JSON.stringify(EXPRS))
         .replace('__NUMS__', JSON.stringify(NUMS)) + '</body>'));
  let dom;
  try {
    dom = execFileSync(chrome, [
      '--headless', '--disable-gpu', '--hide-scrollbars', '--no-sandbox',
      '--force-device-scale-factor=2',
      '--virtual-time-budget=20000',
      '--window-size=500,900',
      // draw() runs at parse time and sends an unrenderable link to /broken/,
      // which would navigate the harness away before the probe reports
      '--dump-dom', 'file://' + harness + '#h=harness&v=ready'
    ], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024});
  } finally { fs.unlinkSync(harness); }

  const m = /<div id="__RESULT__">([A-Za-z0-9+/=]*)<\/div>/.exec(dom);
  if(!m){
    console.error('The page produced no result. Did layout()/paint() throw before reporting?');
    process.exit(2);
  }
  return JSON.parse(decodeURIComponent(escape(Buffer.from(m[1], 'base64').toString('binary'))));
}

/* ---- 4. compare ---- */
function main(){
  const update = process.argv.includes('--update');
  const src = fs.readFileSync(CARD, 'utf8');
  const chrome = findChrome();

  staticChecks(src);
  siblingChecks();
  syntaxCheck(src);

  /* Render the worked example itself, taken from llms.txt rather than retyped
     here - it is the one URL the whole site tells models to copy, so an
     example that has quietly drifted out of the grammar is worse than no
     example at all. */
  const ex = /https:\/\/upshot\.fyi\/v1\/(#a=Whether[^\s<]*)/
    .exec(fs.readFileSync(path.join(ROOT, 'llms.txt'), 'utf8'));
  if(ex) CASES.push(['workedExample', ex[1]]);

  const results = renderAll(chrome, src);

  console.log('\nrender');
  for(const r of results){
    if(r.error){ check(false, r.name, 'threw: ' + r.error); continue; }
    if(r.name === 'roundTrip'){
      check(r.sent === '864', 'a card arrives showing the sender numbers', r.sent);
      check(r.typed === '2,160', 'typing recomputes the results', r.typed);
      check(r.written === '10~18', 'and writes what was typed into the link', r.written);
      check(r.reopened === '2,160' && r.values === '10 18',
            'so the link reopens as the reader left it',
            `${r.reopened} from ${r.values}`);
      continue;
    }
    if(r.name === 'formulaText'){
      check(r.shown.join(' ') === '2+3 (1+2)*3 min(3,9) 10-4 2+3',
            'a formula written with spaces prints back cleanly', r.shown.join(' '));
      check(r.values.join(' ') === '5 9 3 6 5',
            'and evaluates to the same thing either way', r.values.join(' '));
      continue;
    }
    if(r.name === 'expressions'){
      check(!r.bad.length, 'every expression evaluates as expected',
            r.bad.length ? r.bad.join('; ') : `${EXPRS.length} cases`);
      check(!r.badNums.length, 'numbers format the same on every machine',
            r.badNums.length ? r.badNums.join('; ') : `${NUMS.length} cases`);
      continue;
    }
    if(r.name === 'actionFeedback'){
      check(r.settled === r.confirmed && r.settled === r.failed,
            'the tick and the cross do not move the card',
            `${r.settled} settled, ${r.confirmed} confirmed, ${r.failed} failed`);
      check(!!r.said, 'the result is announced, not only drawn', r.said);
      continue;
    }
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
    for(const r of results) if(!r.error && r.imageHeight) baselines[r.name] = r.imageHeight;
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
      if(r.error || !r.imageHeight) continue;
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
