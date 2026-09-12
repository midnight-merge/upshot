#!/usr/bin/env node
/*
 * upshot regression tests - no dependencies, drives whatever Chrome is here.
 *
 *   node test/run.js
 *
 * v1 had to check that two implementations of the design agreed: the browser
 * laid the card out from CSS, and layout() re-derived it in canvas ops for the
 * share image. That is gone in v2 - the link is what gets shared - so these
 * check what the page actually renders instead, which is the same on every
 * machine. There are no baselines to keep any more.
 *
 * /v1/ is frozen. It is not tested here: nothing new is written against it,
 * and its renderer is the one this file stopped covering.
 */
const {execFileSync} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CARD = path.join(ROOT, 'v2', 'index.html');
const LANDING = path.join(ROOT, 'index.html');
const BROKEN = path.join(ROOT, 'broken', 'index.html');

const CHROME_CANDIDATES = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
].filter(Boolean);

const POINT = 'A key point with enough words in it that it will wrap to two or three lines inside the card body';
const WORDY = 'word '.repeat(90);

/* Cases carry what they should come out as. `blocks` is how many sections the
   card draws, `values` every figure in it in document order - which together
   pin down both the parse and the arithmetic. */
const CASES = [
  ['bare', `#h=Just a headline and a verdict&v=No blocks at all&m=GPT-5&d=2026-09-10`,
   {blocks: 0, values: []}],

  ['bullets', `#m=GPT-5&d=2026-09-10&a=Short one&h=A short headline&v=One sentence verdict&g=Why&p=First point&p=Second point`,
   {blocks: 1, values: []}],

  ['steps', `#m=GPT-5&d=2026-09-10&h=Vendoring the library&v=About an hour, no downtime&g=Steps&o=Vendor the library into the repo&o=Swap the script tag for a local path&o=${POINT}`,
   {blocks: 1, values: []}],

  ['checks', `#m=GPT-5&d=2026-09-10&h=What is left to do&v=Two of these block the release&g=Before launch&c=Vendor the library&c=Swap the script tag&c=${POINT}`,
   {blocks: 1, values: []}],

  ['checksTicked', `#m=GPT-5&d=2026-09-10&h=Half done&v=Progress&g=List&c=First item&c=Second item&c=Third item&k=101`,
   {blocks: 1, values: [], ticked: '101'}],

  // one or two rows are figures, three or more a spec sheet - the card picks,
  // which is the whole reason n= was cut
  ['rowsOne', `#m=GPT-5&d=2026-09-10&h=One number&v=That is the point&g=The saving&f=Off the monthly price:17%25`,
   {blocks: 1, values: ['17%'], stats: 1, facts: 0}],
  ['rowsThree', `#m=GPT-5&d=2026-09-10&h=Runtime and cost&v=Cheaper at every tier&g=After&f=Cold start:180ms&f=Bundle:42kb&f=Dependencies:0`,
   {blocks: 1, values: ['180ms', '42kb', '0'], stats: 0, facts: 3}],

  // a block holds whatever mix it needs - inputs and their results together,
  // which in v1 would have cost two of the three slots
  ['calculator', `#m=GPT-5&d=2026-09-10&h=About twenty seven each&v=Service is in the total&g=Split it&i=Bill:80:bill&i=People:3:n&r=Each pays:bill/n`,
   {blocks: 1, values: ['26.67']}],

  ['twoStage', `#m=GPT-5&d=2026-09-10&h=Work backward&v=Costs come off first&g=Exit&i=After repair value:450000:arv&i=Selling cost percent:7:sell&r=Selling costs:arv%2A%28sell/100%29:exit&g=Offer&i=Renovation:70000:reno&r=Maximum offer:arv-exit-reno`,
   {blocks: 2, values: ['31,500', '348,500']}],

  // a step with no label feeds the rows below and is not drawn
  ['hiddenStep', `#h=One row, one hidden step&v=The step is not drawn&g=Sums&r=:12*3:n&r=Total:n*5`,
   {blocks: 1, values: ['180']}],

  ['brokenFormulas', `#h=Broken formulas&v=Every one draws a dash&g=Nothing computable&r=Divided by zero:1/0&r=Unknown name:nope*2&r=Not a formula:1+`,
   {blocks: 1, values: ['—', '—', '—']}],

  // a model that writes "2 + 3" instead of 2%2B3 is the common slip
  ['spacedFormulas', `#h=Formulas with spaces&v=Both halves survive&g=Sums&r=Sum:2 + 3&r=Rate:(1000 + 250) * 4%2E5`,
   {blocks: 1, values: ['5', '5,625']}],

  /* The same slip against a bracket, which is the one place stripping the gap
     is wrong: a bracket is not an operator, so "(a)+b" arriving as "(a) b"
     has to come back a sum rather than a call. "round (a)" is the other side
     of it - a name we know, written loosely, and still a call. */
  ['bracketedPlus', `#h=Plus against a bracket&v=The gap is an operand boundary&g=Sums&i=A:10:a&i=B:4:b&r=Outside:(a)+b&r=Between calls:round(a)+round(b)&r=Both sides:(a+b)+(b+1)&r=Called loosely:round (a)+b`,
   {blocks: 1, values: ['14', '14', '19', '14']}],

  // a condition gets the same repair as a formula
  ['bracketedPlusDecision', `#h=Plus in a condition&v=Same repair as a result&g=Runway&i=A:10:a&i=B:4:b&t=Over twelve:(a)+b>12:Yes:No`,
   {blocks: 1, values: ['Yes']}],

  // the decision key: same row, wording the card chose
  ['decisionTrue', `#h=Enough runway&v=Nine months is the number&g=Runway&i=Cash:18000:cash&i=Burn:1000:burn&i=Target:9:target&r=Runway:cash/burn:months&t=Ready to walk:months>=target:Go now:Not yet`,
   {blocks: 1, values: ['18', 'Go now']}],
  ['decisionFalse', `#h=Not yet&v=Nine months is the number&g=Runway&i=Cash:18000:cash&i=Burn:2200:burn&i=Target:9:target&r=Runway:cash/burn:months&t=Ready to walk:months>=target:Go now:Not yet`,
   {blocks: 1, values: ['8.18', 'Not yet']}],

  /* A model that writes + where & was needed leaves the next key inside the
     label before it, and every formula downstream of the lost key dies. The
     card recovers it, so this has to come out identical to 'calculator'. */
  ['swallowedKey', `#m=GPT-5&d=2026-09-10&h=About twenty seven each&v=Service is in the total&g=Split it+i=Bill:80:bill&i=People:3:n&r=Each pays:bill/n`,
   {blocks: 1, values: ['26.67'], label: 'Split it'}],

  /* A condition that cannot be worked out is not a condition that came out
     false. If it drew the false branch, a card whose numbers are all dashes
     would still print a verdict, and that is the one failure this format must
     never have: confident, wrong, and indistinguishable from working. */
  ['decisionUnanswerable', `#h=Nothing computable&v=The verdict must not fall through&g=Runway&r=Broken:nope*2:regret&t=Verdict:regret<35:Go now:Stay home`,
   {blocks: 1, values: ['\u2014', '\u2014']}],

  /* A number smaller than the two places we round to is not zero. Printed as
     one it makes correct working read as nonsense - the LC card computed
     10,000 and showed it as 1/sqrt(0.01*0), which is a proof of the opposite. */
  ['smallNumbers', `#h=Small numbers stay honest&v=Below a hundredth, three significant figures&g=Resonance&i=Inductance:0.01:l&i=Capacitance:0.000001:c&r=Angular:1/sqrt(l*c):w&r=Tiny:c/1000`,
   {blocks: 1, values: ['10,000', '1e-9']}],

  // a box can carry a name a formula reads as 1 or 0
  ['namedBoxes', `#h=Named boxes&v=A box can be referred to by name&g=Your ticket&i=Full fare:84:fare&c=You have a railcard:card&c=Travelling off peak:offpeak&r=Discount:card*0.34+offpeak*0.1:cut&r=You pay:fare-fare*cut&k=11`,
   {blocks: 1, values: ['0.44', '47.04'], ticked: '11'}],
  ['namedBoxesOff', `#h=Named boxes&v=A box can be referred to by name&g=Your ticket&i=Full fare:84:fare&c=You have a railcard:card&c=Travelling off peak:offpeak&r=Discount:card*0.34+offpeak*0.1:cut&r=You pay:fare-fare*cut`,
   {blocks: 1, values: ['0', '84']}],
  /* A trailing single word is a name; anything with a space in it is still
     part of the label. "Be there by 9:30" has to stay a time, and
     "Bring ID: passport" has to stay prose. */
  ['colonInLabel', `#h=Colons in a label&v=Only a bare trailing word is a name&g=List&c=Be there by 9:30&c=Bring ID: passport&c=A named one:flag&r=Named:flag&k=111`,
   {blocks: 1, values: ['1'], ticked: '111'}],

  // ticks and boxes: the checklist as two numbers a formula can use
  ['scoredEmpty', `#h=How exposed are you&v=Tick what applies&g=How many apply&c=A mortgage&c=Dependants&c=Higher earner&c=Self employed&r=Score:ticks/boxes*100:pct&t=Verdict:ticks>=2:Get cover:Probably fine`,
   {blocks: 1, values: ['0', 'Probably fine']}],
  ['scoredTicked', `#h=How exposed are you&v=Tick what applies&g=How many apply&c=A mortgage&c=Dependants&c=Higher earner&c=Self employed&r=Score:ticks/boxes*100:pct&t=Verdict:ticks>=2:Get cover:Probably fine&k=1101`,
   {blocks: 1, values: ['75', 'Get cover'], ticked: '1101'}],
  // an input may not quietly redefine what the spec says the word means
  ['reservedName', `#h=Reserved&v=The built-in wins&g=x&i=Ticks:99:ticks&c=One&c=Two&r=Count:ticks`,
   {blocks: 1, values: ['0']}],

  // composition and the cap
  ['comparison', `#m=GPT-5&d=2026-09-10&h=Postgres or SQLite&v=Postgres, unless you ship to the edge&g=Postgres&p=Concurrent writes&p=Real types&g=SQLite&p=Zero ops&p=Faster for reads`,
   {blocks: 2, values: []}],
  ['threeBlocks', `#h=Three blocks stacked&v=The maximum the card allows&g=One&p=a&p=b&g=Two&o=c&o=d&g=Three&c=e&c=f`,
   {blocks: 3, values: []}],
  ['overCap', `#h=Four blocks, one dropped&v=Only the first three render&g=One&p=a&g=Two&o=b&g=Three&f=e:f&g=Four&p=should not appear`,
   {blocks: 3, values: ['f']}],
  ['everyKind', `#h=One block holding every kind&v=Only a g= starts a block&g=All of it&p=A bullet&o=A step&c=A tick&f=Key:Value&i=Salary:62000:pay&r=Monthly:pay/12`,
   // the lone f= here is a row, not a headline figure: it shares the block
   {blocks: 1, values: ['Value', '5,166.67'], stats: 0, facts: 2}],

  // shapes of failure
  ['unknownKey', `#s=explainer&h=An unknown key&v=s= is not in the grammar&g=Why&p=Anything not in the grammar is ignored`,
   {blocks: 1, values: []}],
  ['longtoken', `#h=${'A'.repeat(120)}&v=ok&g=x&p=fine`, {blocks: 1, values: []}],
  ['absurd', `#h=Tall&v=v&g=Many${`&p=${WORDY}`.repeat(9)}`, {blocks: 1, values: []}]
];

/* evaluate() and showNumber(), checked directly rather than through a card */
const EXPRS = [
  ['2+3', {}, 5],
  ['2 + 3', {}, 5],
  ['(1+2)*3', {}, 9],
  ['10-4', {}, 6],
  ['min(3,9)', {}, 3],
  ['round(10/3)', {}, 3],
  ['a*b', {a: 4, b: 18}, 72],
  ['a>b', {a: 4, b: 18}, 0],
  ['a<=b', {a: 4, b: 18}, 1],
  ['1/0', {}, null],
  ['nope*2', {}, null],
  ['1+', {}, null],
  ['alert(1)', {}, null]
];

const NUMS = [
  [1234.5, '1,234.5'],
  [1234.567, '1,234.57'],
  [180, '180'],
  [0, '0'],
  [-2.5, '-2.5'],
  [null, '—']
];

const fail = [];
const note = m => console.log('  ' + m);
const check = (ok, label, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
  if(!ok) fail.push(label);
};

function findChrome(){
  for(const p of CHROME_CANDIDATES) if(fs.existsSync(p)) return p;
  return null;
}

/* ---- 1. properties of the document itself ---- */
function staticChecks(raw){
  console.log('\nstatic');
  // Comments name the very patterns being banned, so strip them before
  // matching or the docs fail the tests.
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  check(!/<script[^>]+src=/i.test(src), 'no external script tags',
        'the page must fetch nothing from a third party');
  check(!/@import|url\(\s*['"]?https?:/i.test(src), 'no external stylesheets or url() fetches');
  check(!/min-height\s*:\s*[^;]*\b\d+vh/i.test(src), 'no vh units',
        'on iOS 100vh is the large viewport and scrolls every page');

  // The card ships no copy of its own. This is the whole reason the site is
  // three documents: a card link that carries the landing page with it lays
  // out a tall page and then shrinks it, and on iOS that page comes up
  // scrolled with its header behind the browser chrome.
  check(/<main id="main"><\/main>/.test(raw), '/v2/ ships an empty <main>',
        'copy here means a card link lays out a tall page and then shrinks it');

  // The two actions are icons, so the glyph is the only thing naming them on
  // screen. Without these they are two unlabelled squares to a screen reader.
  for(const id of ['copyBtn', 'shareBtn']){
    const btn = new RegExp(`id="${id}"[^>]*`).exec(src);
    check(btn && /aria-label="/.test(btn[0]) && /title="/.test(btn[0]),
          `${id} carries a title and an aria-label`,
          'an icon-only control has no accessible name of its own');
  }

  // The share button hands over the URL. Anything that draws the card into a
  // canvas is the v1 path coming back, and it cannot survive mixed blocks.
  check(!/canvas|toBlob/i.test(src), 'nothing draws the card into a canvas',
        'the link is what gets shared - there is no second implementation');
  check(/navigator\.share/.test(src), 'the share button opens the native sheet');

  // the mark is the way back to the site from someone else's card, and every
  // other document here does the same
  check(/<a class="brand mark" href="\/">/.test(src), 'the card mark links home');
}

/* ---- 2. the other two documents ---- */
function siblingChecks(){
  console.log('\nlanding + broken');
  const landing = fs.readFileSync(LANDING, 'utf8');
  const brokenPage = fs.readFileSync(BROKEN, 'utf8');
  const llms = fs.readFileSync(path.join(ROOT, 'llms.txt'), 'utf8');

  // A fragment never reaches GitHub Pages, so nothing but the page itself can
  // send an unversioned link to the card. Head script, ahead of <body>, or the
  // landing copy lays out first for a reader on their way to a card.
  check(/location\.replace\(['"]\/v2\/['"]\s*\+\s*location\.hash\)/.test(landing),
        'the landing page forwards unversioned #links to /v2/');
  check(landing.indexOf('<script>') < landing.indexOf('<body'),
        'that redirect is in the head, ahead of the landing copy');

  // The spec stays static: fetchers do not run JS, and a spec built by JS
  // would be invisible to the thing it exists for.
  check((landing.match(/<script/g) || []).length === 1 && !/\bfunction\b/.test(landing),
        'the landing page carries nothing but that redirect',
        'it is the document AIs fetch - the spec may not depend on JS');

  /* The spec exists twice - on the page and in /llms.txt - and most models
     only ever read one of them. Every worked example has to appear in both,
     byte for byte: an example that has drifted is worse than none, because a
     model copies the example and skims the rule. */
  const examples = llms.match(/https:\/\/upshot\.fyi\/v2\/#\S+/g) || [];
  check(examples.length >= 5, 'llms.txt carries the worked examples',
        `${examples.length} of them`);
  const missing = examples.filter(e => !landing.includes(e.replace(/&/g, '&amp;')));
  check(missing.length === 0, 'the page carries every one of them, byte for byte',
        missing.length ? missing[0].slice(0, 60) + '...' : '');

  /* An example that contradicts the encoding rule teaches louder than the
     rule does, so no example may carry a character the rule bans. This went
     field-aware for a day, when the spec let a formula write `*` plainly. It
     should not have: a chat UI reads a pair of bare `*` as emphasis and eats
     them, so `j*45` arrives as `j45` and the formula is quietly a different
     one. Encoded everywhere, wording and formula alike. */
  const bare = examples.filter(e => /[~*]/.test(e.split('#')[1] || ''));
  check(bare.length === 0, 'no example carries a bare ~ or *',
        bare.length ? bare[0].slice(0, 60) + '...' : '');

  /* The harder rule, and the one that actually loses cards: a character that is
     not legal in a URL at all. A chat client ends the link at the first one, so
     the reader gets half a card - and the half that survives still renders,
     which is why nobody notices. `>` is the one that bit us: the spec used to
     say write `<` and `>` as they are, and a `t=` condition is the one place a
     model reaches for them. Encoded, they are fine. */
  const ILLEGAL = /[ "<>{}|\\^`]/;
  const unsendable = examples
    .map(e => ({e, m: ILLEGAL.exec(e)}))
    .filter(x => x.m);
  check(unsendable.length === 0,
        'no example carries a character that ends the link early',
        unsendable.length
          ? `${JSON.stringify(unsendable[0].m[0])} at ${unsendable[0].m.index} of ${unsendable[0].e.slice(0, 40)}...`
          : '');

  /* Every og:image has to exist and has to be this page's own. A document that
     borrows another's plate unfurls under someone else's headline, which is
     how /made/ spent a day promising "make the tiny tool you wish existed".
     A page may carry no image at all - /broken/ does - but it may not point at
     one that is missing, and no two pages may share. */
  const PAGES = [
    ['index.html', landing], ['v2/index.html', fs.readFileSync(CARD, 'utf8')],
    ['made/index.html', fs.readFileSync(path.join(ROOT, 'made', 'index.html'), 'utf8')],
    ['broken/index.html', brokenPage]
  ];
  const claimed = new Map();
  let ogTrouble = [];
  PAGES.forEach(([name, html]) => {
    const m = /<meta property="og:image" content="https:\/\/upshot\.fyi\/([^"]+)"/.exec(html);
    if(!m){
      // no image is allowed, but then there must be no large-image card either
      if(/twitter:card" content="summary_large_image"/.test(html))
        ogTrouble.push(`${name} asks for a large image card and names no image`);
      return;
    }
    const file = path.join(ROOT, m[1]);
    if(!fs.existsSync(file)) ogTrouble.push(`${name} points at ${m[1]}, which is not in the repo`);
    if(claimed.has(m[1])) ogTrouble.push(`${name} shares ${m[1]} with ${claimed.get(m[1])}`);
    claimed.set(m[1], name);
    if(!/<meta property="og:image:alt"/.test(html))
      ogTrouble.push(`${name} names an image with no alt text`);
  });
  check(ogTrouble.length === 0, 'every page has its own preview image, and it exists',
        ogTrouble.join('; '));

  // Both documents must escape the same set, or a link written from one of
  // them arrives broken in WhatsApp and the other never sees why.
  const codes = t => [...new Set(t.match(/%[0-9A-F]{2}/g) || [])].sort().join(' ');
  const section = (t, from, to) => (t.split(from)[1] || '').split(to)[0];
  const pageEscapes = codes(section(landing, 'ENCODING', 'BEFORE YOU REPLY'));
  const llmsEscapes = codes(section(llms, '## Encoding', '## Before you reply'));
  check(pageEscapes === llmsEscapes && pageEscapes.length > 0,
        'the page and llms.txt escape the same characters',
        pageEscapes === llmsEscapes ? pageEscapes : `page ${pageEscapes} vs llms ${llmsEscapes}`);

  // Every key the card renders has to be taught, or it may as well not exist.
  const card = fs.readFileSync(CARD, 'utf8');
  const keys = /var BLOCK_KEYS = \[([^\]]*)\]/.exec(card);
  check(!!keys, 'the card declares its block keys');
  if(keys){
    const declared = keys[1].match(/'([a-z])'/g).map(s => s.replace(/'/g, ''));
    const untaught = declared.filter(k => !new RegExp(`^- ${k}  `, 'm').test(llms));
    check(untaught.length === 0, 'llms.txt documents every block key',
          untaught.length ? 'missing ' + untaught.join(' ') : declared.join(' '));
  }

  check(!/<script/.test(brokenPage), '/broken/ is static HTML');
  check(/Make your own/.test(brokenPage), '/broken/ still says how to make one');
}

/* ---- 3. the page's own JavaScript parses ---- */
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

/* ---- 4. render every case in a real browser ---- */
const PROBE = `
<script>
addEventListener('load', () => {
  document.fonts.ready.then(() => {
   try {
    const text = sel => [...document.querySelectorAll(sel)].map(el => el.textContent);
    const out = __CASES__.map(([name, hash]) => {
      try {
        location.hash = hash;
        draw();
        return {
          name,
          blocks: document.querySelectorAll('#main section.block').length,
          // every figure the card drew, in document order: the spec-sheet and
          // headline registers both, since which one is used is the card's
          // choice and worth pinning
          values: text('#main .fv').concat(text('#main .sv')),
          facts: document.querySelectorAll('#main .facts .fact').length,
          stats: document.querySelectorAll('#main .stat').length,
          label: (document.querySelector('#main .bl') || {}).textContent || '',
          ticked: [...document.querySelectorAll('.checks input')]
                    .map(b => b.checked ? '1' : '0').join('')
        };
      } catch(e){
        return {name, error: e && e.message ? e.message : String(e)};
      }
    });

    /* The formula is on the card so the number can be checked, which makes how
       it reads part of what it is for. Restoring + from a space produces
       "2+++3" before it is collapsed - correct arithmetic, and a formula that
       looks like a typo. */
    location.hash = '#h=x&v=y&g=s&r=Sum:2 + 3&r=Nested:(1 + 2) * 3&r=Args:min(3, 9)&r=Minus:10 - 4';
    draw();
    out.push({name: 'formulaText', shown: text('#main .fx')});

    /* Typing has to move three things at once: the results on the card, the
       w= in the link, and - because the link is the state - what a reader sees
       when the card is passed on and opened fresh. */
    location.hash = '#h=x&v=y&g=n&i=Seats:4:s&i=Price:18:p&r=Monthly:s*p:m&r=Per year:m*12';
    draw();
    const shown = () => text('#main .fv').join(' ');
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
    out.push({name: 'roundTrip', sent, typed, written, reopened: shown(),
              values: [...document.querySelectorAll('.ins input')].map(el => el.value).join(' ')});

    /* A decision is recomputed by the same numbers a result is, and both are
       repainted in place rather than redrawn - so the card can tell the reader
       two different stories about one set of inputs if only one is updated. */
    location.hash = '#h=x&v=y&g=Runway&i=Cash saved:18000:cash&i=Monthly burn:2200:burn' +
                    '&i=Months you want:9:target&r=Runway:cash/burn:months' +
                    '&t=Ready to walk:months>=target:Go now:Not yet';
    draw();
    const card = () => text('#main .fv').concat(text('#main .fx'));
    const target = () => [...document.querySelectorAll('.ins input')][2];
    const setTarget = v => { const el = target(); el.value = v; el.dispatchEvent(new Event('input')); };
    const live = {before: card()};
    setTarget('8');
    live.crossed = card();
    live.link = (/w=([^&]*)/.exec(location.hash) || [, ''])[1];
    live.copied = copyText(parse(location.hash));
    setTarget('9');
    live.back = card();
    out.push({name: 'decisionLive', ...live});

    // ticking rewrites the fragment the same way typing does - and now moves
    // the same numbers, so it has to repaint the same rows
    location.hash = '#h=x&v=y&g=l&c=One&c=Two&c=Three&c=Four' +
                    '&r=Score:ticks/boxes*100:pct&t=Verdict:ticks>=2:Get cover:Probably fine';
    draw();
    const ticks = [...document.querySelectorAll('.checks input')];
    const tickState = () => text('#main .fv').concat(text('#main .fx'));
    const tick = i => { ticks[i].checked = !ticks[i].checked; ticks[i].dispatchEvent(new Event('change')); };
    const ticked = {empty: tickState()};
    tick(0); tick(1);
    ticked.two = tickState();
    ticked.written = (/k=([^&]*)/.exec(location.hash) || [, ''])[1];
    ticked.copied = copyText(parse(location.hash));
    tick(1);
    ticked.back = tickState();
    out.push({name: 'tickRoundTrip', ...ticked});

    // a named box moves its formula the moment it is ticked, and the name
    // never appears on the card
    location.hash = '#h=x&v=y&g=t&i=Full fare:84:fare&c=You have a railcard:card' +
                    '&c=Be there by 9:30&r=You pay:fare-fare*card*0.34';
    draw();
    const named = {labels: text('.checks span'), before: text('#main .fv')};
    const box = [...document.querySelectorAll('.checks input')][0];
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    named.after = text('#main .fv');
    out.push({name: 'namedLive', ...named});

    // the evaluator and the number formatter, checked directly
    out.push({
      name: 'expressions',
      bad: __EXPRS__.filter(([src, env, want]) => evaluate(src, env) !== want)
                    .map(([src, env, want]) => src + ' -> ' + evaluate(src, env) + ', wanted ' + want),
      badNums: __NUMS__.filter(([v, want]) => showNumber(v) !== want)
                       .map(([v, want]) => v + ' -> ' + showNumber(v) + ', wanted ' + want)
    });

    // copy-for-AI is the other way off the card, and it has its own view of
    // every block - a key added to the renderer alone copies out as raw text
    location.hash = '#h=x&v=y&m=GPT-5&d=2026-09-10&g=All&f=Key:Value&i=Salary:1200:pay&r=Monthly:pay/12:mo&t=Verdict:mo>50:Fine:Tight&c=A tick';
    draw();
    out.push({name: 'copyForAI', text: copyText(parse(location.hash))});

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
    PROBE.replace('__CASES__', JSON.stringify(CASES.map(c => [c[0], c[1]])))
         .replace('__EXPRS__', JSON.stringify(EXPRS))
         .replace('__NUMS__', JSON.stringify(NUMS)) + '</body>'));
  let dom;
  try {
    dom = execFileSync(chrome, [
      '--headless', '--disable-gpu', '--hide-scrollbars', '--no-sandbox',
      '--virtual-time-budget=20000',
      '--window-size=500,900',
      // draw() runs at parse time and would send an unrenderable link to
      // /broken/, navigating the harness away before the probe reports
      '--dump-dom', 'file://' + harness + '#h=harness&v=ready'
    ], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024});
  } finally {
    fs.unlinkSync(harness);
  }
  const payload = /<div id="__RESULT__">([^<]*)<\/div>/.exec(dom);
  if(!payload) throw new Error('the probe never reported - the page may have thrown at load');
  return JSON.parse(Buffer.from(payload[1], 'base64').toString('utf8'));
}

function main(){
  const chrome = findChrome();
  const src = fs.readFileSync(CARD, 'utf8');

  staticChecks(src);
  siblingChecks();
  syntaxCheck(src);

  if(!chrome){
    console.log('\nno Chrome found - set CHROME=/path/to/chrome for the render tests');
    process.exit(fail.length ? 1 : 0);
  }

  console.log('\nrender');
  const results = renderAll(chrome, src);
  const byName = Object.fromEntries(results.map(r => [r.name, r]));

  for(const [name, , want] of CASES){
    const got = byName[name];
    if(!got){ check(false, name, 'no result'); continue; }
    if(got.error){ check(false, name, got.error); continue; }
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    let ok = got.blocks === want.blocks && same(got.values, want.values);
    let detail = `${got.blocks} block(s)` + (got.values.length ? '  ' + got.values.join(' ') : '');
    for(const k of ['facts', 'stats', 'label', 'ticked']){
      if(want[k] === undefined) continue;
      if(got[k] !== want[k]){ ok = false; detail += `  ${k}=${got[k]} wanted ${want[k]}`; }
    }
    if(!ok && got.blocks !== want.blocks) detail += `  wanted ${want.blocks} block(s)`;
    if(!ok && !same(got.values, want.values)) detail += `  wanted ${want.values.join(' ') || 'no values'}`;
    check(ok, name, detail);
  }

  console.log('\nbehaviour');
  const f = byName.formulaText;
  check(same2(f.shown, ['2+3', '(1+2)*3', 'min(3,9)', '10-4']),
        'a formula written with spaces prints back tidy', f.shown.join('  '));

  const rt = byName.roundTrip;
  check(rt.sent === '72 864', 'results follow the numbers they were sent', rt.sent);
  check(rt.typed === '180 2,160', 'and follow what the reader types', rt.typed);
  check(rt.written === '10~18', 'typing writes every input into the link', rt.written);
  check(rt.reopened === rt.typed, 'reopening the link shows what the reader saw', rt.reopened);
  check(rt.values === '10 18', 'and the boxes come back filled in', rt.values);

  const tk = byName.tickRoundTrip;
  check(tk.written === '1100', 'ticking writes the link too', tk.written);
  check(same2(tk.empty, ['0', 'Probably fine', '0/4*100', '0>=2']),
        'an untouched checklist scores zero', tk.empty.join('  '));
  check(same2(tk.two, ['50', 'Get cover', '2/4*100', '2>=2']),
        'and every tick moves the score and the verdict with it', tk.two.join('  '));
  check(tk.copied.includes('Verdict: Get cover'),
        'copy for AI reads the ticks too',
        (/Verdict:[^\n]*/.exec(tk.copied) || [''])[0]);
  check(same2(tk.back, ['25', 'Probably fine', '1/4*100', '1>=2']),
        'and unticking takes it back down', tk.back.join('  '));

  const live = byName.decisionLive;
  check(same2(live.before, ['8.18', 'Not yet', '18000/2200', '8.18>=9']),
        'a decision draws with the numbers it was sent', live.before.join('  '));
  check(same2(live.crossed, ['8.18', 'Go now', '18000/2200', '8.18>=8']),
        'and flips the moment the reader crosses the threshold', live.crossed.join('  '));
  check(live.link === '18000~2200~8', 'the link follows it', live.link);
  check(live.copied.includes('Ready to walk: Go now'),
        'copy for AI reads the card as it stands, not as it was drawn',
        (/Ready to walk:[^\n]*/.exec(live.copied) || [''])[0]);
  check(same2(live.back, live.before), 'and it goes back when the number does',
        live.back.join('  '));

  const nm = byName.namedLive;
  check(same2(nm.labels, ['You have a railcard', 'Be there by 9:30']),
        'a box name never reaches the reader', nm.labels.join('  |  '));
  check(same2(nm.before, ['84']) && same2(nm.after, ['55.44']),
        'and ticking it moves the formula that reads it',
        nm.before.join() + ' -> ' + nm.after.join());

  const ex = byName.expressions;
  check(ex.bad.length === 0, 'the evaluator agrees on every expression', ex.bad.join('; '));
  check(ex.badNums.length === 0, 'showNumber agrees on every number', ex.badNums.join('; '));

  const copy = byName.copyForAI.text;
  for(const [label, want] of [['a row', 'Key: Value'], ['an input', 'Salary: 1,200'],
                              ['a result', 'Monthly: 100'], ['a decision', 'Verdict: Fine'],
                              ['a checklist', '[ ] A tick']]){
    check(copy.includes(want), `copy for AI carries ${label}`, want);
  }
  check(!/:[a-z]+$/m.test(copy), 'copy for AI leaks no raw field separators');

  console.log(fail.length ? `\n${fail.length} failed` : '\nall passed');
  process.exit(fail.length ? 1 : 0);
}

const same2 = (a, b) => JSON.stringify(a) === JSON.stringify(b);

main();
