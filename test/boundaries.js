// Boundary fixtures and browser assertions, loaded by test/run.js.
// No runner, renderer copy, or Chrome launcher lives here.
const cases = [];
const frame = '#a=Contract+test&h=Contract+test&v=Test&m=Test&d=2026-09-16&g=G';
const enc = value => encodeURIComponent(String(value));
function add(id, name, tail, want) { cases.push({id, name, hash: frame + tail, want}); }
/* `raw` opens the fixture exactly as written, print and all, so a case can
   carry state with no print or a print belonging to another card. */
function addRaw(id, name, tail, want) { cases.push({id, name, hash: frame + tail, want, raw: true}); }

// Start with a valid control and mutate just its numeric field. Prefixes that
// parseFloat accepts are included: a plausible partial number is also wrong.
for (const kind of ['i', 's']) {
  for (const value of ['0', '-2', '0.5', '1e-9']) {
    add('numbers', `${kind} accepts ${value}`, `&${kind}=n:${enc(value)}:N&r=x:n*2:Result`,
      {values: [String(Number(value) * 2)], numeric: [Number(value) * 2]});
  }
  for (const value of ['', '£6', '6kg', 'NaN', 'Infinity', '--1', '1e999']) {
    add('B02', `${kind} rejects ${JSON.stringify(value)}`, `&${kind}=n:${enc(value)}:N&r=x:n*2:Result`,
      {refused: true});
  }
}

// The same name must mean the same thing across each primitive that claims it.
for (const kind of ['i', 's', 'c', 'r']) {
  for (const name of ['Annual salary', '1n', 'a-b']) {
    const item = kind === 'c' ? `${enc(name)}:N` : `${enc(name)}:5:N`;
    add('B04', `${kind} rejects name ${JSON.stringify(name)}`, `&${kind}=${item}`, {refused: true});
  }
}
for (const name of ['n', '_n', 'n2', 'min']) {
  add('names', `valid name ${name}`, `&i=${name}:5:N&r=x:${name}*2:Result`,
    {numeric: [10], values: ['10']});
}

add('B03', 'raw ternary must not spill into label', '&i=n:4:N&r=x:n>3?100:0:Bonus', {refused: true});
add('B03', 'encoded ternary is also outside the documented grammar',
  '&i=n:4:N&r=x:n%3E3%3F100%3A0:Bonus', {refused: true});
add('B05', 'decision requires a visible label', '&i=n:0:N&t=:n>3:Big&t=:n<1:Small', {refused: true});
add('B06', 'fallback cannot precede a later outcome', '&i=n:3:N&t=V::Fallback&t=V:n>2:Plenty', {refused: true});

// A function call and a variable are different uses of a word. Forbidding
// variables called min would break existing running-time cards.
for (const [fn, args, expected] of [['min', 'b,20', 9], ['max', 'b,20', 20], ['abs', 'b', 9]]) {
  add('B07', `${fn} variable does not replace function name in working`,
    `&i=${fn}:5:N&i=b:9:B&r=x:${fn}(${args}):Result`,
    {numeric: [expected], values: [String(expected)], working: [`${fn}(${args.replace('b', '9')})`]});
}

// Independent arithmetic and equivalence checks: expectations never come from
// the renderer's own evaluator. Reordering definitions must preserve answers.
for (const n of [-2, 0, 3, 10]) {
  for (const reversed of [false, true]) {
    const rows = [`&i=n:${n}:N`, '&r=a:n*2:Double', '&r=b:a+1:Next'];
    if (reversed) rows.reverse();
    const expected = reversed ? [n * 2 + 1, n * 2] : [n * 2, n * 2 + 1];
    add('dependencies', `${n}, definitions ${reversed ? 'reversed' : 'forward'}`, rows.join(''),
      {numeric: expected, values: expected.map(String)});
  }
}
for (const [n, verdict] of [[2, 'Below'], [3, 'At'], [4, 'Above']]) {
  add('decisions', `threshold ${n}`, `&i=n:${n}:N&t=V:n<3:Below&t=V:n==3:At&t=V::Above`,
    {values: [verdict]});
}
add('encoding', 'encoded colon belongs to wording', '&f=Greeting:Hello%3A+world', {values: ['Hello: world']});
add('encoding', 'Unicode wording survives', '&f=Greeting:%E4%BD%A0%E5%A5%BD+%F0%9F%91%8B', {values: ['你好 👋']});
add('hidden-step', 'hidden intermediate is used but not drawn', '&r=a:6*2:&r=b:a/3:Result',
  {numeric: [12, 4], values: ['4']});
add('numbers', 'scientific notation works in a formula literal', '&r=x:6.674e-11:Result',
  {numeric: [6.674e-11], values: ['6.674e-11']});
add('numbers', 'scientific notation is distinct from a variable named e',
  '&i=e:2:Energy&r=x:6.674e-11*e:Result',
  {numeric: [1.3348e-10], values: ['1.3348e-10'], working: ['6.674e-11*2']});
/* Six significant figures is fewer digits than the row above a million, so
   the working stopped citing the number the reader typed and stopped adding
   up to the answer beside it. */
add('B09', 'working cites a large input as it was typed',
  '&i=turnover:1234567%2E89:Turnover&r=tax:turnover*0%2E2:Tax',
  {values: ['246,913.58'], working: ['1234567.89*0.2']});
add('B09', 'a condition above a million does not refute its own verdict',
  '&i=spend:1234567%2E89:Spend&r=v:spend*1:Total&t=Verdict:v%3E1234569:Over&t=Verdict::Within',
  {values: ['1,234,567.89', 'Within'], working: ['1234567.89*1', '1234567.89>1234569']});

/* A key the language does not have is a card the renderer cannot draw. It
   used to fall through to a property nobody reads, so a pros-and-cons card
   written with b= for its bullets drew a headline and two empty blocks. */
add('B10', 'an invented key is refused', '&b=Better+balance&b=Higher+focus', {refused: true});
add('B10', 'and refusing it does not refuse the keys beside it',
  '&p=A+real+bullet', {refused: false, values: []});
add('B10', 'state keys the renderer writes are still accepted',
  '&i=n:2:N&c=:Box&s=g:1:One&s=g:2:Two&r=x:n*g:Result&w=3&k=1&x=1',
  {numeric: [6], values: ['6']});

/* Reader state and authored content look the same once both are in the
   fragment, so a model that writes w= silently replaces the numbers the card
   was built with. The print says which card the state was typed into. */
const STATED = '&i=n:2:N&r=x:n*10:Result';
addRaw('B11', 'state with no print is not this card\'s state',
  STATED + '&w=9', {numeric: [20], values: ['20']});
addRaw('B11', 'nor is state carrying another card\'s print',
  STATED + '&w=9&z=notaprint', {numeric: [20], values: ['20']});
add('B11', 'state printed against this card is the reader\'s own',
  STATED + '&w=9', {numeric: [90], values: ['90']});

/* A rate is money with something after it, and £/hr is what anybody writes
   for one. Matching the money units exactly sent a rate down the decorating
   path, so the symbol landed on the wrong end: 39.51£/hr. */
for (const [unit, want] of [['%C2%A3/hr', '£39.51/hr'], ['%C2%A3+per+hour', '£39.51 per hour'],
                            ['%24/unit', '$39.51/unit'], ['%C2%A3', '£39.51'], ['kg', '39.51kg']]) {
  add('B12', `money unit ${decodeURIComponent(unit.replace(/\+/g, ' '))} keeps its symbol in front`,
    `&r=rate:39%2E51:Rate&u=rate:${unit}`, {values: [want]});
}

add('B13', 'mod wraps a clock in both directions',
  '&r=a:mod(26,24):Ahead&r=b:mod(0-3,24):Behind', {values: ['2', '21']});
for (const [unit, want] of [['boxes', '21 boxes'], ['months', '21 months'], ['kWh', '21 kWh'],
                            ['kg', '21kg'], ['m2', '21m2'], ['%25', '21%'], ['%C2%B0C', '21°C']]) {
  add('B14', `unit ${decodeURIComponent(unit)} sits a space away only when it is a word`,
    `&r=n:21:N&u=n:${unit}`, {values: [want]});
}
add('B13', 'mod by zero gives dash', '&r=x:mod(5,0):Result', {numeric: [null], values: ['—']});

// Current bounded behaviour, recorded as limits rather than demands for new
// capabilities. These may change only with a deliberate contract decision.
add('limits', 'undefined reference gives dash', '&r=x:missing*2:Result', {numeric: [null], values: ['—']});
add('limits', 'division by zero gives dash', '&r=x:1/0:Result', {numeric: [null], values: ['—']});
add('limits', 'dependency cycle gives dash', '&r=x:y+1:X&r=y:x+1:Y', {numeric: [null, null], values: ['—', '—']});
add('limits', 'unknown condition does not choose fallback', '&t=V:missing>1:Yes&t=V::No', {values: ['—']});
add('limits', 'no matching outcome and no fallback gives dash', '&t=V:1>2:Yes', {values: ['—']});

// Real DOM and real event handlers. Only OS clipboard/share calls are stubbed,
// so tests can click without opening a share sheet or changing the clipboard.
/* `part` splits the run across two Chrome processes. Loading a fixture and
   writing reader state are both navigations, and Chrome allows a limited
   number per document. One process doing both put the tests at the end of the
   run over that limit, so they failed for want of a navigation rather than
   for anything the card did - and adding a case anywhere moved which ones.
   Each half gets a document of its own. */
async function browserProbe(fixtures, part) {
  const results = [];
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const record = (id, name, ok, detail = '') => results.push({id, name: 'browser: ' + name, ok, detail});
  const texts = selector => [...document.querySelectorAll(selector)].map(el => el.textContent);
  /* Seeded reader state needs the print the renderer would have written with
     it, or the card reads it as state from some other card and ignores it. */
  const open = (hash, raw) => {
    const frag = hash.replace(/^#/, '');
    history.replaceState(null, '',
      !raw && /(^|&)(w|k|x)=/.test(frag) ? hash + '&z=' + cardPrint(frag.split('&')) : hash);
    draw();
  };
  const refused = () => /could not be drawn/.test(document.querySelector('#main h1')?.textContent || '');
  if (part !== 'interactive') for (const c of fixtures) {
    try {
      open(c.hash, c.raw);
      const values = texts('#main .fv').concat(texts('#main .sv'));
      const working = texts('#main .fx');
      const numbers = parse(location.hash).blocks.flatMap(b => b.computed || []).map(row => row.value);
      record(c.id, c.name, refused() === !!c.want.refused &&
        (!c.want.values || equal(values, c.want.values)) &&
        (!c.want.numeric || equal(numbers, c.want.numeric)) &&
        (!c.want.working || equal(working, c.want.working)),
        JSON.stringify({refused: refused(), values, numbers, working}));
    } catch (e) { record(c.id, c.name, false, e.message); }
  }

  if (part === 'fixtures') return results;

  record('duration', 'duration units are explicit',
    equal([withUnit(1.5, 'hr'), withUnit(1.5, 'min'), withUnit(90, 'min'), withUnit(-2, 'hr')],
      ['1h 30m', '1m 30s', '90m 0s', '-2h 0m']));

  let sent = [];
  toClipboard = value => { sent.push(value); return Promise.resolve(); };
  Object.defineProperty(navigator, 'share', {configurable: true, value: undefined});
  for (const broken of [false, true]) {
    for (const nativeShare of [false, true]) {
      Object.defineProperty(navigator, 'share', {configurable: true,
        value: nativeShare ? data => { sent.push(data.url); return Promise.resolve(); } : undefined});
      open('#h=Actions&g=G&i=n:3:N&r=' + (broken ? 'n' : 'x') + ':n*2:Result');
      record('actions', 'correct page for action test', refused() === broken);
      for (const id of ['copyBtn', 'shareBtn']) {
        sent = [];
        const button = document.getElementById(id);
        if (button) { button.click(); await Promise.resolve(); }
        const invoked = sent.length === 1 && typeof sent[0] === 'string' && sent[0].length > 0;
        const rightLink = id !== 'shareBtn' || sent[0] === location.href;
        record(broken ? 'B01' : 'actions', `${broken ? 'refused' : 'valid'} ${id} (${nativeShare ? 'native' : 'clipboard'})`,
          broken && !button || invoked && rightLink, JSON.stringify({exists: !!button, sent}));
      }
    }
  }

  // Compose all three editable controls; check result, copied text, and reopen.
  const base = '#h=Mixed&g=G&i=n:2:Nights&s=rate:60:Basic&s=rate:90:Deluxe&c=extra:Breakfast&r=total:n*(rate+extra*10):Total';
  for (const n of [0, 3]) for (const pick of [0, 1]) for (const checked of [false, true]) {
    open(base);
    const input = document.querySelector('.ins input');
    input.value = n;
    input.dispatchEvent(new Event('input', {bubbles: true}));
    document.querySelectorAll('.picks input')[pick].click();
    const box = document.querySelector('.checks input');
    if (box.checked !== checked) box.click();
    const expected = String(n * ((pick ? 90 : 60) + (checked ? 10 : 0)));
    const before = texts('#main .fv');
    sent = [];
    document.getElementById('copyBtn').click();
    await Promise.resolve();
    const copied = sent[0] || '';
    const saved = location.hash;
    open('#h=Away');
    open(saved);
    record('state', `${n} nights, option ${pick}, breakfast ${checked}`,
      equal(before, [expected]) && equal(texts('#main .fv'), [expected]) &&
      copied.includes('Total: ' + expected) &&
      Number(document.querySelector('.ins input').value) === n &&
      document.querySelectorAll('.picks input')[pick].checked &&
      document.querySelector('.checks input').checked === checked,
      JSON.stringify({expected, before, reopened: texts('#main .fv'), saved}));
  }
  return results;
}


module.exports = {cases, browserProbe};
