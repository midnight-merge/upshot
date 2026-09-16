#!/usr/bin/env node
/*
 * Collect a corpus of real generations against the current prompt.
 *
 *   OPENAI_API_KEY=... node scripts/gen-corpus.js
 *   OPENAI_API_KEY=... node scripts/gen-corpus.js --model gpt-5.6-sol --out test/corpus-today.txt
 *
 * The chat window is the slow way to do this and the easy way to spoil it:
 * opening a card before it is saved writes the reader's own state into the
 * URL, and a reused chat lets the model copy its own last answer. Neither can
 * happen here.
 *
 * `llms.txt` is sent as the system message rather than fetched by the model,
 * so what this measures is the prompt itself and not whether the model
 * bothered to read the page.
 *
 * Writes one URL per line, then score it:
 *
 *   node test/transport.js test/corpus-<date>.txt
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const KEY = process.env.OPENAI_API_KEY;
const MODEL = arg('model', process.env.MODEL || 'gpt-5.6-sol');
const TODAY = new Date().toISOString().slice(0, 10);
const OUT = path.join(ROOT, arg('out', `test/corpus-${TODAY}.txt`));

/* One ask per card shape the language has, so a run covers the grammar rather
   than whatever happened to come to mind. Each is a question a person would
   actually ask, and none of them repeats an example in the prompt - a model
   that recites one of those has told you nothing. */
const ASKS = [
  ['tiers', 'Shipping cost. 1-9 items £5 each, 10-49 £3 each, 50+ £2 each. I type the count.'],
  ['bands', 'Sales commission. 5% on the first £20k of monthly sales, 8% on anything above.'],
  ['pick+box', "I'm picking a gym. Basic £22/month, Plus £35, Peak £48. Add £5 if I want a locker."],
  ['duration', 'How long to drive 340 miles at 62mph, including a 25 minute stop.'],
  ['checklist', 'Am I ready to submit my thesis? Chapters proofread, references checked, supervisor signed off, formatting done, printed copy ordered.'],
  ['two-stage', 'Cost of running my oven. 2.1kW, I use it 40 minutes a day, electricity is 24.5p per kWh. Monthly cost.'],
  ['percent', 'What percent of my day is meetings? I work 8 hours and have 3 hours of calls.'],
  ['spec sheet', 'Compare the two laptops I looked at: 14 inch, 16GB, 512GB, 1.2kg, £1,100 versus 16 inch, 32GB, 1TB, 1.8kg, £1,650.'],
  ['no criteria', 'Should we hire a contractor or train someone internally?'],
  ['steps', 'Steps to change a tyre.'],
  ['from a goal', 'My freelance rate. I want £52,000 a year, I bill 28 hours a week, and I take 5 weeks off.'],
  ['interacting', 'Split a £2,400 deposit between 3 flatmates, but one of them is taking the bigger room and pays 20% more.'],
  ['threshold', "Is my cat overweight? She's 5.8kg and the vet says her ideal is 4.5kg."],
  ['two blocks', 'Reasons to move the team to four-day weeks, and reasons against.'],
  ['calculator', 'Work out my monthly savings if I want £9,000 in 18 months and I already have £2,150.']
];

async function ask(spec, question) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY},
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {role: 'system', content: spec},
        {role: 'user', content: 'export this\n\n' + question}
      ]
    })
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  const reply = body.choices?.[0]?.message?.content || '';
  // the prompt asks for a URL and nothing else; take one anyway if it wrapped
  // the answer in prose, because that is a wording failure and not a card one
  const url = (reply.match(/https:\/\/upshot\.fyi\/\S*#\S+/) || [])[0];
  return {url, reply: reply.trim()};
}

async function main() {
  if (!KEY) {
    console.log('Set OPENAI_API_KEY first:\n\n  OPENAI_API_KEY=sk-... node scripts/gen-corpus.js\n');
    process.exit(2);
  }
  const spec = fs.readFileSync(path.join(ROOT, 'llms.txt'), 'utf8');
  const lines = [
    `# Real generations against the prompt as it stands, ${TODAY}.`,
    `# model: ${MODEL}`,
    '#',
    `#   node test/transport.js ${path.relative(ROOT, OUT)}`,
    ''
  ];
  let got = 0;
  for (const [shape, question] of ASKS) {
    process.stdout.write(`  ${shape.padEnd(12)} `);
    try {
      const {url, reply} = await ask(spec, question);
      if (url) {
        got++;
        lines.push(`# ${shape}: ${question}`, url, '');
        console.log('ok');
      } else {
        lines.push(`# ${shape}: NO URL - replied ${JSON.stringify(reply.slice(0, 120))}`, '');
        console.log('no URL in the reply');
      }
    } catch (e) {
      lines.push(`# ${shape}: FAILED - ${e.message}`, '');
      console.log('failed  ' + e.message);
    }
  }
  fs.writeFileSync(OUT, lines.join('\n'));
  console.log(`\n${got}/${ASKS.length} cards written to ${path.relative(ROOT, OUT)}`);
  console.log(`Score them:\n  node test/transport.js ${path.relative(ROOT, OUT)}`);
}

main();
