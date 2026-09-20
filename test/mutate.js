#!/usr/bin/env node
/*
 * Does the test suite actually catch bugs?
 *
 *   node test/mutate.js
 *
 * A green suite proves the tests pass. It does not prove they would fail if
 * the renderer were wrong. The only way to know that is to make it wrong on
 * purpose, one edit at a time, and see whether test/run.js notices.
 *
 * Each mutation below is a single plausible slip: an operator swapped for the
 * one beside it, a guard turned off, a regex loosened. None is a strawman -
 * every one of them is a mistake a person could make while editing v2, and
 * several are mistakes that were actually in the file at some point.
 *
 * This is a release-time check, not a CI one. test/run.js runs in about a
 * second; this runs it once per mutation, so it takes half a minute. Run it
 * after changing the evaluator, the audit rules, or the tests themselves.
 *
 * What a survivor means: the suite has a blind spot exactly there. When five
 * survived the first time this ran, all five were operators and functions
 * that a hand-written table of expressions happened to test only away from
 * their boundary - 4 > 18 and 4 >= 18 agree, so swapping the two changed no
 * answer anything checked. The fix was to generate the table rather than list
 * it, which closed all five at once. That is the usual shape of the answer:
 * a survivor names a list someone typed by hand.
 */
const {execFileSync} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CARD = path.join(ROOT, 'v2', 'index.html');
const RUNNER = path.join(__dirname, 'run.js');

/* [name, exact text in v2/index.html, what to replace it with].
   The anchor must appear exactly once, or the mutation is reported as stale
   rather than applied - a renamed function should show up as a broken
   mutation, never as a silent pass. */
const MUTATIONS = [
  // --- the refusal rules. Each one exists because something silently wrong
  //     shipped once; turning it off must fail loudly.
  ['name regex accepts anything',
   'var NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;', 'var NAME = /^.+$/;'],
  ['every start value is a number',
   'return NUMBER.test(value) && isFinite(Number(value));', 'return true;'],
  ['nothing is reserved',
   'var RESERVED = {pi: 1};', 'var RESERVED = {};'],
  ['a frame key may be written twice',
   "    if(STATE_KEYS.indexOf(k) < 0 && Object.prototype.hasOwnProperty.call(out, k)){",
   "    if(false){"],
  ['mod truncates instead of wrapping',
   'mod: function(a, b){ return ((a % b) + b) % b; }', 'mod: function(a, b){ return a % b; }'],
  ['duplicate names allowed',
   'if(Object.prototype.hasOwnProperty.call(claimed, name)){',
   'if(false){'],
  ['fallback-last check off by one',
   'for(var j = 0; j < rows.length - 1; j++){', 'for(var j = 0; j < rows.length - 2; j++){'],
  ['decision needs no label',
   "if(!label) out.problems.push('a decision has no label. Write ' + SHAPE.t);",
   "if(false) out.problems.push('x');"],
  ['decision need not be a comparison',
   'if(needsComparison && !info.comparison)', 'if(false && needsComparison && !info.comparison)'],
  ['unit for an undeclared name allowed',
   '    if(!Object.prototype.hasOwnProperty.call(claimed, u))', '    if(false)'],

  // --- the evaluator. Every comparison against the one it could be confused
  //     with, which is the pair a hand-written table never contains.
  ['< becomes <=', "    case '<':  return l <  r ? 1 : 0;", "    case '<':  return l <= r ? 1 : 0;"],
  ['<= becomes <', "    case '<=': return l <= r ? 1 : 0;", "    case '<=': return l <  r ? 1 : 0;"],
  ['> becomes >=', "    case '>':  return l >  r ? 1 : 0;", "    case '>':  return l >= r ? 1 : 0;"],
  ['>= becomes >', "    case '>=': return l >= r ? 1 : 0;", "    case '>=': return l >  r ? 1 : 0;"],
  ['== becomes !=', "    case '==': return l === r ? 1 : 0;", "    case '==': return l !== r ? 1 : 0;"],
  ['!= becomes ==', "    case '!=': return l !== r ? 1 : 0;", "    case '!=': return l === r ? 1 : 0;"],
  ['minus becomes plus', "    case '-':  return l - r;", "    case '-':  return l + r;"],
  ['divide becomes multiply', "    case '/':  return l / r;", "    case '/':  return l * r;"],
  ['a chained comparison is an or',
   "      node = {op: 'and', l: node, r: {op: next, l: mid, r: right}};",
   "      node = {op: 'or', l: node, r: {op: next, l: mid, r: right}};"],
  ['and becomes or', "    case 'and': return (l && r) ? 1 : 0;", "    case 'and': return (l || r) ? 1 : 0;"],
  ['multiplication loses its precedence',
   '  function additive(){\n    var left = multiplicative();',
   '  function additive(){\n    var left = unary();'],

  // --- the functions, each against its neighbour
  ['min and max swapped', '  min: Math.min, max: Math.max,', '  min: Math.max, max: Math.min,'],
  ['floor becomes ceil', 'floor: Math.floor, ceil: Math.ceil,', 'floor: Math.ceil, ceil: Math.ceil,'],
  ['abs does nothing', 'abs: Math.abs,', 'abs: function(x){return x;},'],
  ['ln is base 10', '  ln: Math.log,', '  ln: Math.log10,'],
  ['round ignores its second argument',
   '    var f = Math.pow(10, dp || 0);', '    var f = 1;'],
  ['pi loses precision', 'var CONSTS = {pi: Math.PI};', 'var CONSTS = {pi: 3.14};'],

  // --- parsing and transport
  ['exponents dropped from the tokenizer',
   '      var num = /^[0-9]*\\.?[0-9]+([eE][-+]?[0-9]+)?/.exec(src.slice(i));',
   '      var num = /^[0-9]*\\.?[0-9]+/.exec(src.slice(i));'],
  ['exponents dropped from start values',
   'var NUMBER = /^-?[0-9]*\\.?[0-9]+([eE][-+]?[0-9]+)?$/;', 'var NUMBER = /^-?[0-9]*\\.?[0-9]+$/;'],
  ['unary minus dropped', "if('+-*/(),<>'.indexOf(ch) >= 0)", "if('+*/(),<>'.indexOf(ch) >= 0)"],
  ['the last field stops at the next colon',
   "  var out = parts.slice(0, n - 1);\n  out.push(parts.slice(n - 1).join(':'));",
   "  var out = parts.slice(0, n - 1);\n  out.push(parts[n - 1] || '');"],
  ['a box takes its name from the wrong end',
   '  var f = fields(item, 2);\n  return {name: f[0].trim(), label: f[1].trim()};',
   '  var f = fields(item, 2);\n  return {name: f[1].trim(), label: f[0].trim()};'],
  ['a result splits into two fields, not three',
   "        var rf = fields(item, 3);\n        claim(rf[0].trim(), 'a result', 'r', false);",
   "        var rf = fields(item, 2);\n        claim(rf[0].trim(), 'a result', 'r', false);"],

  /* Expected to survive. A missing field padded with a space rather than an
     empty string changes nothing a reader can see: every consumer trims, and
     the one that does not is a formula, which is invalid either way. Checked
     by rendering nine short-field shapes both ways - byte-identical output.
     It is kept because an equivalent mutation is worth recording as equivalent
     rather than quietly leaving the list. */
  ['a missing field pads with a space', "  while(out.length < n) out.push('');",
   "  while(out.length < n) out.push(' ');", 'equivalent']
];

function main(){
  const original = fs.readFileSync(CARD, 'utf8');
  const temp = path.join(os.tmpdir(), `upshot-mutant-${process.pid}.html`);
  const survivors = [], stale = [];

  console.log(`${MUTATIONS.length} mutations against test/run.js\n`);

  for(const [name, from, to, expected] of MUTATIONS){
    if(original.split(from).length - 1 !== 1){
      stale.push(name);
      console.log(`  stale     ${name}  (anchor no longer matches v2/index.html)`);
      continue;
    }
    fs.writeFileSync(temp, original.replace(from, to));

    let caught = false, detail = '';
    try {
      execFileSync(process.execPath, [RUNNER],
        {encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'],
         env: Object.assign({}, process.env, {UPSHOT_CARD: temp})});
    } catch (e) {
      caught = true;
      /* A named failure is the good case. Some mutations break parsing badly
         enough that the suite throws instead - still red, still caught, but
         say which it was rather than printing nothing. */
      const out = (e.stdout || '') + (e.stderr || '');
      const failed = out.split('\n').filter(l => /FAIL/.test(l));
      const threw = out.split('\n').filter(l => /INCOMPLETE|Error/.test(l));
      detail = failed.length ? failed[0].trim().replace(/\s+/g, ' ').slice(0, 72)
             : threw.length ? '(no named failure - the suite threw) ' + threw[0].trim().slice(0, 48)
             : '(no named failure - exit ' + (e.status === null ? 'timeout' : e.status) + ')';
    }

    if(expected === 'equivalent'){
      console.log(`  ${caught ? 'CAUGHT  ' : 'expected'}  ${name}  ${caught ? detail : '(changes nothing, as recorded)'}`);
      if(caught) survivors.push(name + ' - recorded as equivalent but the suite failed');
    } else {
      console.log(`  ${caught ? 'caught  ' : 'SURVIVED'}  ${name}  ${detail}`);
      if(!caught) survivors.push(name);
    }
  }

  fs.unlinkSync(temp);

  if(stale.length)
    console.log(`\nSTALE: ${stale.length} mutation(s) no longer match v2/index.html. ` +
                'Re-point them at the moved code - an unapplied mutation proves nothing.');
  if(survivors.length){
    console.log(`\nSURVIVED: the suite does not notice ${survivors.length} of these.`);
    survivors.forEach(s => console.log('  - ' + s));
    console.log('\nEach one names a blind spot. Where the missed case sits in a list ' +
                'written by hand, generate the list instead of adding the one case.');
  }
  if(!survivors.length && !stale.length)
    console.log('\nPASS: every deliberate bug was caught.');

  process.exit(survivors.length || stale.length ? 1 : 0);
}

main();
