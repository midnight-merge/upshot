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
  '\nmodule.exports={parse:parse,evaluate:evaluate,restorePlus:restorePlus,' +
  'fields:fields,text:text};'
)(mod, mod.exports);
const {parse, fields} = mod.exports;
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
      d => fields(d.blocks[0].items[0], 2)[1]],
    ['s  pick label', t => `#a=A&h=H&v=V&m=M&d=2026-01-01&g=G&s=${encodeWording(t)}:1:n`,
      d => d.blocks.find(b => b.type === 's').options[0].label],
    ['t  outcome', t => `#a=A&h=H&v=V&m=M&d=2026-01-01&g=G&i=N:1:n&t=L:n%3E0:${encodeWording(t)}:no`,
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
    ['f  value', F + '&f=Meet:9:30am', d => fields(d.blocks[0].items[0], 2)[1], '9:30am'],
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

/* ---- pick-one ----
   The exclusive cell of the grid: unknown to the conversation, editable by the
   reader, and one of N rather than any of N. A checklist cannot express it -
   nothing stops a reader ticking three plans - which is the whole reason the
   key exists, so these check the meaning rather than the drawing. */
function sweepPicks() {
  console.log('\npick-one');
  const F = '#a=A&h=H&v=V&m=M&d=2026-01-01&g=G';
  const PLANS = '&s=Plan+1:26900:thr&s=Plan+2:29385:thr&s=Plan+4:33795:thr';
  const SUM = '&i=Salary:40000:salary&r=Repay:max(0,salary-thr)*0.09';
  const repay = hash => {
    const d = parse(hash);
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
   ['&x=', 'empty'], ['&x=~1', 'blank in its own slot']].forEach(([tail, what]) => {
    check(near(repay(F + PLANS + SUM + tail), 1179),
      'a chosen index that is ' + what + ' falls back to the first',
      'got ' + repay(F + PLANS + SUM + tail));
  });

  /* A link carrying more slots than the card has groups is not corrupt - a
     model that trimmed a group, or a reader who kept an older link, must not
     have the remaining group shifted out from under them. */
  check(near(repay(F + PLANS + SUM + '&x=1~9~9'), 955.35),
    'slots past the last group are ignored rather than shifting it',
    'got ' + repay(F + PLANS + SUM + '&x=1~9~9') + ', wanted 955.35');

  // exactly one option carries the choice, structurally - never two, never none
  [undefined, '&x=0', '&x=2', '&x=9'].forEach(tail => {
    const d = parse(F + PLANS + SUM + (tail || ''));
    const on = d.blocks.find(b => b.type === 's').options.filter(o => o.on).length;
    check(on === 1, 'exactly one option is chosen' + (tail ? ' at ' + tail : ' by default'),
      on + ' of them');
  });

  /* Two groups are told apart by name, not by position or by block - the same
     way a repeated key beats a separator everywhere else in the grammar. */
  const TWO = F + '&s=A:1:one&s=B:2:one&s=X:10:two&s=Y:20:two&r=Sum:one+two';
  const sum = hash => {
    const r = parse(hash).blocks.find(b => b.type === 'r');
    const row = r && r.computed.find(c => c.label === 'Sum');
    return row ? row.value : null;
  };
  check(sum(TWO) === 11, 'two groups each stand on their own first option', 'got ' + sum(TWO));
  check(sum(TWO + '&x=1~1') === 22, 'and each follows its own slot in x=', 'got ' + sum(TWO + '&x=1~1'));
  check(sum(TWO + '&x=0~1') === 21, 'so one can move without the other', 'got ' + sum(TWO + '&x=0~1'));

  /* A group is a name, not a run of lines - it survives being split across
     blocks, which is what stops the reader ticking a plan in one block and a
     contradicting one in another. */
  const SPLIT = '#a=A&h=H&v=V&m=M&d=2026-01-01&g=One&s=A:1:n&g=Two&s=B:2:n&g=Sum&r=V:n';
  const val = hash => {
    const r = parse(hash).blocks.find(b => b.type === 'r');
    const row = r && r.computed.find(c => c.label === 'V');
    return row ? row.value : null;
  };
  check(val(SPLIT) === 1, 'one name split across blocks is still one group', 'got ' + val(SPLIT));
  check(val(SPLIT + '&x=1') === 2, 'and one x= slot still covers it', 'got ' + val(SPLIT + '&x=1'));
  const spread = parse(SPLIT);
  const chosen = spread.blocks.filter(b => b.type === 's')
    .reduce((n, b) => n + b.options.filter(o => o.on).length, 0);
  check(chosen === 1, 'with exactly one option chosen across both blocks', chosen + ' chosen');

  // first claim on a name wins here as everywhere - an input is not rebound
  const claimed = val('#a=A&h=H&v=V&m=M&d=2026-01-01&g=G&i=Threshold:5:n&s=Plan:99:n&g=S&r=V:n');
  check(claimed === 5, 'a pick-one cannot rename the input it was named after',
    'got ' + claimed + ', wanted 5');

  // a value that is not a number is zero, exactly as a cleared input is
  check(val('#a=A&h=H&v=V&m=M&d=2026-01-01&g=G&s=Free:free:n&r=V:n') === 0,
    'an option whose value is not a number reads as zero');

  // wording is wording: an encoded colon survives in a label the way it does
  // in a bullet, and the field separators are untouched by it
  const colon = parse(F + '&s=Be+there+by+9%3A30:1:n');
  check(colon.blocks[0].options[0].label === 'Be there by 9:30',
    'an encoded colon survives in an option label',
    JSON.stringify(colon.blocks[0].options[0].label));
  check(colon.blocks[0].options[0].value === 1 && colon.blocks[0].options[0].name === 'n',
    'and the fields around it still come apart correctly');

  /* ticks and boxes count a checklist. A pick-one is not one, so a card
     carrying both must not have its score quietly inflated by the options. */
  const mixed = parse('#a=A&h=H&v=V&m=M&d=2026-01-01&g=G&c=One&c=Two&s=A:1:n&s=B:2:n' +
    '&r=Boxes:boxes:b&r=Ticks:ticks:t&k=10');
  const rows = mixed.blocks.find(b => b.type === 'r').computed;
  const box = rows.find(c => c.label === 'Boxes'), tk = rows.find(c => c.label === 'Ticks');
  check(box && box.value === 2, 'options do not count as boxes', box && 'boxes came to ' + box.value);
  check(tk && tk.value === 1, 'and choosing one is not a tick', tk && 'ticks came to ' + tk.value);

  // nameless options are still a group: nothing can read them, but the reader
  // can still be shown a choice rather than a list that lies about being one
  const bare = parse(F + '&s=Yes:1&s=No:0');
  check(bare.blocks[0].options.length === 2 &&
        bare.blocks[0].options.filter(o => o.on).length === 1,
    'options with no name still form one exclusive group');

  console.log('  ' + 26 + ' checks');
}

/* ---- one shared name, claimed twice ----
   `ticks`, `boxes`, and every i= and named r= all live in one namespace.
   Nothing in the spec stops a model reusing a name - it only asks it not
   to - so the card has to survive the reuse itself. Found 13 Sep 2026: an
   i= reused as an r='s own name silently rewired every formula after it,
   because the later write won. First claim now wins everywhere; a later
   write with the same name is dropped rather than rebinding what already
   reads it. */
function sweepNamespace() {
  console.log('\none name, claimed twice');
  const F = '#a=A&h=H&v=V&m=M&d=2026-01-01&g=G';

  // an r= reusing an i='s name must not rewire a later formula
  const d1 = parse(F + '&i=Seats:4:seats&r=Double:seats*2:seats&r=Check:seats+1');
  const check1 = d1.blocks.find(b => b.type === 'r').computed.find(c => c.label === 'Check');
  check(check1 && check1.value === 5, 'a result cannot rename the input it was named after',
    check1 ? `Check came to ${check1.value}, wanted 5 (the original seats)` : 'no Check row');

  // a result named "ticks" must not corrupt a checklist score - k=11 ticks
  // both boxes, so a correct score is 2/2*100
  const d2 = parse('#k=11&a=A&h=H&v=V&m=M&d=2026-01-01&g=List&c=One&c=Two' +
    '&r=Ticks:5:ticks&r=Score:ticks/boxes*100:score');
  const score = d2.blocks.find(b => b.type === 'r').computed.find(c => c.label === 'Score');
  check(score && score.value === 100, 'a result cannot rename the reserved ticks/boxes',
    score ? `Score came to ${score.value}, wanted 100 (2 ticked of 2)` : 'no Score row');
  console.log('  2 checks');
}

/* ---- a decision is a comparison, or it is not a decision ----
   Every t= in the spec is Label:Condition:When+true:When+false, and
   Condition always compares something. `fields()` only protects the LAST
   of those four from an embedded colon - so an unencoded colon anywhere in
   the label or the true-text shifts the rest by one, and the wrong slot
   lands where Condition should be. Found 13 Sep 2026: when that slot ends
   up holding a bare number, truthy-coercing it picked a real-looking
   branch with full authority - exactly the false confidence the existing
   null-draws-a-dash rule already refuses to allow. A condition with no
   comparison operator now can never decide, whatever shifted into it. */
function sweepDecisions() {
  console.log('\na decision without a comparison');
  const F = '#a=A&h=H&v=V&m=M&d=2026-01-01&g=G&i=N:1:n';

  // the exact failure: an unencoded colon in the label shifts every field
  const d1 = parse(F + '&t=Ratio+3:2+exceeded:n%3E0:Yes:No');
  const t1 = d1.blocks.find(b => b.type === 't').decided[0];
  check(t1.text === '', 'a colon-mangled label draws a dash, not a wrong verdict',
    t1.text === '' ? '' : `text came to ${JSON.stringify(t1.text)}`);

  // the general rule, isolated from the colon bug that first found it: any
  // condition without a comparator is unanswerable, not truthy
  const d2 = parse(F + '&t=Weird:5:Yes:No');
  const t2 = d2.blocks.find(b => b.type === 't').decided[0];
  check(t2.text === '', 'a bare number never stands in for a comparison',
    t2.text === '' ? '' : `text came to ${JSON.stringify(t2.text)}`);

  // and a real comparison still decides normally - the guard must not
  // swallow legitimate decisions along with malformed ones
  const d3 = parse(F + '&t=Real:n%3E0:Yes:No');
  const t3 = d3.blocks.find(b => b.type === 't').decided[0];
  check(t3.text === 'Yes', 'a real comparison still decides',
    t3.text === 'Yes' ? '' : `text came to ${JSON.stringify(t3.text)}`);
  console.log('  3 checks');
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
  sweepPicks();
  sweepNamespace();
  sweepDecisions();
  sweepExamples();
  sweepFormulas();

  console.log(`\n${checks} checks`);
  console.log(failures ? `\n${failures} failed` : '\nall passed');
  process.exit(failures ? 1 : 0);
}
