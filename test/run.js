#!/usr/bin/env node
/*
 * Upshot's single test runner: transport, arithmetic and browser behaviour.
 * No dependencies; Chrome is required. Includes boundary and action checks.
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
const boundaries = require('./boundaries');

const ROOT = path.join(__dirname, '..');
/* test/mutate.js points this at a deliberately broken copy of the renderer to
   check that these tests would notice. Nothing else sets it. */
const CARD = process.env.UPSHOT_CARD || path.join(ROOT, 'v2', 'index.html');
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

  ['checks', `#m=GPT-5&d=2026-09-10&h=What is left to do&v=Two of these block the release&g=Before launch&c=:Vendor the library&c=:Swap the script tag&c=:${POINT}`,
   {blocks: 1, values: []}],

  ['checksTicked', `#m=GPT-5&d=2026-09-10&h=Half done&v=Progress&g=List&c=:First item&c=:Second item&c=:Third item&k=101`,
   {blocks: 1, values: [], ticked: '101'}],

  // one or two rows are figures, three or more a spec sheet - the card picks,
  // which is the whole reason n= was cut
  ['rowsOne', `#m=GPT-5&d=2026-09-10&h=One number&v=That is the point&g=The saving&f=Off the monthly price:17%25`,
   {blocks: 1, values: ['17%'], stats: 1, facts: 0}],
  ['rowsThree', `#m=GPT-5&d=2026-09-10&h=Runtime and cost&v=Cheaper at every tier&g=After&f=Cold start:180ms&f=Bundle:42kb&f=Dependencies:0`,
   {blocks: 1, values: ['180ms', '42kb', '0'], stats: 0, facts: 3}],

  // a block holds whatever mix it needs - inputs and their results together,
  // which in v1 would have cost two of the three slots
  ['calculator', `#m=GPT-5&d=2026-09-10&h=About twenty seven each&v=Service is in the total&g=Split it&i=bill:80:Bill&i=n:3:People&r=:bill/n:Each pays`,
   {blocks: 1, values: ['26.67']}],

  ['twoStage', `#m=GPT-5&d=2026-09-10&h=Work backward&v=Costs come off first&g=Exit&i=arv:450000:After repair value&i=sell:7:Selling cost percent&r=exit:arv%2A%28sell/100%29:Selling costs&g=Offer&i=reno:70000:Renovation&r=:arv-exit-reno:Maximum offer`,
   {blocks: 2, values: ['31,500', '348,500']}],

  // a step with no label feeds the rows below and is not drawn
  ['hiddenStep', `#h=One row, one hidden step&v=The step is not drawn&g=Sums&r=n:12*3:&r=:n*5:Total`,
   {blocks: 1, values: ['180']}],

  ['unanswerableFormulas', `#h=Unanswerable formulas&v=Both draw a dash&g=Nothing computable&r=:1/0:Divided by zero&r=:nope*2:Unknown name`,
   {blocks: 1, values: ['—', '—']}],
  ['invalidFormula', `#h=Invalid formula&v=The card is refused&g=Broken&r=:1+:Not a formula`,
   {blocks: 1, values: [], refused: true}],

  // a model that writes "2 + 3" instead of 2%2B3 is the common slip
  ['spacedFormulas', `#h=Formulas with spaces&v=Both halves survive&g=Sums&r=:2 + 3:Sum&r=:(1000 + 250) * 4%2E5:Rate`,
   {blocks: 1, values: ['5', '5,625']}],

  /* The same slip against a bracket, which is the one place stripping the gap
     is wrong: a bracket is not an operator, so "(a)+b" arriving as "(a) b"
     has to come back a sum rather than a call. "round (a)" is the other side
     of it - a name we know, written loosely, and still a call. */
  ['bracketedPlus', `#h=Plus against a bracket&v=The gap is an operand boundary&g=Sums&i=a:10:A&i=b:4:B&r=:(a)+b:Outside&r=:round(a)+round(b):Between calls&r=:(a+b)+(b+1):Both sides&r=:round (a)+b:Called loosely`,
   {blocks: 1, values: ['14', '14', '19', '14']}],

  // a condition gets the same repair as a formula
  ['bracketedPlusDecision', `#h=Plus in a condition&v=Same repair as a result&g=Runway&i=a:10:A&i=b:4:B&t=Over twelve:(a)+b>12:Yes&t=Over twelve::No`,
   {blocks: 1, values: ['Yes']}],

  // the decision key: same row, wording the card chose
  ['decisionTrue', `#h=Enough runway&v=Nine months is the number&g=Runway&i=cash:18000:Cash&i=burn:1000:Burn&i=target:9:Target&r=months:cash/burn:Runway&t=Ready to walk:months>=target:Go now&t=Ready to walk::Not yet`,
   {blocks: 1, values: ['18', 'Go now']}],
  ['decisionFalse', `#h=Not yet&v=Nine months is the number&g=Runway&i=cash:18000:Cash&i=burn:2200:Burn&i=target:9:Target&r=months:cash/burn:Runway&t=Ready to walk:months>=target:Go now&t=Ready to walk::Not yet`,
   {blocks: 1, values: ['8.18', 'Not yet']}],

  /* A model that writes + where & was needed leaves the next key inside the
     label before it, and every formula downstream of the lost key dies. The
     card recovers it, so this has to come out identical to 'calculator'. */
  ['swallowedKey', `#m=GPT-5&d=2026-09-10&h=About twenty seven each&v=Service is in the total&g=Split it+i=bill:80:Bill&i=n:3:People&r=:bill/n:Each pays`,
   {blocks: 1, values: ['26.67'], label: 'Split it'}],

  /* A condition that cannot be worked out is not a condition that came out
     false. If it drew the false branch, a card whose numbers are all dashes
     would still print a verdict, and that is the one failure this format must
     never have: confident, wrong, and indistinguishable from working. */
  ['decisionUnanswerable', `#h=Nothing computable&v=The verdict must not fall through&g=Runway&r=regret:nope*2:Broken&t=Verdict:regret<35:Go now&t=Verdict::Stay home`,
   {blocks: 1, values: ['\u2014', '\u2014']}],

  /* A number smaller than the two places we round to is not zero. Printed as
     one it makes correct working read as nonsense - the LC card computed
     10,000 and showed it as 1/sqrt(0.01*0), which is a proof of the opposite. */
  ['smallNumbers', `#h=Small numbers stay honest&v=Below a hundredth, six significant figures&g=Resonance&i=l:0.01:Inductance&i=c:0.000001:Capacitance&r=w:1/sqrt(l*c):Angular&r=:c/1000:Tiny`,
   {blocks: 1, values: ['10,000', '1e-9']}],

  /* The printed working has to reproduce the answer. A constant entered to
     five figures and shown to three puts the escape speed of the Earth out by
     four metres a second, and the one thing a card is supposed to let you do
     is check it. */
  ['workingReproducesTheAnswer', `#h=Escape speed&v=The working has to add up&g=Planet&i=m:5.972e24:Mass&i=r:6371000:Radius&i=g:0.000000000066743:G&r=:sqrt(2*g*m/r):Escape speed`,
   {blocks: 1, values: ['11,185.98']}],

  // a box can carry a name a formula reads as 1 or 0
  ['namedBoxes', `#h=Named boxes&v=A box can be referred to by name&g=Your ticket&i=fare:84:Full fare&c=card:You have a railcard&c=offpeak:Travelling off peak&r=cut:card*0.34+offpeak*0.1:Discount&r=:fare-fare*cut:You pay&k=11`,
   {blocks: 1, values: ['0.44', '47.04'], ticked: '11'}],
  ['namedBoxesOff', `#h=Named boxes&v=A box can be referred to by name&g=Your ticket&i=fare:84:Full fare&c=card:You have a railcard&c=offpeak:Travelling off peak&r=cut:card*0.34+offpeak*0.1:Discount&r=:fare-fare*cut:You pay`,
   {blocks: 1, values: ['0', '84']}],
  /* A trailing single word is a name; anything with a space in it is still
     part of the label. "Be there by 9:30" has to stay a time, and
     "Bring ID: passport" has to stay prose. */
  ['colonInLabel', `#h=Colons in a label&v=Only a bare trailing word is a name&g=List&c=:Be there by 9:30&c=:Bring ID: passport&c=flag:A named one&r=:flag:Named&k=111`,
   {blocks: 1, values: ['1'], ticked: '111'}],

  // ticks and boxes: the checklist as two numbers a formula can use
  ['scoredEmpty', `#h=How exposed are you&v=Tick what applies&g=How many apply&c=:A mortgage&c=:Dependants&c=:Higher earner&c=:Self employed&r=pct:ticks/boxes*100:Score&t=Verdict:ticks>=2:Get cover&t=Verdict::Probably fine`,
   {blocks: 1, values: ['0', 'Probably fine']}],
  ['scoredTicked', `#h=How exposed are you&v=Tick what applies&g=How many apply&c=:A mortgage&c=:Dependants&c=:Higher earner&c=:Self employed&r=pct:ticks/boxes*100:Score&t=Verdict:ticks>=2:Get cover&t=Verdict::Probably fine&k=1101`,
   {blocks: 1, values: ['75', 'Get cover'], ticked: '1101'}],
  /* An input may not redefine what the spec says the word means. It used to
     lose the claim silently and draw a box no formula read; now the whole
     card refuses, so there is no half-drawn card to misread. */
  ['reservedName', `#h=Reserved&v=Nothing should draw&g=x&i=ticks:99:Ticks&c=:One&c=:Two&r=:ticks:Count`,
   {blocks: 1, values: [], refused: true}],
  ['duplicateName', `#h=Claimed twice&v=Nothing should draw&g=x&i=n:1:One&i=n:2:Two&r=:n:Out`,
   {blocks: 1, values: [], refused: true}],

  // composition and the cap
  ['comparison', `#m=GPT-5&d=2026-09-10&h=Postgres or SQLite&v=Postgres, unless you ship to the edge&g=Postgres&p=Concurrent writes&p=Real types&g=SQLite&p=Zero ops&p=Faster for reads`,
   {blocks: 2, values: []}],
  ['threeBlocks', `#h=Three blocks stacked&v=Three is the usual shape&g=One&p=a&p=b&g=Two&o=c&o=d&g=Three&c=:e&c=:f`,
   {blocks: 3, values: []}],
  /* There was a cap of three, and it truncated: a fourth block vanished with
     no dash and nothing in /broken/, so a card labelled IMPORTANT disappeared
     in test. The 2000-character value is an authoring and transport budget. */
  ['fourBlocks', `#h=Four blocks all render&v=Nothing is dropped&g=One&p=a&g=Two&o=b&g=Three&f=e:f&g=Four&p=this must appear`,
   {blocks: 4, values: ['f']}],
  ['everyKind', `#h=One block holding every kind&v=Only a g= starts a block&g=All of it&p=A bullet&o=A step&c=:A tick&f=Key:Value&i=pay:62000:Salary&r=:pay/12:Monthly`,
   // the lone f= here is a row, not a headline figure: it shares the block
   {blocks: 1, values: ['Value', '5,166.67'], stats: 0, facts: 2}],

  /* Units. A number used to arrive bare - "Payment 222" of what - because
     the unit could only be smuggled into the label. u= attaches it to the
     name, so every place that name is drawn wears it. */
  ['unitMoney', `#h=What it costs&v=Money leads the number&g=The cost&i=n:222:Amount&r=pay:n:Payment&u=pay:£`,
   {blocks: 1, values: ['£222']}],
  ['unitPercent', `#h=What it saves&v=A percentage trails it&g=The saving&i=n:17:Amount&r=off:n:Off the price&u=off:%`,
   {blocks: 1, values: ['17%']}],
  /* Duration output carries both unit scales so hours and minutes cannot
     produce the same ambiguous clock string. */
  ['unitClock', `#h=How long it took&v=Hours read as hours&g=The run&i=n:5%2E64:Hours&r=t:n:Took&u=t:hr`,
   {blocks: 1, values: ['5h 38m']}],
  ['unitUnknownName', `#h=A unit for nothing&v=Nothing should draw&g=x&i=n:1:One&r=:n:Out&u=nope:£`,
   {blocks: 1, values: [], refused: true}],

  /* pick-one. The option carries the number, so one formula covers every
     option - written per-option instead it is four terms that can disagree. */
  ['pickOne', `#m=GPT-5&d=2026-09-14&h=What I repay&v=Nine percent over the threshold&g=Your plan&s=thr:26900:Plan 1&s=thr:29385:Plan 2&i=salary:40000:Salary&r=:max(0,salary-thr)*0%2E09:Repayment`,
   {blocks: 1, values: ['1,179'], picked: '10'}],
  ['pickOneChosen', `#m=GPT-5&d=2026-09-14&h=What I repay&v=Nine percent over the threshold&g=Your plan&s=thr:26900:Plan 1&s=thr:29385:Plan 2&i=salary:40000:Salary&r=:max(0,salary-thr)*0%2E09:Repayment&x=1`,
   {blocks: 1, values: ['955.35'], picked: '01'}],
  // a hand-edited or truncated x= must not leave the group answering nothing
  ['pickOneBadIndex', `#m=GPT-5&d=2026-09-14&h=What I repay&v=Nine percent over the threshold&g=Your plan&s=thr:26900:Plan 1&s=thr:29385:Plan 2&i=salary:40000:Salary&r=:max(0,salary-thr)*0%2E09:Repayment&x=7`,
   {blocks: 1, values: ['1,179'], picked: '10'}],
  // a pick-one beside a checklist: two questions, drawn as two controls
  ['pickAndCheck', `#m=GPT-5&d=2026-09-14&h=Both kinds&v=One of these, any of those&g=Mix&s=tier:1:Basic&s=tier:2:Plus&c=:Add support&r=:tier:Tier`,
   {blocks: 1, values: ['1'], picked: '10', ticked: '0'}],

  // shapes of failure
  ['unknownKey', `#z=explainer&h=An unknown key&v=z= is not in the grammar&g=Why&p=Anything not in the grammar is ignored`,
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

/* Every comparison at its own boundary, generated rather than listed.
   A hand-written table picks pairs like 4 and 18, where every operator that
   could be confused with its neighbour still agrees. Mutating `>` to `>=` in
   the evaluator changed no answer this file checked. The pair that separates
   them is the equal one, and only an exhaustive sweep reliably contains it.
   Expectations come from JavaScript's own operators, never from evaluate(). */
for(const [op, fn] of [['<', (a, b) => a < b], ['>', (a, b) => a > b],
                       ['<=', (a, b) => a <= b], ['>=', (a, b) => a >= b],
                       ['==', (a, b) => a === b], ['!=', (a, b) => a !== b]]){
  for(const a of [2, 3, 4]) EXPRS.push([`x${op}y`, {x: a, y: 3}, fn(a, 3) ? 1 : 0]);
}

/* Each function against a case that tells it from the function next to it:
   floor and ceil differ only off an integer, and round's second argument was
   free to be ignored. Negatives are here because rounding is not symmetric. */
for(const [src, want] of [
  ['floor(2.5)', 2], ['ceil(2.5)', 3], ['floor(-2.5)', -3], ['ceil(-2.5)', -2],
  ['round(10/3,2)', 3.33], ['round(1.2345,3)', 1.235], ['round(2.5)', 3],
  ['round(-2.5)', -2], ['abs(-3)', 3], ['abs(3)', 3],
  ['min(3,9)', 3], ['max(3,9)', 9], ['sqrt(16)', 4], ['pow(2,10)', 1024]
]) EXPRS.push([src, {}, want]);

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
  // would be invisible to the thing it exists for. The page now carries a
  // second, inert <script type="application/ld+json"> block for search
  // engines and one small copy-to-clipboard enhancement in the body, so
  // "exactly one <script> tag" is no longer the right proxy - what matters
  // is that the spec text itself survives with every script stripped out.
  const noScripts = landing.replace(/<script[\s\S]*?<\/script>/g, '');
  check(!/\bfunction\b/.test(noScripts) && /BEFORE YOU REPLY/.test(noScripts) &&
        /Reply with the URL and nothing else\./.test(noScripts),
        'the landing page carries the spec outside of any script',
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
  document.fonts.ready.then(async () => {
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
                    .map(b => b.checked ? '1' : '0').join(''),
          picked: [...document.querySelectorAll('.picks input')]
                    .map(b => b.checked ? '1' : '0').join(''),
          // a refused card keeps the frame and replaces everything under it
          refused: /could not be drawn/.test(
            (document.querySelector('#main h1') || {}).textContent || '')
        };
      } catch(e){
        return {name, error: e && e.message ? e.message : String(e)};
      }
    });

    /* The formula is on the card so the number can be checked, which makes how
       it reads part of what it is for. Restoring + from a space produces
       "2+++3" before it is collapsed - correct arithmetic, and a formula that
       looks like a typo. */
    location.hash = '#h=x&v=y&g=s&r=:2 + 3:Sum&r=:(1 + 2) * 3:Nested&r=:min(3, 9):Args&r=:10 - 4:Minus';
    draw();
    out.push({name: 'formulaText', shown: text('#main .fx')});

    /* Typing has to move three things at once: the results on the card, the
       w= in the link, and - because the link is the state - what a reader sees
       when the card is passed on and opened fresh. */
    location.hash = '#h=x&v=y&g=n&i=s:4:Seats&i=p:18:Price&r=m:s*p:Monthly&r=:m*12:Per year';
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

    /* The renderer is the one writer on a card that is not a model, and it was
       the one writer exempt from the card's own encoding rule. A reader typing
       4.5 wrote w=4.5, a raw full stop in a link; three inputs wrote
       w=a~b~c, and a tilde pair is WhatsApp strikethrough.

       So this types the nastiest values a reader can and asserts the whole
       fragment stays inside the alphabet - which is the rule itself rather
       than a list of characters, and therefore covers what nobody thought of.

       Everything the reader can touch at once: decimals, negatives, a huge
       number, a tiny one, ticks and a pick-one. */
    location.hash = '#h=x&v=y&g=n&i=a:1:A&i=b:1:B&i=c:1:C&i=d:1:D' +
                    '&r=:a+b+c+d:Sum&c=:One&c=:Two&s=k:1:First&s=k:2:Second';
    draw();
    const typeAll = vals => {
      [...document.querySelectorAll('.ins input')].forEach((el, i) => {
        el.value = vals[i]; el.dispatchEvent(new Event('input'));
      });
    };
    typeAll(['4.5', '-3.25', '1e-9', '12345678.9']);
    const ticks2 = [...document.querySelectorAll('.checks input')];
    if (ticks2[0]) { ticks2[0].checked = true; ticks2[0].dispatchEvent(new Event('change')); }
    const radios2 = [...document.querySelectorAll('.picks input')];
    if (radios2[1]) { radios2[1].checked = true; radios2[1].dispatchEvent(new Event('change')); }
    out.push({name: 'stateAlphabet',
              frag: location.hash.replace(/^#/, ''),
              reread: (() => { draw(); return text('#main .fv').join(' '); })()});

    /* A decision is recomputed by the same numbers a result is, and both are
       repainted in place rather than redrawn - so the card can tell the reader
       two different stories about one set of inputs if only one is updated. */
    location.hash = '#h=x&v=y&g=Runway&i=cash:18000:Cash saved&i=burn:2200:Monthly burn' +
                    '&i=target:9:Months you want&r=months:cash/burn:Runway' +
                    '&t=Ready to walk:months>=target:Go now' +
                    '&t=Ready to walk::Not yet';
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
    location.hash = '#h=x&v=y&g=l&c=:One&c=:Two&c=:Three&c=:Four' +
                    '&r=pct:ticks/boxes*100:Score' +
                    '&t=Verdict:ticks>=2:Get cover&t=Verdict::Probably fine';
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
    location.hash = '#h=x&v=y&g=t&i=fare:84:Full fare&c=card:You have a railcard' +
                    '&c=:Be there by 9:30&r=:fare-fare*card*0.34:You pay';
    draw();
    const named = {labels: text('.checks span'), before: text('#main .fv')};
    const box = [...document.querySelectorAll('.checks input')][0];
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    named.after = text('#main .fv');
    out.push({name: 'namedLive', ...named});

    /* Choosing has to move the same three things a tick does: the rows on the
       card, the x= in the link, and what a reader sees opening it fresh. The
       radios share a name, so the browser enforces one-of - which is the point
       of using a real control rather than drawing one. */
    location.hash = '#h=x&v=y&g=Your plan&s=thr:26900:Plan 1&s=thr:29385:Plan 2' +
                    '&s=thr:33795:Plan 4&i=salary:40000:Salary' +
                    '&r=:max(0,salary-thr)*0.09:Repayment';
    draw();
    const pickRows = () => text('#main .fv').concat(text('#main .fx'));
    const radios = () => [...document.querySelectorAll('.picks input')];
    const lit = () => radios().filter(r => r.checked).length;
    const pick = {labels: text('.picks span'), count: radios().length,
                  litAtStart: lit(), before: pickRows()};
    const choose = i => { const r = radios()[i]; r.checked = true; r.dispatchEvent(new Event('change')); };
    choose(1);
    pick.after = pickRows();
    pick.litAfter = lit();
    pick.written = (/x=([^&]*)/.exec(location.hash) || [, ''])[1];
    pick.copied = copyText(parse(location.hash));
    const passedOnPick = location.hash;
    location.hash = '#h=reset&v=reset';
    draw();
    location.hash = passedOnPick;
    draw();
    pick.reopened = pickRows();
    pick.reopenedAt = radios().findIndex(r => r.checked);
    choose(0);
    pick.back = pickRows();
    out.push({name: 'pickLive', ...pick});

    // two groups on one card move independently, and one x= carries both
    location.hash = '#h=x&v=y&g=Two&s=one:1:A&s=one:2:B&s=two:10:X&s=two:20:Y&r=:one+two:Sum';
    draw();
    const two = {before: text('#main .fv')};
    const pair = [...document.querySelectorAll('.picks input')];
    pair[3].checked = true; pair[3].dispatchEvent(new Event('change'));
    two.oneMoved = text('#main .fv');
    two.written = (/x=([^&]*)/.exec(location.hash) || [, ''])[1];
    two.lit = pair.filter(r => r.checked).length;
    out.push({name: 'pickTwoGroups', ...two});

    /* A group split across two blocks is still one group. If the radios were
       grouped by block rather than by name the reader could hold two answers
       to one question at once, which is the failure c= already has. */
    location.hash = '#h=x&v=y&g=One&s=n:1:A&g=Two&s=n:2:B&g=Sum&r=:n:V';
    draw();
    const split = {before: text('#main .fv')};
    const across = [...document.querySelectorAll('.picks input')];
    across[1].checked = true; across[1].dispatchEvent(new Event('change'));
    split.after = text('#main .fv');
    split.lit = [...document.querySelectorAll('.picks input')].filter(r => r.checked).length;
    split.names = across.map(r => r.name).join(' ');
    out.push({name: 'pickAcrossBlocks', ...split});

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
    location.hash = '#h=x&v=y&m=GPT-5&d=2026-09-10&g=All&f=Key:Value&i=pay:1200:Salary&r=mo:pay/12:Monthly&t=Verdict:mo>50:Fine&t=Verdict::Tight&c=:A tick';
    draw();
    out.push({name: 'copyForAI', text: copyText(parse(location.hash))});

    out.push({name: 'boundaries', results: await (__BOUNDARY_PROBE__)(__BOUNDARY_CASES__)});
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
    PROBE.replace('__CASES__', () => JSON.stringify(CASES.map(c => [c[0], c[1]])).replace(/</g, '\\u003c'))
         .replace('__EXPRS__', () => JSON.stringify(EXPRS).replace(/</g, '\\u003c'))
         .replace('__NUMS__', () => JSON.stringify(NUMS))
         .replace('__BOUNDARY_PROBE__', () => boundaries.browserProbe.toString())
         .replace('__BOUNDARY_CASES__', () => JSON.stringify(boundaries.cases).replace(/</g, '\\u003c')) + '</body>'));
  let dom;
  try {
    dom = execFileSync(chrome, [
      '--headless', '--disable-gpu', '--hide-scrollbars', '--no-sandbox',
      '--virtual-time-budget=20000',
      '--window-size=500,900',
      // draw() runs at parse time and would send an unrenderable link to
      // /broken/, navigating the harness away before the probe reports
      '--dump-dom', 'file://' + harness + '#h=harness&v=ready'
    ], {encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024});
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

  console.log('transport, arithmetic and prompt sync');
  const transport = require('./transport').runChecks();
  check(transport.failures === 0, 'transport, arithmetic and prompt sync',
        `${transport.checks - transport.failures}/${transport.checks} checks passed`);

  staticChecks(src);
  siblingChecks();
  syntaxCheck(src);

  if(!chrome){
    console.log('\nINCOMPLETE: no Chrome found. Set CHROME=/path/to/chrome.');
    process.exit(2);
  }

  console.log('\nrender');
  const results = renderAll(chrome, src);
  const byName = Object.fromEntries(results.map(r => [r.name, r]));
  if(byName.probe) throw new Error(byName.probe.error);
  if(!byName.boundaries) throw new Error('Boundary tests did not report');

  for(const [name, , want] of CASES){
    const got = byName[name];
    if(!got){ check(false, name, 'no result'); continue; }
    if(got.error){ check(false, name, got.error); continue; }
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    let ok = got.blocks === want.blocks && same(got.values, want.values)
             && got.refused === !!want.refused;
    let detail = `${got.blocks} block(s)` + (got.values.length ? '  ' + got.values.join(' ') : '');
    for(const k of ['facts', 'stats', 'label', 'ticked', 'picked']){
      if(want[k] === undefined) continue;
      if(got[k] !== want[k]){ ok = false; detail += `  ${k}=${got[k]} wanted ${want[k]}`; }
    }
    if(!ok && got.blocks !== want.blocks) detail += `  wanted ${want.blocks} block(s)`;
    if(!ok && got.refused !== !!want.refused)
      detail += want.refused ? '  wanted a refusal' : '  refused unexpectedly';
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
  check(rt.written === '10/18', 'typing writes every input into the link', rt.written);
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

  /* The condition cites 8.18182, not the 8.18 the row above it shows. The two
     are different jobs: the row presents a number to read, the working proves
     it. A runway of 8.999 against a target of 9 printed as 9>=9 reads true
     beside a verdict saying otherwise - a proof that refutes itself in front
     of the reader. Found 15 Sep 2026 by looking at a card, where a growth
     step holding 1.9991314 printed round(14000*2) under an answer of 27,988. */
  /* The alphabet, asserted on what the RENDERER wrote rather than on what a
     model wrote. Both of the channel bugs found on 15 Sep were here: a raw
     full stop from a typed decimal, and a tilde separator WhatsApp eats. */
  const sa = byName.stateAlphabet;
  const strayInState = [...new Set((sa.frag || '').replace(/[A-Za-z0-9%+&=:_\/-]/g, ''))];
  check(strayInState.length === 0,
    'nothing the reader types can push the link outside its alphabet',
    strayInState.length ? `link carries ${JSON.stringify(strayInState.join(''))}` : '');
  check(/w=/.test(sa.frag || ''), 'and the typed values did reach the link', sa.frag);

  const live = byName.decisionLive;
  check(same2(live.before, ['8.18', 'Not yet', '18000/2200', '8.18182>=9']),
        'a decision draws with the numbers it was sent', live.before.join('  '));
  check(same2(live.crossed, ['8.18', 'Go now', '18000/2200', '8.18182>=8']),
        'and flips the moment the reader crosses the threshold', live.crossed.join('  '));
  check(live.link === '18000/2200/8', 'the link follows it', live.link);
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

  const pk = byName.pickLive;
  check(pk.count === 3 && pk.litAtStart === 1,
        'a group arrives with exactly one option lit',
        pk.count + ' options, ' + pk.litAtStart + ' lit');
  check(same2(pk.labels, ['Plan 1', 'Plan 2', 'Plan 4']),
        'an option name never reaches the reader', pk.labels.join('  |  '));
  check(same2(pk.before, ['1,179', 'max(0,40000-26900)*0.09']),
        'the card computes from the option it stands on', pk.before.join('  '));
  check(same2(pk.after, ['955.35', 'max(0,40000-29385)*0.09']),
        'choosing another option moves the result and its working with it',
        pk.after.join('  '));
  check(pk.litAfter === 1, 'and the one before it goes out - exactly one stays lit',
        pk.litAfter + ' lit');
  check(pk.written === '1', 'choosing writes the link', pk.written);
  check(pk.copied.includes('(x) Plan 2') && pk.copied.includes('( ) Plan 1'),
        'copy for AI carries which option was chosen',
        (/\([ x]\) Plan 2/.exec(pk.copied) || [''])[0]);
  check(same2(pk.reopened, pk.after) && pk.reopenedAt === 1,
        'reopening the link shows the reader their own choice',
        pk.reopened.join('  ') + '  at ' + pk.reopenedAt);
  check(same2(pk.back, pk.before), 'and going back is going back', pk.back.join('  '));

  const tg = byName.pickTwoGroups;
  check(same2(tg.before, ['11']), 'two groups each stand on their own first option',
        tg.before.join());
  check(same2(tg.oneMoved, ['21']), 'and one moves without disturbing the other',
        tg.oneMoved.join());
  check(tg.written === '0/1', 'one x= carries both, in document order', tg.written);
  check(tg.lit === 2, 'with one option lit in each', tg.lit + ' lit');

  const ab = byName.pickAcrossBlocks;
  check(same2(ab.before, ['1']) && same2(ab.after, ['2']),
        'a group split across blocks still answers as one',
        ab.before.join() + ' -> ' + ab.after.join());
  check(ab.lit === 1,
        'and holds one answer, not one per block - which is what c= cannot do',
        ab.lit + ' lit');
  check(ab.names.split(' ')[0] === ab.names.split(' ')[1],
        'because the options are grouped by name, not by where they sit',
        ab.names);

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

  console.log('\nboundaries and actions');
  const boundaryResults = byName.boundaries.results;
  for(const id of [...new Set(boundaryResults.map(r => r.id))]){
    const group = boundaryResults.filter(r => r.id === id);
    const bad = group.filter(r => !r.ok);
    check(bad.length === 0, id, `${group.length - bad.length}/${group.length} passed`);
    for(const r of bad.slice(0, 3)) console.log('        ' + r.name + '\n          ' + r.detail);
    if(bad.length > 3) console.log(`        ... ${bad.length - 3} more failures in this family`);
  }
  console.log(fail.length ? `\nFAIL: ${fail.length} failing check(s). See LANGUAGE.md.`
                         : '\nPASS: all automated checks passed. Manual release checks still apply.');
  process.exit(fail.length ? 1 : 0);
}

const same2 = (a, b) => JSON.stringify(a) === JSON.stringify(b);

try { main(); }
catch(e){
  console.error('\nINCOMPLETE: ' + e.message);
  process.exitCode = 2;
}
