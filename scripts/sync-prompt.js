#!/usr/bin/env node
// Keep the homepage's static prompt identical to llms.txt, apart from formatting.
// No build step: index.html remains checked-in HTML that any model can fetch.
const fs = require('fs');
const path = require('path');

function promptHTML(spec) {
  return spec.trim()
    .replace(/^# upshot$/m, 'WHAT TO DO')
    .replace(/^## (.+)$/gm, (_, heading) => heading.toUpperCase())
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = {promptHTML};

if (require.main === module) {
  const root = path.join(__dirname, '..');
  const file = path.join(root, 'index.html');
  const page = fs.readFileSync(file, 'utf8');
  const pattern = /<pre id="prompt">[\s\S]*?<\/pre>/;
  if (!pattern.test(page)) throw new Error('Cannot find the homepage prompt');
  const expected = '<pre id="prompt">' +
    promptHTML(fs.readFileSync(path.join(root, 'llms.txt'), 'utf8')) + '</pre>';
  const updated = page.replace(pattern, () => expected);
  if (process.argv.includes('--check')) {
    if (page !== updated) {
      console.error('Homepage prompt differs from llms.txt. Run node scripts/sync-prompt.js');
      process.exitCode = 1;
    } else console.log('Homepage prompt matches llms.txt');
  } else {
    if (page !== updated) fs.writeFileSync(file, updated);
    console.log('Homepage prompt synced from llms.txt');
  }
}
