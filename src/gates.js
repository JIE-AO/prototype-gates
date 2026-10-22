// gates.js — each gate inspects ctx { file, html, dom, w, d, errs } and returns { pass, fail }.
// Translated from a production skill used daily on real client prototypes.

// ── helpers ─────────────────────────────────────────────────────────────────
function makeHelpers(ctx) {
  const { w, d } = ctx;
  return {
    // Visible = element itself and every ancestor display != none.
    // getComputedStyle on a descendant does NOT inherit an ancestor's display:none.
    really(el) {
      let n = el;
      while (n && n.nodeType === 1) {
        if (w.getComputedStyle(n).display === 'none') return false;
        n = n.parentElement;
      }
      return !!el;
    },
    cur() {
      const p = d.querySelector('section.page.active');
      return p ? p.id : null;
    },
    txt(id) {
      return (d.getElementById(id) || { textContent: '' }).textContent;
    },
    // normalize text reads: jsdom's innerText can return non-strings
    txtAny(el) {
      return String((el && (el.textContent || el.innerText)) || '').trim();
    },
    showPage(id) {
      if (typeof w.showPage === 'function') { try { w.showPage(id); return true; } catch (_) { return false; } }
      return false;
    },
  };
}

function makeTracker() {
  let pass = 0, fail = 0;
  return {
    ok(name, cond, detail) {
      if (cond) { pass++; console.log(`  ✅ ${name}`); }
      else { fail++; console.log(`  ❌ ${name}${detail ? '  — ' + detail : ''}`); }
    },
    done() { return { pass, fail }; },
  };
}

// ── Gate 0: runtime errors (nothing else matters if the page throws) ───────
const runtimeErrors = ctx => {
  const t = makeTracker();
  t.ok('runtime errors = 0 (jsdomError / console.error)',
    ctx.errs.length === 0, ctx.errs.slice(0, 3).join(' | '));
  return t.done();
};

// ── Gate 1: inline handler completeness ─────────────────────────────────────
// The #1 silent disaster in AI-edited single-file prototypes: a regex-based edit
// deletes the next function on the same physical line. Static HTML looks fine;
// runtime says "w.someFn is not a function".
const handlerCompleteness = ctx => {
  const t = makeTracker();
  const { html, w } = ctx;
  const handlers = new Set();
  html.replace(/\son(?:click|input|change|blur|focus)\s*=\s*"([^"]*)"/g, (m, code) => {
    const mm = code.match(/^\s*([A-Za-z_$][\w$]*)\s*\(/);
    if (mm && !['event', 'this', 'window', 'document'].includes(mm[1])) handlers.add(mm[1]);
  });
  const missing = [...handlers].filter(n => typeof w[n] !== 'function');
  t.ok(`all inline handlers defined (${handlers.size} found)`,
    missing.length === 0, 'missing: ' + missing.join(', '));
  return t.done();
};

// ── Gate 2: every page renders without throwing ────────────────────────────
const pageHealth = ctx => {
  const t = makeTracker();
  const { d, w } = ctx;
  const pages = [...d.querySelectorAll('section.page')];
  if (pages.length === 0) { t.ok('SPA pages (section.page) — none found, skipped', true); return t.done(); }
  let shown = 0; const broken = [];
  for (const p of pages) {
    try {
      if (typeof w.showPage === 'function') w.showPage(p.id);
      else pages.forEach(x => x.classList.toggle('active', x === p));
      if (p.classList.contains('active')) shown++;
    } catch (e) { broken.push(p.id + ': ' + e.message); }
  }
  t.ok(`all ${pages.length} pages render via showPage()`, shown === pages.length, broken.join(' | '));
  return t.done();
};

// ── Gate 3: duplicate ids ──────────────────────────────────────────────────
const duplicateIds = ctx => {
  const t = makeTracker();
  const { d } = ctx;
  const ids = [...d.querySelectorAll('[id]')].map(e => e.id);
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  t.ok(`no duplicate ids (${ids.length} ids)`, dup.length === 0,
    dup.length ? 'duplicates: ' + [...new Set(dup)].slice(0, 5).join(', ') : '');
  return t.done();
};

// ── Gate 4: return-loop closure (no dead ends) ─────────────────────────────
// Every "‹ back" control must lead back to a real page. "有去无回" (click in,
// can't get out) is the most common UX death in single-file prototypes.
const returnLoops = ctx => {
  const t = makeTracker();
  const { d, w } = ctx;
  if (typeof w.showPage !== 'function') { return t.done(); }
  const pages = [...d.querySelectorAll('section.page')];
  if (pages.length < 2) { return t.done(); }
  // root page (active in static markup): "back" that stays is expected, not a dead end.
  // Read from raw HTML — earlier gates leave a different page active in the live DOM.
  const rootId = (ctx.html.match(/<section\b[^>]*\bclass="[^"]*\bactive\b[^"]*"[^>]*\bid="([^"]*)"/) ||
                  ctx.html.match(/<section\b[^>]*\bid="([^"]*)"[^>]*\bclass="[^"]*\bactive\b[^"]*"/) || [])[1];
  let checked = 0; const dead = [];
  for (const p of pages) {
    try { w.showPage(p.id); } catch (_) { continue; }
    const backs = [...p.querySelectorAll('[onclick]')].filter(el =>
      /back|return|‹|←|返回/i.test(el.getAttribute('onclick') + ' ' + el.textContent));
    for (const b of backs.slice(0, 3)) {
      checked++;
      const before = (d.querySelector('section.page.active') || {}).id;
      try { b.click(); } catch (_) { dead.push(p.id); continue; }
      const after = (d.querySelector('section.page.active') || {}).id;
      if (after === before && before !== rootId && pages.length > 1) {
        dead.push(`${p.id}: back-click stayed on page`);
      } else {
        try { w.showPage(p.id); } catch (_) {} // restore
      }
    }
  }
  t.ok(`return buttons lead somewhere (${checked} checked)`, dead.length === 0,
    dead.join(' | '));
  return t.done();
};

// ── Gate 5: CSS class registration ──────────────────────────────────────────
// JS template injection succeeds ≠ CSS matches. After a class rename, JS
// templates referencing .p-row while CSS only defines .mrow leaves "DOM has
// nodes + text correct + screen is a pile of unstyled text".
const classRegistration = ctx => {
  const t = makeTracker();
  const { d } = ctx;
  const css = [...d.querySelectorAll('style')].map(s => s.textContent).join('\n');
  if (!css) { return t.done(); }
  const miss = new Set();
  for (const el of d.querySelectorAll('*')) {
    for (const c of el.classList) {
      if (c && !css.includes('.' + c)) miss.add(c);
    }
  }
  t.ok(`every DOM class has a CSS rule (${miss.size ? 'orphans: ' + [...miss].slice(0, 6).join(',') : 'none'})`,
    miss.size === 0, '');
  return t.done();
};

// ── Gate 6: claim-vs-reality (文案宣称 vs 实际数据) ─────────────────────────
// Demo data is hand-placed: home shows 5 statuses, dashboard shows 4. Human
// review never catches it; users hit it instantly. Canonical list provided via
// data-claim="<json array>" on any element or via CLAIMS config.
const claimVsReality = ctx => {
  const t = makeTracker();
  const { d } = ctx;
  const claims = [];
  for (const el of d.querySelectorAll('[data-claim]')) {
    try { claims.push({ el, list: JSON.parse(el.getAttribute('data-claim')) }); }
    catch (_) { t.ok(`data-claim JSON valid on #${el.id || el.className}`, false, 'parse error'); }
  }
  for (const { el, list } of claims) {
    const text = el.textContent;
    const missing = list.filter(s => !text.includes(s));
    t.ok(`claim coverage on #${el.id || '?'} (${list.length} items)`,
      missing.length === 0, 'missing: ' + missing.join(', '));
  }
  if (claims.length === 0) t.ok('claim-vs-reality — no data-claim markers, skipped', true);
  return t.done();
};

// ── Gate 7: negative assertions (forbidden content) ────────────────────────
// "Must not show X" requirements silently regress. Scan with word-boundary
// awareness against rendered text of a specific container (#forbidden-scope
// attribute limits the scan domain).
const forbiddenContent = ctx => {
  const t = makeTracker();
  const { d } = ctx;
  const scopes = d.querySelectorAll('[data-forbidden]');
  if (scopes.length === 0) { t.ok('forbidden-content — no data-forbidden markers, skipped', true); return t.done(); }
  for (const scope of scopes) {
    let words;
    try { words = JSON.parse(scope.getAttribute('data-forbidden')); }
    catch (_) { continue; }
    const text = scope.textContent || '';
    const hits = words.filter(wd => text.includes(wd));
    t.ok(`forbidden content absent in #${scope.id || scope.className || '?'}`,
      hits.length === 0, 'found: ' + hits.join(', '));
  }
  return t.done();
};

// ── Gate 8: counter consistency ────────────────────────────────────────────
// Tab badge says 5, list renders 4 — the classic hand-maintained demo drift.
const counterConsistency = ctx => {
  const t = makeTracker();
  const { d } = ctx;
  let checked = 0; const mismatches = [];
  for (const tab of d.querySelectorAll('[data-count-target]')) {
    const sel = tab.getAttribute('data-count-target');
    let n = 0;
    try { n = d.querySelectorAll(sel).length; } catch (_) { continue; }
    const declared = parseInt((tab.textContent || '').replace(/\D/g, ''), 10);
    if (!isNaN(declared)) {
      checked++;
      if (declared !== n) mismatches.push(`${tab.id || tab.className}: says ${declared}, found ${n}`);
    }
    checked++;
  }
  t.ok(`tab counters match list length (${checked} checked)`, mismatches.length === 0,
    mismatches.join(' | '));
  return t.done();
};

// Gate 9: placeholder / template leakage ({{ }}, TODO, FIXME, lorem)
const placeholderLeak = ctx => {
  const t = makeTracker();
  const { html } = ctx;
  const leak = ['{{', 'TODO', 'FIXME', 'lorem ipsum'].filter(k =>
    html.toLowerCase().includes(k.toLowerCase()));
  t.ok('no placeholder/template leakage', leak.length === 0,
    leak.length ? leak.join(', ') : '');
  return t.done();
};

// ── Gate 10: cleanup — timers must not hang the process ────────────────────
const timerSafety = ctx => {
  const t = makeTracker();
  // Detect setInterval usage without a matching environment guard
  const { html } = ctx;
  const hasInterval = /setInterval\s*\(/.test(html);
  const hasGuard = /typeof\s+process\s*===\s*['"]undefined['"]/.test(html);
  t.ok('setInterval usage guarded for headless runs',
    !hasInterval || hasGuard,
    hasInterval && !hasGuard ? 'un-guarded setInterval will hang CI runners — wrap in env guard or clear it' : '');
  return t.done();
};

module.exports = [
  runtimeErrors,
  handlerCompleteness,
  pageHealth,
  duplicateIds,
  returnLoops,
  classRegistration,
  claimVsReality,
  forbiddenContent,
  counterConsistency,
  placeholderLeak,
  timerSafety,
];
