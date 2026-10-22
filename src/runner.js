// runner.js — loads a single-file HTML prototype into jsdom and executes all gates.
// Only inspects; never modifies the file.
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const gates = require('./gates');

function runGates(file) {
  if (!fs.existsSync(file)) {
    console.error(`❌ file not found: ${file}`);
    return { pass: 0, fail: 1 };
  }
  const html = fs.readFileSync(file, 'utf8');
  const errs = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errs.push('jsdomError: ' + (e && e.message)));
  vc.on('error', (...a) => errs.push('console.error: ' + a.join(' ')));

  let dom;
  try {
    dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
  } catch (e) {
    console.log(`\n===== ${file} =====`);
    console.log(`  ❌ failed to parse/execute: ${e.message}`);
    return { pass: 0, fail: 1 };
  }

  const w = dom.window, d = w.document;
  w.scrollTo = () => {};

  const ctx = { file, html, dom, w, d, errs };
  console.log(`\n===== ${file} =====`);

  let pass = 0, fail = 0;
  for (const gate of gates) {
    try {
      const res = gate(ctx) || { pass: 0, fail: 0 };
      pass += res.pass; fail += res.fail;
    } catch (e) {
      fail += 1;
      console.log(`  ❌ [gate crashed] ${gate.name}: ${e.message}`);
    }
  }

  try { dom.window.close(); } catch (_) {}
  console.log(`\n========== ${file}: ${pass} PASS / ${fail} FAIL ==========`);
  return { pass, fail };
}

module.exports = { runGates };
