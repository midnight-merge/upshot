#!/usr/bin/env node
/*
 * Transport/arithmetic checks used by the single test/run.js suite.
 * Also provides the optional model-link scorer: node test/transport.js links.txt
 *
 *   node test/run.js
 *
 * The browser checks ask "does the card render what the URL says". This asks the question
 * underneath it: can the URL survive being sent at all, and does what the spec
 * tells a model to write decode back to what it meant.
 *
 * Every bug found on 12 Sep 2026 lived here, and a renderer test could not see
 * any of them: the card rendered perfectly from a URL that a chat client had
 * already truncated, or would have.
 *
 * Three sweeps:
 *   1. every character, in every field position, round-tripped
 *   2. the shipped examples, put through a simulated chat client
 *   3. the evaluator against plain arithmetic, over generated expressions
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
/* Overridden only by test/mutate.js, which needs every check in the suite -
   these included - to read the deliberately broken copy. */
const CARD = process.env.UPSHOT_CARD || path.join(ROOT, 'v2', 'index.html');

/* The renderer, lifted out of the page. Everything past the expression
   machinery touches the DOM, so the cut is the first function that does. */
const src = fs.readFileSync(CARD, 'utf8');
const js = /<script>([\s\S]*?)<\/script>/.exec(src)[1];
const cut = js.indexOf('/* execCommand is the fallback');
if (cut < 0) throw new Error('cannot find the cut point in v2/index.html');
const mod = {exports: {}};
new Function('module', 'exports', js.slice(0, cut) +
  '\nmodule.exports={parse:parse,evaluate:evaluate,restorePlus:restorePlus,' +
  'fields:fields,text:text,checkField:checkField,withUnit:withUnit,' +
  'showNumber:showNumber,cardPrint:cardPrint};'
)(mod, mod.exports);
const {parse, fields, checkField, withUnit, showNumber, cardPrint, restorePlus} = mod.exports;

/* Reader state only counts on the card it was typed into, so a fixture that
   seeds w=, k= or x= by hand has to carry that card's print the way the
   renderer would have written it. */
const stamp = hash => hash + '&z=' + cardPrint(hash.replace(/^#/, '').split('&'));
if (typeof parse !== 'function') throw new Error('engine did not load');

let failures = 0, checks = 0;
function check(ok, what, detail) {
  checks++;
  if (!ok) { failures++; console.log('  FAIL  ' + what + (detail ? '  ' + detail : '')); }
  return ok;
}

/* ---- the spec's encoder, as a reference implementation ----
   This is llms.txt's Encoding section written out as code. If it and the
   renderer ever disagree, one of them is wrong and the model is caught in
   between - which is exactly how this week went. */
/* The rule, as code. In wording keep letters, digits and a hyphen; in a
   formula also keep + - / = _ , because there they are arithmetic. Encode
   everything else. That is the whole Encoding section, and the point of
   writing it this way is that there is no list of dangerous characters to
   fall behind - a character nobody thought about is encoded by default.

   Every encoding bug this file has caught was a character missing from a
   list: > , then * and . wrongly exempted, then \\ ^ ` { | } never mentioned,
   then _ eaten as italic. A list cannot stop the next one. This can. */
function pct(ch) {
  return Array.from(Buffer.from(ch, 'utf8'))
    .map(b => '%' + b.toString(16).toUpperCase().padStart(2, '0')).join('');
}
/* Array.from, not .split(''): a character outside the Basic Multilingual
   Plane - most emoji - is a surrogate pair, two UTF-16 code units that
   .split('') tears apart. Each lone half is not valid UTF-8 on its own, so
   Buffer.from(half, 'utf8') silently produces the replacement character
   instead of throwing - this reference encoder mangled every emoji into
   %EF%BF%BD%EF%BF%BD for exactly that reason until a real one was checked
   against what the rule should have produced. Array.from iterates by
   codepoint, which keeps a surrogate pair together. */
function encodeWording(text) {
  return Array.from(String(text)).map(ch =>
    ch === ' ' ? '+' : /[A-Za-z0-9-]/.test(ch) ? ch : pct(ch)).join('');
}
function encodeFormula(f) {
  return Array.from(String(f)).map(ch =>
    ch === ' ' ? '' : /[A-Za-z0-9+\-/=_]/.test(ch) ? ch : pct(ch)).join('');
}

/* ---- the channel ----
   What happens to a link between being typed and being read. */

/* Characters that are not legal in a URI. A client's autolinker ends the link
   at the first one and silently drops the rest - which still renders, which is
   why nobody notices. */
const ILLEGAL = /[ "<>{}|\\^`]/;
function truncatedBy(url) {
  const m = ILLEGAL.exec(url);
  return m ? {at: m.index, ch: m[0]} : null;
}

/* A chat UI that renders markdown eats paired emphasis markers before anyone
   clicks anything. WhatsApp uses *bold* and _italic_, and a marker survives
   only when it has no partner - which is what turned j*45 into j45 while
   leaving the lone p*6 alone. */
function markdownEaten(text) {
  let out = text;
  // WhatsApp: *bold* _italic_ ~strikethrough~. The tilde was missing here for
  // as long as the format used a tilde to join reader state, so the one
  // client-eaten character the renderer emitted itself was the one character
  // this function could not see.
  for (const mark of ['*', '_', '~']) {
    const m = '\\' + mark;
    out = out.replace(new RegExp(m + '([^' + m + '\\s][^' + m + ']*?)' + m, 'g'), '$1');
  }
  return out;
}

/* ---- sweep 1: every character, in every field ---- */
function sweepCharacters() {
  console.log('\ncharacters x fields');

  // one representative of every field kind, and how a value reaches it again
  const FIELDS = [
    ['a  scope', t => `#a=${encodeWording(t)}&h=H&v=V&m=M&d=2026-01-01`, d => d.a],
    ['h  headline', t => `#a=A&h=${encodeWording(t)}&v=V&m=M&d=2026-01-01`, d => d.h],
    ['v  verdict', t => `#a=A&h=H&v=${encodeWording(t)}&m=M&d=2026-01-01`, d => d.v],
    ['m  model', t => `#a=A&h=H&v=V&m=${encodeWording(t)}&d=2026-01-01`, d => d.m],
    ['g  block label', t => `#a=A&h=H&v=V&m=M&d=2026-01-01&g=${encodeWording(t)}&p=x`,
      d => d.blocks[0].label],
    ['p  bullet', t => `#a=A&h=H&v=V&m=M&d=2026-01-01&g=G&p=${encodeWording(t)}`,
      d => d.blocks[0].items[0]],
    ['o  step', t => `#a=A&h=H&v=V&m=M&d=2026-01-01&g=G&o=${encodeWording(t)}`,
      d => d.blocks[0].items[0]],
    ['f  row value', t => `#a=A&h=H&v=V&m=M&d=2026-01-01&g=G&f=L:${encodeWording(t)}`,
      d => fields(d.blocks[0].items[0], 2)[1]],
    ['s  pick label', t => `#a=A&h=H&v=V&m=M&d=2026-01-01&g=G&s=n:1:${encodeWording(t)}`,
      d => d.blocks.find(b => b.type === 's').options[0].label],
    ['t  outcome', t => `#a=A&h=H&v=V&m=M&d=2026-01-01&g=G&i=n:1:N&t=L:n%3E0:${encodeWording(t)}`,
      d => d.blocks.find(b => b.type === 't').decided[0].text]
  ];

  // every printable ASCII, plus the ones that have bitten us before
  const CHARS = [];
  for (let i = 32; i < 127; i++) CHARS.push(String.fromCharCode(i));
  CHARS.push('£', '€', '’', '—', 'é');
  // surrogate pairs - a model describing an actual conversation reaches for
  // these constantly, and they are a different code path from every char
  // above: two UTF-16 units that a naive split() would tear apart
  CHARS.push('🚗', '🚆', '👍');

  let roundTrip = 0, unsendable = 0, eaten = 0;
  const uncovered = {};
  for (const [name, build, read] of FIELDS) {
    for (const ch of CHARS) {
      // padded, so a lone character is not also a trailing-punctuation case
      const text = 'a' + ch + 'b';
      const hash = build(text);
      const url = 'https://upshot.fyi/v2/' + hash;

      const cutAt = truncatedBy(url);
      if (cutAt) {
        // collected and reported once below - a character the spec never tells
        // anyone to encode is one finding, not one per field
        unsendable++;
        (uncovered[ch] = uncovered[ch] || []).push(name.split(' ')[0]);
        continue;
      }
      if (markdownEaten(url) !== url) {
        eaten++;
        check(false, `${name}: ${JSON.stringify(ch)} is eaten by a markdown chat UI`);
        continue;
      }
      let got;
      try { got = read(parse(hash)); } catch (e) { got = '<<threw: ' + e.message + '>>'; }
      if (got !== text) {
        roundTrip++;
        check(false, `${name}: ${JSON.stringify(ch)} does not round-trip`,
          `sent ${JSON.stringify(text)}, card read ${JSON.stringify(got)}`);
      }
    }
  }
  /* A character that is illegal in a URL and that the Encoding section never
     mentions is a hole in the spec, not a bug in a card: a model has no way to
     know, so the first headline containing one loses everything after it. */
  Object.keys(uncovered).forEach(ch => {
    check(false, `${JSON.stringify(ch)} is illegal in a URL and the spec never says to encode it`,
      `breaks ${uncovered[ch].length} field kinds`);
  });
  console.log(`  ${FIELDS.length} fields x ${CHARS.length} characters = ${FIELDS.length * CHARS.length} cases`);
  console.log(`  unsendable ${unsendable}, eaten by markdown ${eaten}, bad round-trip ${roundTrip}`);
  if (!unsendable && !eaten && !roundTrip) console.log('  ok    every character survives every field');
}

/* ---- sweep 2: everything we ship, through the channel ---- */
function sweepExamples() {
  console.log('\nshipped examples through the channel');
  const {promptHTML} = require('../scripts/sync-prompt');
  const prompt = fs.readFileSync(path.join(ROOT, 'llms.txt'), 'utf8');
  const landing = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  check(landing.includes('<pre id="prompt">' + promptHTML(prompt) + '</pre>'),
    'the entire homepage prompt matches llms.txt', 'run node scripts/sync-prompt.js if it differs');
  /* EVERY url the project ships, from one place.

     This read llms.txt and made/index.html and nothing else, which is how two
     live bugs sat on the homepage for days: a raw full stop in 4.5, and three
     tildes of reader state that WhatsApp eats as strikethrough. The homepage's
     own four demos were never put through the channel at all.

     One list, every check. A file added later is covered by adding it here
     rather than by remembering to. */
  const urls = shippedURLs();

  urls.forEach(url => {
    const name = (/[#&]h=([^&]*)/.exec(url) || [, '?'])[1].replace(/\+/g, ' ').slice(0, 38);
    const cutAt = truncatedBy(url);
    check(!cutAt, `sendable: ${name}`, cutAt ? `${JSON.stringify(cutAt.ch)} at ${cutAt.at}` : '');
    check(markdownEaten(url) === url, `survives a markdown chat UI: ${name}`);
    check(url.length < 2000, `under 2000 chars: ${name}`, `${url.length}`);

    // and every row on the card it draws has to come to something
    const d = parse(url.slice(url.indexOf('#')));
    check(d.problems.length === 0, `card is not refused: ${name}`, d.problems.join(', '));
    const dashes = [];
    d.blocks.forEach(b => {
      (b.computed || []).forEach(c => { if (c.label && c.value === null) dashes.push(c.label); });
      (b.decided || []).forEach(c => { if (c.label && !c.text) dashes.push(c.label); });
    });
    check(dashes.length === 0, `every row computes: ${name}`, dashes.join(', '));

    /* And the example has to be what the rule would have produced. A model
       copies the example and skims the rule, so an example that does not obey
       its own spec teaches the wrong thing louder than the spec teaches the
       right one - which is exactly how `>` survived in one example and not
       the other for as long as it did. */
    (url.split('#')[1] || '').split('&').forEach(pair => {
      const i = pair.indexOf('=');
      const k = pair.slice(0, i), v = pair.slice(i + 1);
      if (!'ahvmdgpo'.includes(k)) return;          // prose keys, no sub-fields
      const plain = decodeURIComponent(v.replace(/\+/g, ' '));
      check(encodeWording(plain) === v, `${k}= obeys the encoding rule: ${name}`,
        encodeWording(plain) === v ? '' : `is ${v.slice(0, 40)}, rule says ${encodeWording(plain).slice(0, 40)}`);
    });
  });
  console.log(`  ${urls.length} live URLs checked`);
}

/* ---- the prompt's examples as working tools ---- */
function sweepPromptBehavior() {
  console.log('\nprompt examples after reader changes');
  const spec = fs.readFileSync(path.join(ROOT, 'llms.txt'), 'utf8');
  const cards = (spec.match(/https:\/\/upshot\.fyi\/v2\/#\S+/g) || []).map(url => {
    const hash = url.slice(url.indexOf('#'));
    return {hash, scope: parse(hash).a};
  });
  // Read the actual examples, not duplicate URLs that could drift away from
  // what models see. These expected amounts exercise units and live controls.
  const scenarios = [
    ['Splitting dinner three ways', '', ['£26.67'], []],
    ['Splitting dinner three ways', '&w=80/4', ['£20'], []],
    ['How long the card takes to clear', '', ['61 months'], []],
    ['The most I can offer on the renovation', '&w=500000/8/80000/70000', ['£40,000', '£310,000'], []],
    ['Whether my savings meet my runway target', '', ['8.18 months'], ['Below target']],
    ['Whether my savings meet my runway target', '&w=18000/2200/6', ['8.18 months'], ['Target met']],
    ['Preparing the three items required for our handover', '', ['0%'], ['Tasks remaining']],
    ['Preparing the three items required for our handover', '&k=111', ['100%'], ['All three complete']],
    ['What the quoted hosting plans cost for our team', '', ['£24'], []],
    ['What the quoted hosting plans cost for our team', '&x=1&w=6', ['£72'], []],
    ['What the workshop costs with optional extras', '', ['£40', '£40'], []],
    ['What the workshop costs with optional extras', '&k=11&w=2', ['£60', '£120'], []],
    ['A tool to compare driving and taking the train', '', ['£50', '£60', '£10'], ['Drive']],
    ['A tool to compare driving and taking the train', '&w=40/10/30/1', ['£50', '£30', '£20'], ['Train']],
    ['A tool to compare driving and taking the train', '&w=40/10/25/2', ['£50', '£50', '£0'], ['Same cost']]
  ];
  for (const [scope, state, values, decisions] of scenarios) {
    const card = cards.find(c => c.scope === scope);
    if (!card) { check(false, `missing prompt example: ${scope}`); continue; }
    const d = parse(state ? stamp(card.hash + state) : card.hash);
    const actualValues = d.blocks.flatMap(b => b.computed || [])
      .filter(r => r.label).map(r => withUnit(r.value, r.unit));
    const actualDecisions = d.blocks.flatMap(b => b.decided || []).map(r => r.text);
    const ok = !d.problems.length && JSON.stringify(actualValues) === JSON.stringify(values) &&
      JSON.stringify(actualDecisions) === JSON.stringify(decisions);
    check(ok, `${scope}${state || ' (initial)'}`,
      ok ? '' : `got ${JSON.stringify([actualValues, actualDecisions])}, wanted ${JSON.stringify([values, decisions])}`);
  }
  console.log(`  ${scenarios.length} initial and changed states checked`);
}

function sweepBatchScoring() {
  console.log('\nthe model-link scorer');
  const {spawnSync} = require('child_process');
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'upshot-score-'));
  const file = path.join(dir, 'links.txt');
  const valid = 'https://upshot.fyi/v2/#a=A&h=H&v=V&m=Test&d=2026-09-16&g=Split&i=n:2:People&r=each:20/n:Each';
  const cases = [
    ['valid card', valid, 0, '1/1 valid first render'],
    ['equality decision', valid + '&t=Equal:n==2:Yes&t=Equal::No', 0, '1/1 valid first render'],
    ['duplicate name', valid + '&i=n:3:More', 1, 'renderer refuses:'],
    ['invalid start', valid.replace('n:2:People', 'n:abc:People'), 1, 'renderer refuses:'],
    ['old result syntax', valid.replace('r=each:20/n:Each', 'r=Each:20/n'), 1, 'syntax outside the prompt grammar'],
    ['space in returned URL', valid + '&p=hello world', 1, 'unsendable:']
  ];
  try {
    for (const [label, url, status, message] of cases) {
      fs.writeFileSync(file, url + '\n');
      const result = spawnSync(process.execPath, [__filename, file], {encoding: 'utf8'});
      check(result.status === status && (result.stdout || '').includes(message),
        `scorer: ${label}`, result.status === status ? '' : result.stdout + result.stderr);
    }
  } finally {
    if (fs.existsSync(file)) fs.unlinkSync(file);
    fs.rmdirSync(dir);
  }
  console.log(`  ${cases.length} scoring cases checked`);
}

/* ---- the evaluator against plain arithmetic ---- */
function sweepFormulas() {
  console.log('\nformulas against a reference');
  // deterministic, so a failure is reproducible rather than a rumour
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const pick = a => a[Math.floor(rnd() * a.length) % a.length];

  const NAMES = {a: 7, b: 3, c: 12, d: 0.5};
  function gen(depth) {
    if (depth <= 0 || rnd() < 0.3) {
      return rnd() < 0.5 ? String(Math.floor(rnd() * 100)) : pick(Object.keys(NAMES));
    }
    const kind = rnd();
    if (kind < 0.16) return `round(${gen(depth - 1)})`;
    if (kind < 0.24) return `min(${gen(depth - 1)},${gen(depth - 1)})`;
    if (kind < 0.32) return `max(${gen(depth - 1)},${gen(depth - 1)})`;
    if (kind < 0.40) return `abs(${gen(depth - 1)})`;
    return `(${gen(depth - 1)}${pick(['+', '-', '*', '/'])}${gen(depth - 1)})`;
  }

  let n = 0, mismatch = 0, unsendable = 0;
  for (let i = 0; i < 4000; i++) {
    const f = gen(3);
    // the reference: the same arithmetic, worked out by JS itself
    let want;
    try {
      want = new Function(...Object.keys(NAMES),
        'const round=x=>Math.round(x),min=Math.min,max=Math.max,abs=Math.abs;' +
        'return ' + f + ';')(...Object.values(NAMES));
    } catch (e) { continue; }
    if (!isFinite(want)) continue;
    n++;

    // and through the transport, written exactly as a model is told to write it
    const hash = '#a=A&h=H&v=V&m=M&d=2026-01-01&g=G' +
      Object.keys(NAMES).map(k =>
        `&i=${k}:${String(NAMES[k]).replace('.', '%2E')}:${k}`).join('') +
      `&r=:${encodeFormula(f)}:X`;
    const url = 'https://upshot.fyi/v2/' + hash;
    if (truncatedBy(url) || markdownEaten(url) !== url) {
      unsendable++;
      check(false, `formula cannot be sent: ${f}`);
      continue;
    }
    const got = parse(hash).blocks.find(b => b.type === 'r').computed[0].value;
    if (got === null || Math.abs(got - want) > 1e-9) {
      mismatch++;
      if (mismatch <= 5) check(false, `formula disagrees: ${f}`, `card ${got}, reference ${want}`);
    }
  }
  if (mismatch > 5) check(false, `...and ${mismatch - 5} more formula disagreements`);
  console.log(`  ${n} generated formulas, ${unsendable} unsendable, ${mismatch} disagreeing`);
  if (!unsendable && !mismatch) console.log('  ok    the card agrees with plain arithmetic, every time');
}

/* ---- the colon, which is data and syntax at once ---- */
function sweepColons() {
  console.log('\ncolons where the spec allows them');
  const F = '#a=A&h=H&v=V&m=M&d=2026-01-01&g=G';
  // where a colon must survive, because the spec says it does
  const safe = [
    ['p  bullet', F + '&p=Bring+ID:+passport', d => d.blocks[0].items[0], 'Bring ID: passport'],
    ['o  step', F + '&o=Be+there+by+9:30', d => d.blocks[0].items[0], 'Be there by 9:30'],
    ['f  value', F + '&f=Meet:9:30am', d => fields(d.blocks[0].items[0], 2)[1], '9:30am'],
    ['c  item', F + '&c=:Be+there+by+9:30',
      d => checkField(d.blocks[0].items[0]).label, 'Be there by 9:30']
  ];
  safe.forEach(([name, hash, read, want]) => {
    let got; try { got = read(parse(hash)); } catch (e) { got = 'threw'; }
    check(got === want, `colon survives in ${name}`,
      got === want ? '' : `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
  });

  /* And that encoding it changes nothing - which is why the spec stopped
     telling anyone to. If these two ever diverge, %3A has become meaningful
     and the Encoding section owes the reader a sentence about it. */
  const plain = parse(F + '&p=Bring+ID:+passport').blocks[0].items[0];
  const coded = parse(F + '&p=Bring+ID%3A+passport').blocks[0].items[0];
  check(plain === coded, 'a colon and %3A are the same character to the card',
    plain === coded ? '' : `${JSON.stringify(plain)} vs ${JSON.stringify(coded)}`);
  console.log(`  ${safe.length + 1} checks`);
}

/* ---- pick-one ----
   The exclusive cell of the grid: unknown to the conversation, editable by the
   reader, and one of N rather than any of N. A checklist cannot express it -
   nothing stops a reader ticking three plans - which is the whole reason the
   key exists, so these check the meaning rather than the drawing. */
function sweepPicks() {
  console.log('\npick-one');
  const F = '#a=A&h=H&v=V&m=M&d=2026-01-01&g=G';
  const PLANS = '&s=thr:26900:Plan+1&s=thr:29385:Plan+2&s=thr:33795:Plan+4';
  const SUM = '&i=salary:40000:Salary&r=:max(0,salary-thr)*0.09:Repay';
  const repay = hash => {
    const d = parse(stamp(hash));
    const r = d.blocks.find(b => b.type === 'r');
    const row = r && r.computed.find(c => c.label === 'Repay');
    return row ? row.value : null;
  };
  const near = (a, b) => a !== null && Math.abs(a - b) < 0.005;

  /* The card has to be good before anyone touches it, so a group is not
     unanswered on arrival - it stands on its first option. */
  check(near(repay(F + PLANS + SUM), 1179), 'a group stands on its first option',
    'got ' + repay(F + PLANS + SUM) + ', wanted 1179 (40000-26900 at 9%)');

  // the name holds the chosen option's VALUE - which is the entire point
  check(near(repay(F + PLANS + SUM + '&x=1'), 955.35),
    'choosing another option moves every formula that reads the name',
    'got ' + repay(F + PLANS + SUM + '&x=1') + ', wanted 955.35');
  check(near(repay(F + PLANS + SUM + '&x=2'), 558.45),
    'and the third is the third, not the last',
    'got ' + repay(F + PLANS + SUM + '&x=2'));

  /* An index from a truncated or hand-edited link cannot be allowed to leave
     the group answering nothing - it falls back to the default rather than
     dashing every row below it. */
  [['&x=9', 'past the end'], ['&x=-1', 'negative'], ['&x=plan2', 'not a number'],
   ['&x=', 'empty'], ['&x=/1', 'blank in its own slot']].forEach(([tail, what]) => {
    check(near(repay(F + PLANS + SUM + tail), 1179),
      'a chosen index that is ' + what + ' falls back to the first',
      'got ' + repay(F + PLANS + SUM + tail));
  });

  /* A link carrying more slots than the card has groups is not corrupt - a
     model that trimmed a group, or a reader who kept an older link, must not
     have the remaining group shifted out from under them. */
  check(near(repay(F + PLANS + SUM + '&x=1/9/9'), 955.35),
    'slots past the last group are ignored rather than shifting it',
    'got ' + repay(F + PLANS + SUM + '&x=1/9/9') + ', wanted 955.35');

  // exactly one option carries the choice, structurally - never two, never none
  [undefined, '&x=0', '&x=2', '&x=9'].forEach(tail => {
    const d = parse(F + PLANS + SUM + (tail || ''));
    const on = d.blocks.find(b => b.type === 's').options.filter(o => o.on).length;
    check(on === 1, 'exactly one option is chosen' + (tail ? ' at ' + tail : ' by default'),
      on + ' of them');
  });

  /* Two groups are told apart by name, not by position or by block - the same
     way a repeated key beats a separator everywhere else in the grammar. */
  const TWO = F + '&s=one:1:A&s=one:2:B&s=two:10:X&s=two:20:Y&r=:one+two:Sum';
  const sum = hash => {
    const r = parse(stamp(hash)).blocks.find(b => b.type === 'r');
    const row = r && r.computed.find(c => c.label === 'Sum');
    return row ? row.value : null;
  };
  check(sum(TWO) === 11, 'two groups each stand on their own first option', 'got ' + sum(TWO));
  check(sum(TWO + '&x=1/1') === 22, 'and each follows its own slot in x=', 'got ' + sum(TWO + '&x=1/1'));
  check(sum(TWO + '&x=0/1') === 21, 'so one can move without the other', 'got ' + sum(TWO + '&x=0/1'));

  /* A group is a name, not a run of lines - it survives being split across
     blocks, which is what stops the reader ticking a plan in one block and a
     contradicting one in another. */
  const SPLIT = '#a=A&h=H&v=V&m=M&d=2026-01-01&g=One&s=n:1:A&g=Two&s=n:2:B&g=Sum&r=:n:V';
  const val = hash => {
    const r = parse(stamp(hash)).blocks.find(b => b.type === 'r');
    const row = r && (r.computed || []).find(c => c.label === 'V');
    return row ? row.value : null;
  };
  check(val(SPLIT) === 1, 'one name split across blocks is still one group', 'got ' + val(SPLIT));
  check(val(SPLIT + '&x=1') === 2, 'and one x= slot still covers it', 'got ' + val(SPLIT + '&x=1'));
  const spread = parse(SPLIT);
  const chosen = spread.blocks.filter(b => b.type === 's')
    .reduce((n, b) => n + b.options.filter(o => o.on).length, 0);
  check(chosen === 1, 'with exactly one option chosen across both blocks', chosen + ' chosen');

  const claimed = parse('#a=A&h=H&v=V&m=M&d=2026-01-01&g=G&i=n:5:Threshold&s=n:99:Plan&g=S&r=:n:V');
  check(claimed.problems.length > 0, 'a pick-one cannot claim an input name');

  const invalid = parse('#a=A&h=H&v=V&m=M&d=2026-01-01&g=G&s=n:free:Free&r=:n:V');
  check(invalid.problems.length > 0, 'an option whose value is not a number is refused');

  // wording is wording: an encoded colon survives in a label the way it does
  // in a bullet, and the field separators are untouched by it
  const colon = parse(F + '&s=n:1:Be+there+by+9%3A30');
  check(colon.blocks[0].options[0].label === 'Be there by 9:30',
    'an encoded colon survives in an option label',
    JSON.stringify(colon.blocks[0].options[0].label));
  check(colon.blocks[0].options[0].value === 1 && colon.blocks[0].options[0].name === 'n',
    'and the fields around it still come apart correctly');

  /* A box and a pick-one on one card read from different state strings, so
     ticking the box must not disturb the choice or the other way round. */
  const mixed = parse(stamp('#a=A&h=H&v=V&m=M&d=2026-01-01&g=G&c=one:One&c=two:Two&s=n:1:A&s=n:2:B' +
    '&r=b:one+two:Boxes&r=t:n:Pick&k=10&x=1'));
  const rows = mixed.blocks.find(b => b.type === 'r').computed;
  const box = rows.find(c => c.label === 'Boxes'), tk = rows.find(c => c.label === 'Pick');
  check(box && box.value === 1, 'a named box reads its own tick', box && 'boxes came to ' + box.value);
  check(tk && tk.value === 2, 'and the pick-one reads its own choice', tk && 'pick came to ' + tk.value);

  // A choice needs a group name because that is what enforces exclusivity and
  // gives formulas access to the selected numeric value.
  const bare = parse(F + '&s=:1:Yes&s=:0:No');
  check(bare.problems.length > 0, 'options with no name are refused');

  console.log('  ' + 26 + ' checks');
}

/* ---- one shared name, claimed twice ----
   Every i=, named c= and named r= lives in one namespace.
   Nothing in the spec stops a model reusing a name - it only asks it not
   to - so the card has to survive the reuse itself. Found 13 Sep 2026: an
   i= reused as an r='s own name silently rewired every formula after it,
   because the later write won. First claim now wins everywhere; a later
   write with the same name is dropped rather than rebinding what already
   reads it. */
function sweepNamespace() {
  console.log('\none name, claimed twice');
  const F = '#a=A&h=H&v=V&m=M&d=2026-01-01&g=G';

  // Reusing a name is structurally ambiguous and refuses the whole card.
  const d1 = parse(F + '&i=seats:4:Seats&r=seats:seats*2:Double&r=:seats+1:Check');
  check(d1.problems.length > 0, 'a result cannot rename the input it was named after');

  // a result named "pi" must not redefine the constant every formula can read
  const d2 = parse('#a=A&h=H&v=V&m=M&d=2026-01-01&g=G&i=r:2:Radius' +
    '&r=pi:3:Pi&r=area:pi*r*r:Area');
  check(d2.problems.length > 0, 'a result cannot rename the reserved pi');
  console.log('  2 checks');
}

/* Every card URL the project ships, wherever it lives. The homepage writes
   its links as HTML so its separators arrive as &amp;, and a raw ... is an
   elision in prose rather than anything a card carries. */
function shippedURLs() {
  const out = [];
  ['llms.txt', 'index.html', 'README.md', 'made/index.html'].forEach(f => {
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
    [...text.matchAll(/\/v2\/#([^\s"'<>)\]]+)/g)].forEach(m => {
      const hash = m[1].replace(/&amp;/g, '&');
      if (hash.includes('...')) return;
      const url = 'https://upshot.fyi/v2/#' + hash;
      if (out.indexOf(url) < 0) out.push(url);
    });
  });
  return out;
}

/* ---- the alphabet a card URL is allowed to use ----
   The encoding rule is a whitelist - keep letters, digits and a hyphen, encode
   everything else - so a character nobody thought about is safe by default.
   That is the only defence that scales, because the set of characters in the
   world cannot be enumerated and the set of chat clients cannot either.

   But the sweep above enumerates: 103 characters in 10 fields. A whitelist
   rule checked with a blacklist-shaped test can only ever prove what somebody
   listed. So this asserts the rule itself instead - that nothing outside the
   alphabet ever reaches a URL - which covers every character that exists,
   including the ones invented next year.

   It runs over everything the project ships, index.html included. Nothing
   checked the homepage's own demos before, and on 15 Sep 2026 two of them
   carried a raw full stop in 4.5 - which WhatsApp cuts the link at, and which
   the spec has forbidden in writing the whole time. */
const ALPHABET = /^[A-Za-z0-9%+&=:_\/-]*$/;

function sweepAlphabet() {
  console.log('\nthe alphabet of a card URL');
  const urls = shippedURLs();
  urls.forEach(url => {
    const hash = url.slice(url.indexOf('#') + 1);
    const strays = [...new Set(hash.replace(/[A-Za-z0-9%+&=:_\/-]/g, ''))];
    check(ALPHABET.test(hash), hash.slice(0, 34),
      strays.length ? `carries ${JSON.stringify(strays.join(''))}` : '');
  });
  console.log(`  ${urls.length} checks`);
}

/* ---- the printed working must reproduce the answer ----
   A stated principle of the format that had no test until 15 Sep 2026, and
   was broken when it got one. A compound growth step held 1.9991314; the
   working printed round(14000*2), which recomputes to 28,000 beside an answer
   reading 27,988. The card was right and its own working said otherwise,
   which is worse than showing no working at all.

   This is invariant 4 from LANGUAGE.md. It is cheap, and it caught a real bug
   that every structural check passed - the scorer cannot see a wrong number. */
function sweepWorking() {
  console.log('\nthe working reproduces the answer');
  const A = '#a=A&h=H&v=V&m=M&d=2026-01-01&g=G';
  const ev = mod.exports.evaluate;
  let n = 0;

  // each of these cites a NAMED step, which is where the rounding used to bite
  const cards = [
    ['compound growth', '&i=pot:14000:Pot&i=rate:6%2E5:Rate&i=yrs:11:Years' +
      '&r=growth:exp(yrs*ln(1+rate/100)):Multiplier' +
      '&r=:round(pot*growth):Worth'],
    ['a third, which never ends', '&i=n:100:N&r=third:n/3:Third&r=:third*3:Back'],
    ['a long division', '&i=n:18000:N&i=b:2200:B&r=m:n/b:Runway&r=:m*12:Over+a+year'],
    ['a tiny rate', '&i=apr:7:Apr&r=d:apr/100/365:Daily&r=:d*1000000:On+a+million'],
    ['a square root', '&i=n:2:N&r=root:sqrt(n):Root&r=:root*root:Squared'],
    ['a clock that wraps', '&i=h:26:H&r=w:mod(h,24):Wrapped&r=:w+24:Same+time+tomorrow']
  ];

  cards.forEach(function(pair){
    const name = pair[0], tail = pair[1];
    parse(A + tail).blocks.forEach(b => (b.computed || []).forEach(c => {
      if (!c.label || !c.expr || c.value === null) return;
      // the working as a reader would retype it. A comma between a digit and
      // exactly three more is a thousands separator and goes; any other comma
      // is separating a function's arguments and stays.
      const again = ev(c.expr.replace(/(\d),(?=\d{3}(?!\d))/g, '$1'), {});
      const want = showNumber(c.value);
      const got = again === null ? 'could not be recomputed' : showNumber(again);
      n++;
      check(got === want, `${name}: "${c.label}"`,
        got === want ? '' : `shows ${want}, working "${c.expr}" gives ${got}`);
    }));
  });
  console.log(`  ${n} checks`);
}

/* ---- what the card refuses to draw ----
   All of these rendered before, and rendered wrongly: a duplicate name drew a
   control no formula read, a non-numeric start computed as zero. A dash is for
   a question that cannot be answered; this is a card that does not make
   sense, and there is no honest way to draw part of it. */
function sweepRefusals() {
  console.log('\nrefusals');
  const before = checks;
  const A = '#a=A&h=H&v=V&m=M&d=2026-01-01&g=G';
  const bad = (hash, name) => {
    const p = parse(A + hash).problems;
    check(p.length > 0, name, p.length ? '' : 'drew the card anyway');
  };
  const fine = (hash, name) => {
    const p = parse(A + hash).problems;
    check(p.length === 0, name, p.length ? `refused: ${p.join('. ')}` : '');
  };

  bad('&i=n:1:One&i=n:2:Two', 'a name claimed by two inputs');
  bad('&i=n:1:One&r=n:1:Two', 'a name claimed by an input and a result');
  bad('&c=n:One&i=n:1:Two', 'a name claimed by a box and an input');
  bad('&i=pi:1:One', 'an input called pi');
  // boxes is NOT reserved: a moving-boxes card wants to call its result boxes
  fine('&i=rooms:3:Rooms&r=boxes:rooms*8:Boxes', 'a result called boxes, which a moving card needs');
  // e is NOT reserved: two real generations used it for energy, which is what
  // e is for in any physics card, and exp(1) costs nothing to write instead
  fine('&i=e:1:Energy&r=:e*2:Out', 'an input called e, which physics cards need');
  fine('&i=mass:5%2E972e24:Mass+kg', 'a start value in scientific notation');
  bad('&i=mass:80kg:Mass', 'a start value with a unit stuck to it');
  bad('&i=n:abc:One', 'an input that does not start at a number');
  bad('&i=n::One', 'an input with no start value');
  bad('&s=n:£6:One', 'a pick-one value with a currency symbol');
  bad('&s=n:6kg:One', 'a pick-one value with a numeric prefix');
  bad('&i=Annual%20salary:1:One', 'an input with an invalid name');
  bad('&c=a-b:One', 'a box with an invalid name');
  bad('&r=1n:1:One', 'a result with an invalid name');
  bad('&r=x:n%3E3%3F100%3A0:Bonus', 'a ternary outside the formula grammar');
  bad('&i=n:1:N&t=:n%3E0:Yes', 'a decision with no label');
  bad('&h=Again', 'a headline written twice');
  bad('&d=2026-01-02', 'a date written twice');
  bad('&i=n:1:N&t=V::No&t=V:n%3E0:Yes', 'a decision fallback that is not last');
  bad('&u=n:£', 'a unit for a name nothing declares');
  bad('&i=n:1:One&u=n:£&u=n:$', 'a unit declared twice');

  // the things that must still be allowed
  fine('&i=n:1:One&i=m:2:Two', 'two inputs with different names');
  fine('&s=thr:1:A&s=thr:2:B', 'a pick-one group sharing one name, which is the point');
  fine('&i=n:-1%2E5:One', 'a negative decimal start');
  fine('&r=:1+1:Sum', 'a result with no name');
  fine('&c=:One&c=:Two', 'boxes with no names');
  fine('&i=n:1:One&u=n:£', 'a unit for a name that exists');

  console.log(`  ${checks - before} checks`);
}

/* ---- units ----
   Every numeric card used to smuggle its unit into the label and print its
   answer bare, so "Payment 222" never said of what. And 5.64 hours printed
   5.64, which was the oldest soft spot in the format. */
function sweepUnits() {
  console.log('\nunits');
  const A = '#a=A&h=H&v=V&m=M&d=2026-01-01&g=G';
  const drawn = (hash, label) => {
    const d = parse(A + hash);
    const row = d.blocks.flatMap(b => b.computed || []).find(c => c.label === label);
    return row ? withUnit(row.value, row.unit) : 'no such row';
  };
  const is = (got, want, name) => check(got === want, name,
    got === want ? '' : `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);

  is(drawn('&i=n:222:N&r=pay:n:Payment&u=pay:£', 'Payment'), '£222',
    'money leads the number');
  is(drawn('&i=n:17:N&r=off:n:Off&u=off:%', 'Off'), '17%', 'a percentage trails it');
  is(drawn('&i=n:42:N&r=size:n:Bundle&u=size:kb', 'Bundle'), '42kb',
    'free text trails it, because kb is in no closed list');
  is(drawn('&i=n:222:N&r=pay:n:Payment', 'Payment'), '222',
    'no unit declared, no unit drawn');

  // the 5.64 soft spot
  is(drawn('&i=n:5%2E64:N&r=t:n:Took&u=t:hr', 'Took'), '5h 38m',
    '5.64 hours reads 5h 38m');
  is(drawn('&i=n:5:N&r=t:n:Took&u=t:hr', 'Took'), '5h 0m', 'a whole number of hours');
  is(drawn('&i=n:0%2E5:N&r=t:n:Took&u=t:min', 'Took'), '0m 30s', 'half a minute');
  // 59.6 minutes must not read 0:60
  is(drawn('&i=n:0%2E993:N&r=t:n:Took&u=t:hr', 'Took'), '1h 0m',
    'a fraction that rounds up carries into the whole');

  // a dash has no unit to wear
  is(drawn('&r=x:nope:Out&u=x:£', 'Out'), '\u2014', 'a dash stays a dash');

  /* Money with a fraction takes both places or neither. Trailing zeros are
     trimmed everywhere else because 5.10 is false precision, but £9.5 reads
     as a typo and £12,232.4 is worse. Found in the first real corpus run,
     where a card split £38 four ways and drew £9.5. */
  is(drawn('&i=n:38:N&r=each:n/4:Each&u=each:£', 'Each'), '£9.50',
    'money takes both decimal places');
  is(drawn('&i=n:38:N&r=each:n:Each&u=each:£', 'Each'), '£38',
    'and whole pounds stay whole');
  is(drawn('&i=n:9%2E05:N&r=each:n:Each&u=each:£', 'Each'), '£9.05',
    'a value already at two places is left alone');
  is(drawn('&i=n:-3%2E5:N&r=each:n:Each&u=each:£', 'Each'), '-£3.50',
    'the sign goes outside the symbol');
  is(drawn('&i=n:12232%2E4:N&r=each:n:Each&u=each:£', 'Each'), '£12,232.40',
    'grouping and the second place together');
  is(drawn('&i=n:9%2E999:N&r=each:n:Each&u=each:£', 'Each'), '£10',
    'a fraction that rounds away leaves a whole number whole');

  is(drawn('&i=n:-2:N&r=t:n:Owed&u=t:hr', 'Owed'), '-2h 0m',
    'a negative duration keeps its sign and explicit units');

  console.log('  16 checks');
}

/* ---- the functions that were missing ----
   ln could say how long something takes; nothing could say what it grows to,
   because ln had no inverse. And a chained comparison drew a dash, which was
   honest but not enough - a model writes 18<=age<65. */
function sweepFunctions() {
  console.log('\nfunctions and chained comparison');
  const before = checks;
  const ev = mod.exports.evaluate;
  const is = (expr, env, want, name) => {
    const got = ev(expr, env || {});
    check(got === want, name || expr,
      got === want ? '' : `got ${got}, wanted ${want}`);
  };

  is('exp(1)', {}, Math.E, 'exp');
  is('pi', {}, Math.PI, 'pi is a constant, not a call');
  is('round(exp(ln(2)))', {}, 2, 'exp undoes ln');
  is('6.674e-11', {}, 6.674e-11, 'scientific notation in a formula literal');
  // the thing that was unreachable: what a rate compounds to
  is('round(1000*exp(5*ln(1+0%2E07)))'.replace(/%2E/g, '.'), {}, 1403,
    'compound growth is expressible at last');

  // a chain means both comparisons, as it does in English and in maths -
  // not (18<=age) compared to 65, which is what C would say
  is('18<=age<65', {age: 30}, 1, 'inside the range');
  is('18<=age<65', {age: 70}, 0, 'above the range');
  is('18<=age<65', {age: 10}, 0, 'below the range');
  is('1<2<3<4<5', {}, 1, 'a long chain');
  is('1<2<1', {}, 0, 'a chain that fails at the end');
  is('a<b', {a: 1, b: 2}, 1, 'a single comparison still works');

  // a card cannot claim a constant out from under a formula
  const d = parse('#a=A&h=H&v=V&m=M&d=2026-01-01&g=G&i=pi:9:Pi&r=:pi:Out');
  check(d.problems.length > 0, 'an input cannot shadow pi');

  const namedMin = parse('#a=A&h=H&v=V&m=M&d=2026-01-01&g=G&i=min:5:Minimum&i=b:9:B&r=x:min(b%2C20):Out');
  const minRow = namedMin.blocks.flatMap(b => b.computed || []).find(c => c.label === 'Out');
  check(minRow && minRow.value === 9 && minRow.expr === 'min(9,20)',
    'a variable named min does not replace the min function in working',
    minRow ? `${minRow.value} = ${minRow.expr}` : 'no Out row');

  console.log(`  ${checks - before} checks`);
}

/* ---- results resolve by need, not by document order ----
   A formula citing a step written below it used to draw a dash, which
   punished the way people actually write: the headline number first, its
   workings underneath. Order now carries no meaning, and the only thing that
   cannot be resolved is a genuine loop. */
function sweepOrder() {
  console.log('\nresults in any order');
  const F = '#a=A&h=H&v=V&m=M&d=2026-01-01&g=G&i=n:10:N';
  const val = (hash, label) => {
    const d = parse(stamp(F + hash));
    const all = d.blocks.flatMap(b => b.computed || []);
    const row = all.find(c => c.label === label);
    return row ? row.value : 'no such row';
  };

  // the workings below the answer, which is the case that used to dash
  check(val('&r=:mo*12:Year&r=mo:n*2:Month', 'Year') === 240,
    'a result may cite a step written below it',
    `Year came to ${val('&r=:mo*12:Year&r=mo:n*2:Month', 'Year')}`);

  // and the same card the other way round still works
  check(val('&r=mo:n*2:Month&r=:mo*12:Year', 'Year') === 240,
    'and the same card written the other way round agrees');

  // three deep, shuffled, to prove it is a graph and not one extra pass
  check(val('&r=:c*2:Out&r=c:b+1:C&r=b:a*3:B&r=a:n:A', 'Out') === 62,
    'a chain resolves however it is shuffled',
    `Out came to ${val('&r=:c*2:Out&r=c:b+1:C&r=b:a*3:B&r=a:n:A', 'Out')}`);

  // a name defined nowhere is absent, not pending - it must not look like a
  // loop, or a typo would hang every row on the card
  check(val('&r=:nope*2:Out', 'Out') === null,
    'a name defined nowhere draws a dash');
  check(val('&r=:nope*2:Out&r=x:n:X', 'X') === 10,
    'and it does not stop the rest of the card resolving');

  // a genuine loop is the one thing that cannot resolve
  check(val('&r=a:b+1:A&r=b:a+1:B', 'A') === null,
    'a cycle draws a dash');
  check(val('&r=a:b+1:A&r=b:a+1:B&r=:n*2:Fine', 'Fine') === 20,
    'and a cycle does not take the rest of the card with it');
  check(val('&r=a:a+1:A', 'A') === null, 'a row citing itself draws a dash');

  console.log('  8 checks');
}

/* ---- the decision cascade ----
   t= is Label:Condition:Wording, rows sharing a label are one decision, and
   the first true condition wins. Three fields rather than four puts the
   wording last, so the key that used to be the most fragile to parse is now
   one of the safest.

   Two rules carry the weight, and both are about refusing to answer. A
   condition with no comparator can never decide, whatever shifted into it -
   found 13 Sep 2026, when a bare number in that slot was truthy-coerced into
   a real-looking branch. And a condition that cannot be worked out dashes the
   whole decision rather than falling through, because falling through treats
   unknown as false and prints a later outcome with full authority. */
function sweepDecisions() {
  console.log('\nthe decision cascade');
  const before = checks;
  // n is a parameter, not a constant - the first claim on a name wins, so a
  // second i= appended to the same card cannot override the first
  const card = (n, hash) => '#a=A&h=H&v=V&m=M&d=2026-01-01&g=G&i=n:' + n + ':N' + hash;
  const dec = (n, hash, at) => parse(card(n, hash)).blocks.find(b => b.type === 't').decided[at || 0];
  const is = (got, want, name) => check(got === want, name,
    got === want ? '' : `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
  const bad = (hash, name) => {
    const problems = parse(card(1, hash)).problems;
    check(problems.length > 0, name, problems.length ? '' : 'drew the card anyway');
  };

  // the wall this key was rebuilt for: three outcomes, which four positional
  // fields could not say, so a live generation invented syntax instead
  const THREE = '&t=Threat:n%3E=80:Do+not+negotiate' +
                '&t=Threat:n%3E=40:Snacks+may+help' +
                '&t=Threat::Suspiciously+reasonable';
  is(dec(1, THREE).text, 'Suspiciously reasonable', 'nothing true falls through to the fallback');
  is(dec(50, THREE).text, 'Snacks may help', 'the first true row wins, not the last');
  is(dec(90, THREE).text, 'Do not negotiate', 'an earlier row beats a later one');

  // binary is just two rows, and needs no special case
  is(dec(1, '&t=Real:n%3E0:Yes&t=Real::No').text, 'Yes', 'binary is two rows');
  is(dec(-1, '&t=Real:n%3E0:Yes&t=Real::No').text, 'No', 'and the other way');

  bad('&t=Weird:5:Yes', 'a bare number is refused as a decision condition');
  is(dec(1, '&t=Gone:missing%3E0:Yes').text, '', 'an unworkable condition dashes');
  is(dec(1, '&t=Gone:missing%3E0:Yes&t=Gone::No').text, '',
     'an unworkable condition dashes rather than falling through to the fallback');

  bad('&t=Bad::Fallback&t=Bad:n%3E0:Yes', 'a fallback out of place is refused');

  // rows sharing a label are ONE decision, so the card draws one row
  const all = parse(card(1, THREE)).blocks.find(b => b.type === 't').decided;
  check(all.length === 1, 'three rows sharing a label draw one decision',
    all.length === 1 ? '' : `drew ${all.length} rows`);

  // and two labels are two decisions, in the order they appear
  const two = parse(card(1, '&t=One:n%3E0:A&t=Two:n%3C0:B')).blocks.find(b => b.type === 't').decided;
  check(two.length === 2 && two[0].label === 'One' && two[1].label === 'Two',
    'two labels are two decisions, in order',
    `drew ${JSON.stringify(two.map(d => d.label))}`);

  console.log(`  ${checks - before} checks`);
}

/* ---- scoring a batch of real generations ----
   node test/transport.js links.txt

   The point of the file: a link has to be scored as text, exactly as it left
   the model. Opening it in a browser proves nothing, because the address bar
   is not the channel - it never truncates, never renders markdown, and is
   blind to every failure this file exists to catch. */
/* ---- invented syntax ----
   A separate count from validity, and the more valuable one.

   A card that fails to render tells you a model got the spec wrong. A card
   where a model wrote something the grammar does not HAVE tells you the
   grammar is missing something - it wanted to say a thing, found no way to
   say it, and made one up. That is how the t= wall was found: a live
   generation wanted a three-way threshold, had only two slots, and chained a
   second condition into the false one, printing spec syntax at a reader.

   A rising count here names the next missing primitive without anyone
   reasoning about it. Read the examples, not just the number: one invention
   turning up again and again is a feature request. Lots of different ones
   mean the vocabulary is too weak. */
const KEYS = 'a h v m d g p o c s f i r t u k w x'.split(' ');
const FUNCTIONS = 'min max round abs sqrt pow floor ceil ln exp mod'.split(' ');
const CONSTANTS = ['pi'];
const FIELD_COUNT = {f: 2, c: 2, i: 3, s: 3, r: 3, t: 3, u: 2};

function inventedSyntax(url) {
  const found = [];
  const hash = url.slice(url.indexOf('#') + 1);

  hash.split('&').forEach(pair => {
    if (!pair) return;
    const eq = pair.indexOf('=');
    if (eq < 0) { found.push(`"${pair.slice(0, 24)}" is not a key=value at all`); return; }
    const k = pair.slice(0, eq);
    const v = pair.slice(eq + 1).replace(/%3A/gi, '\u0001');

    if (KEYS.indexOf(k) < 0) { found.push(`a key the grammar does not have: ${k}=`); return; }

    // a key written with the wrong number of fields is usually an older or
    // imagined shape of it - a four-field t= is the one that started this
    const want = FIELD_COUNT[k];
    if (want) {
      const got = v.split(':').length;
      if (got > want) found.push(`${k}= written with ${got} fields, not ${want}`);
      if (got < want) found.push(`${k}= written with only ${got} field${got > 1 ? 's' : ''}, not ${want}`);
    }

    // formulas: the condition of a t=, and the middle field of an r=
    let expr = null;
    if (k === 'r') expr = v.split(':')[1];
    if (k === 't') expr = v.split(':')[1];
    if (expr == null) return;
    // restorePlus is what the renderer does with the spaces a formula's +
    // became, so a plus before a call stays a plus: vy+sqrt(x), not vysqrt(x)
    expr = restorePlus(decodeURIComponent(expr.replace(/\+/g, ' ')));

    if (expr.indexOf('?') >= 0) found.push('a ternary a?b:c, which the grammar has no conditional for');
    // the stand-in for an encoded colon is not something a model wrote, and a
    // formula holding one is already reported as the ternary it came from
    const strays = expr.replace(/\u0001/g, '').match(/[^A-Za-z0-9_.,()+\-*/<>=!]/g);
    if (strays) [...new Set(strays)].forEach(ch =>
      found.push(`${JSON.stringify(ch)} in a formula, which is not an operator here`));
    if (/&&|\|\||(?<![<>!=])=(?!=)/.test(expr))
      found.push('a logical operator the grammar does not have');

    // a word followed by ( is a call, and we hold the list of real ones
    const calls = expr.match(/[A-Za-z_][A-Za-z0-9_]*(?=\()/g) || [];
    calls.forEach(fn => {
      if (FUNCTIONS.indexOf(fn) < 0) found.push(`a function that does not exist: ${fn}()`);
    });
  });

  return [...new Set(found)];
}

function scoreBatch(file) {
  const raw = fs.readFileSync(file, 'utf8');
  // Preserve the entire returned line, including an illegal space inside a
  // URL. Splitting on whitespace would score only the unbroken prefix.
  const urls = raw.split(/\r?\n/).map(line => line.trim())
    .filter(line => /^https?:\/\/[^\s]*#/.test(line));
  if (!urls.length) {
    console.log(`no links found in ${file} - one URL per line, nothing else`);
    process.exit(1);
  }
  console.log(`scoring ${urls.length} generated links\n`);

  const verdicts = [];
  urls.forEach((url, i) => {
    const why = [];
    const cutAt = truncatedBy(url);
    if (cutAt) why.push(`unsendable: ${JSON.stringify(cutAt.ch)} at ${cutAt.at} cuts ${url.length - cutAt.at} chars`);
    if (markdownEaten(url) !== url) why.push('markdown eats part of it');
    if (url.length >= 2000) why.push(`${url.length} chars, over the 2000 limit`);

    let d = null;
    try { d = parse(url.slice(url.indexOf('#'))); } catch (e) { why.push('does not parse'); }
    if (d) {
      ['a', 'h', 'v', 'm', 'd'].forEach(k => { if (!d[k]) why.push(`no ${k}=`); });
      d.problems.forEach(problem => why.push(`renderer refuses: ${problem}`));
      if (!d.blocks.length) why.push('no blocks');
      d.blocks.forEach(b => {
        (b.computed || []).forEach(c => { if (c.label && c.value === null) why.push(`"${c.label}" draws a dash`); });
        (b.decided || []).forEach(c => { if (c.label && !c.text) why.push(`"${c.label}" cannot be decided`); });
        if (b.type === 't') b.items.forEach(it => {
          if (it.split(':').length < 3) why.push('a t= does not have its three fields');
        });
      });
      // an input nothing refers to is a box the reader fills in for no reason
      const named = [];
      d.blocks.forEach(b => { if (b.type === 'i') b.items.forEach(it => {
        const p = it.split(':'); if (p.length >= 3) named.push(p[0]); }); });
      const formulas = d.blocks.flatMap(b =>
        (b.type === 'r' || b.type === 't') ? b.items.join(' ') : []).join(' ');
      named.forEach(n => {
        if (!new RegExp('\\b' + n + '\\b').test(formulas)) why.push(`input "${n}" is never used`);
      });
    }
    const made = inventedSyntax(url);
    if (made.length) why.push('syntax outside the prompt grammar');
    verdicts.push({url, why, made});
    const head = (/[#&]h=([^&]*)/.exec(url) || [, '?'])[1].replace(/\+/g, ' ').slice(0, 44);
    console.log(`${why.length ? 'BAD ' : 'ok  '} ${String(i + 1).padStart(3)}  ${head}`);
    why.forEach(w => console.log(`        - ${w}`));
    made.forEach(m => console.log(`        ! invented: ${m}`));
  });

  const bad = verdicts.filter(v => v.why.length);
  const rate = ((urls.length - bad.length) / urls.length * 100).toFixed(1);
  console.log(`\n${urls.length - bad.length}/${urls.length} valid first render  (${rate}%)`);

  /* The count that matters more. A model inventing syntax is not a model
     getting it wrong - it is the grammar coming up short, and this is the
     only place that shows up as a number. */
  const invented = verdicts.filter(v => v.made.length);
  console.log(`${invented.length}/${urls.length} wrote syntax the grammar does not have`);
  if (invented.length) {
    const tally = {};
    invented.forEach(v => v.made.forEach(m => { tally[m] = (tally[m] || 0) + 1; }));
    console.log('\nwhat they reached for and could not find:');
    Object.entries(tally).sort((a, b) => b[1] - a[1])
      .forEach(([k, n]) => console.log(`  ${String(n).padStart(3)}  ${k}`));
    console.log('\nRead these, not just the count. One invention turning up again');
    console.log('and again is a feature request. Many different ones mean the');
    console.log('vocabulary is too weak.');
  }

  if (bad.length) {
    const tally = {};
    bad.forEach(v => v.why.forEach(w => {
      const kind = w.split(':')[0]
        .replace(/^input "[^"]*" is never used$/, 'an input nothing refers to')
        .replace(/^"[^"]*" /, 'a row ');
      tally[kind] = (tally[kind] || 0) + 1;
    }));
    console.log('\nwhat went wrong, most common first:');
    Object.entries(tally).sort((a, b) => b[1] - a[1])
      .forEach(([k, n]) => console.log(`  ${String(n).padStart(3)}  ${k}`));
  }
  process.exit(bad.length ? 1 : 0);
}

function runChecks() {
  failures = 0;
  checks = 0;
  sweepCharacters();
  sweepColons();
  sweepPicks();
  sweepNamespace();
  sweepAlphabet();
  sweepWorking();
  sweepRefusals();
  sweepUnits();
  sweepFunctions();
    sweepOrder();
  sweepDecisions();
  sweepExamples();
  sweepPromptBehavior();
  sweepBatchScoring();
  sweepFormulas();

  return {checks, failures};
}

module.exports = {runChecks};
if (require.main === module) {
  if (process.argv[2]) scoreBatch(process.argv[2]);
  else {
    console.error('Run the full suite with: node test/run.js');
    process.exitCode = 2;
  }
}
