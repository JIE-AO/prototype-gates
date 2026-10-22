#!/usr/bin/env node
// prototype-gates CLI — usage: prototype-gates <file.html> [more.html...]
const path = require('path');
const { runGates } = require(path.join(__dirname, '..', 'src', 'runner'));

const args = process.argv.slice(2).filter(a => a !== '--');
if (args.length === 0) {
  console.log('Usage: prototype-gates <prototype.html> [more.html...]');
  console.log('  --strict   exit non-zero on any FAIL (CI mode, default behavior)');
  process.exit(args.includes('--help') ? 0 : 1);
}

let totalFail = 0;
for (const file of args) {
  const r = runGates(file);
  totalFail += r.fail;
}
process.exit(totalFail === 0 ? 0 : 1);
