#!/usr/bin/env node
/*
 * Transport tests - exhaustive, no Chrome, no model.
 *
 *   node test/transport.js
 *
 * run.js asks "does the card render what the URL says". This asks the question
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
const CARD = path.join(ROOT, 'v2', 'index.html');

/* The renderer, lifted out of the page. Everything past the expression
   machinery touches the DOM, so the cut is the first function that does. */
const src = fs.readFileSync(CARD, 'utf8');
const js = /<script>([\s\S]*?)<\/script>/.exec(src)[1];
const cut = js.indexOf('/* execCommand is the fallback');
if (cut < 0) throw new Error('cannot find the cut point in v2/index.html');
const mod = {exports: {}};
new Function('module', 'exports', js.slice(0, cut) +
  '\nmodule.exports={parse:parse,evaluate:evaluate,restorePlus:restorePlus};'
)(mod, mod.exports);
const {parse} = mod.exports;
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
const WORDING = {
  ',': '%2C', '.': '%2E', '(': '%28', ')': '%29', '*': '%2A', '?': '%3F',
  '&': '%26', '#': '%23', '+': '%2B', '%': '%25', '"': '%22', '<': '%3C',
  '>': '%3E', '\\': '%5C', '^': '%5E', '`': '%60', '{': '%7B', '|': '%7C',
  '}': '%7D', ':': '%3A'
};
// a formula keeps + - / = as they are; everything else follows the wording rule
const FORMULA_KEEP = new Set(['+', '-', '/', '=']);

function encodeWording(text) {
  return String(text).split('').map(ch => {
    if (ch === ' ') return '+';
    if (WORDING[ch]) return WORDING[ch];
    return ch;
  }).join('');
}
function encodeFormula(f) {
  return String(f).split('').map(ch => {
    if (FORMULA_KEEP.has(ch)) return ch;
    if (ch === ' ') return '';
    if (WORDING[ch]) return WORDING[ch];
    return ch;
  }).join('');
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
  for (const mark of ['*', '_']) {
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
      d => d.blocks[0].items[0].split(':').slice(1).join(':')],
    ['t  outcome', t => `#a=A&h=H&v=V&m=M&d=2026-01-01&g=G&i=N:1:n&t=L:n%3E0:${encodeWording(t)}:no`,
      d => d.blocks.find(b => b.type === 't').decided[0].text]
  ];

  // every printable ASCII, plus the ones that have bitten us before
  const CHARS = [];
  for (let i = 32; i < 127; i++) CHARS.push(String.fromCharCode(i));
  CHARS.push('£', '€', '’', '—', 'é');

  let roundTrip = 0, unsendable = 0, eaten = 0;
  const uncovered = {};
  for (const [name, build, read] of FIELDS) {
    for (const ch of CHARS) {
      /* The colon is the field separator. The spec says so, and says which
         fields it may not appear in; sweepColons() below pins that down. */
      if (ch === ':' && /^[rit]/.test(name)) continue;
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
  const llms = fs.readFileSync(path.join(ROOT, 'llms.txt'), 'utf8');
  const made = fs.readFileSync(path.join(ROOT, 'made', 'index.html'), 'utf8');
  const urls = (llms.match(/https:\/\/upshot\.fyi\/v2\/#\S+/g) || [])
    .concat((made.match(/href="\/v2\/#[^"]*"/g) || [])
      .map(h => 'https://upshot.fyi' + h.slice(6, -1).replace(/&amp;/g, '&')));

  urls.forEach(url => {
    const name = (/[#&]h=([^&]*)/.exec(url) || [, '?'])[1].replace(/\+/g, ' ').slice(0, 38);
    const cutAt = truncatedBy(url);
    check(!cutAt, `sendable: ${name}`, cutAt ? `${JSON.stringify(cutAt.ch)} at ${cutAt.at}` : '');
    check(markdownEaten(url) === url, `survives a markdown chat UI: ${name}`);
    check(url.length < 2000, `under 2000 chars: ${name}`, `${url.length}`);

    // and every row on the card it draws has to come to something
    const d = parse(url.slice(url.indexOf('#')));
    const dashes = [];
    d.blocks.forEach(b => {
      (b.computed || []).forEach(c => { if (c.label && c.value === null) dashes.push(c.label); });
      (b.decided || []).forEach(c => { if (c.label && !c.text) dashes.push(c.label); });
    });
    check(dashes.length === 0, `every row computes: ${name}`, dashes.join(', '));
  });
  console.log(`  ${urls.length} live URLs checked`);
}

/* ---- sweep 3: the evaluator against plain arithmetic ---- */
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
      `&r=X:${encodeFormula(f)}`;
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
    ['f  value', F + '&f=Meet:9:30am',
      d => d.blocks[0].items[0].split(':').slice(1).join(':'), '9:30am'],
    ['c  item', F + '&c=Be+there+by+9:30', d => d.blocks[0].items[0], 'Be there by 9:30']
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

/* ---- scoring a batch of real generations ----
   node test/transport.js links.txt

   The point of the file: a link has to be scored as text, exactly as it left
   the model. Opening it in a browser proves nothing, because the address bar
   is not the channel - it never truncates, never renders markdown, and is
   blind to every failure this file exists to catch. */
function scoreBatch(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const urls = raw.split(/\s+/).filter(t => /^https?:\/\/[^\s]*#/.test(t));
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
      ['h', 'v', 'm', 'd'].forEach(k => { if (!d[k]) why.push(`no ${k}=`); });
      const groups = new Set(d.blocks.map(b => b.group));
      if (groups.size > 3) why.push(`${groups.size} blocks, cap is 3`);
      if (!d.blocks.length) why.push('no blocks');
      d.blocks.forEach(b => {
        (b.computed || []).forEach(c => { if (c.label && c.value === null) why.push(`"${c.label}" draws a dash`); });
        (b.decided || []).forEach(c => { if (c.label && !c.text) why.push(`"${c.label}" cannot be decided`); });
        if (b.type === 't') b.items.forEach(it => {
          if (it.split(':').length !== 4) why.push('a t= does not have its four fields');
        });
      });
      // an input nothing refers to is a box the reader fills in for no reason
      const named = [];
      d.blocks.forEach(b => { if (b.type === 'i') b.items.forEach(it => {
        const p = it.split(':'); if (p.length >= 3) named.push(p[2]); }); });
      const formulas = d.blocks.flatMap(b =>
        (b.type === 'r' || b.type === 't') ? b.items.join(' ') : []).join(' ');
      named.forEach(n => {
        if (!new RegExp('\\b' + n + '\\b').test(formulas)) why.push(`input "${n}" is never used`);
      });
    }
    verdicts.push({url, why});
    const head = (/[#&]h=([^&]*)/.exec(url) || [, '?'])[1].replace(/\+/g, ' ').slice(0, 44);
    console.log(`${why.length ? 'BAD ' : 'ok  '} ${String(i + 1).padStart(3)}  ${head}`);
    why.forEach(w => console.log(`        - ${w}`));
  });

  const bad = verdicts.filter(v => v.why.length);
  const rate = ((urls.length - bad.length) / urls.length * 100).toFixed(1);
  console.log(`\n${urls.length - bad.length}/${urls.length} valid first render  (${rate}%)`);

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

if (process.argv[2]) {
  scoreBatch(process.argv[2]);
} else {
  sweepCharacters();
  sweepColons();
  sweepExamples();
  sweepFormulas();

  console.log(`\n${checks} checks`);
  console.log(failures ? `\n${failures} failed` : '\nall passed');
  process.exit(failures ? 1 : 0);
}
