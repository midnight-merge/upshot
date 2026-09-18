#!/usr/bin/env node
/*
 * Collect a corpus of real generations against the current prompt.
 *
 *   OPENAI_API_KEY=... node scripts/gen-corpus.js
 *   OPENAI_API_KEY=... node scripts/gen-corpus.js --model gpt-5.6-terra --out test/corpus/today.txt
 *
 * The asks come from test/intents.txt; --intents points at another file.
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
 *   node test/transport.js test/corpus/<date>.txt
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
const MODEL = arg('model', process.env.MODEL || 'gpt-5.6-terra');
const TODAY = new Date().toISOString().slice(0, 10);
const OUT = path.join(ROOT, arg('out', `test/corpus/${TODAY}.txt`));

/* The asks live in test/intents.txt, one per line, so the list can be edited
   without touching this file. The label is the text before the dash. */
const INTENTS = path.join(ROOT, arg('intents', 'test/intents.txt'));
const ASKS = fs.readFileSync(INTENTS, 'utf8')
  .split('\n')
  .map(l => l.trim())
  .filter(l => l && !l.startsWith('#'))
  .map(l => [l.split(/[-\u2014\u2013]/)[0].trim(), l]);

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
    process.stdout.write(`  ${shape.slice(0, 34).padEnd(36)} `);
    try {
      const {url, reply} = await ask(spec, question);
      if (url) {
        got++;
        lines.push(`# ${question}`, url, '');
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
  fs.mkdirSync(path.dirname(OUT), {recursive: true});
  fs.writeFileSync(OUT, lines.join('\n'));
  console.log(`\n${got}/${ASKS.length} cards written to ${path.relative(ROOT, OUT)}`);
  console.log(`Score them:\n  node test/transport.js ${path.relative(ROOT, OUT)}`);
}

main();
