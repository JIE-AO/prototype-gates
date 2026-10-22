# prototype-gates

**CI-grade quality gates for single-file HTML prototypes** — the defects code review can't see, caught by machine assertions before your users do.

```bash
npx prototype-gates prototype.html
```

```
===== prototype.html =====
  ✅ runtime errors = 0 (jsdomError / console.error)
  ❌ all inline handlers defined (4 found)  — missing: goMine
  ✅ all 3 pages render via showPage()
  ✅ no duplicate ids (7 ids)
  ❌ return buttons lead somewhere (3 checked)  — mine: back-click stayed on page
  ❌ every DOM class has a CSS rule (orphans: users,order-appbar)
  ❌ claim coverage on #? (4 items)  — missing: Free
  ✅ forbidden content absent in #cardBack
  ❌ tab counters match list length (4 checked)  — tab-home: says 4, found 2
  ❌ no placeholder/template leakage  — {{, TODO
  ❌ setInterval usage guarded for headless runs

========== prototype.html: 4 PASS / 7 FAIL ==========
```

(That output is real — it's `examples/demo-broken.html` in this repo, a demo prototype deliberately seeded with 7 defects. `examples/demo-clean.html` passes 11/11.)

## Why this exists

Single-file HTML prototypes are the deliverable of AI-assisted product work: one `.html` file, an inline `<script>`, `section.page` + `showPage()` routing, `onclick="fn()"` handlers. They demo beautifully and die quietly.

Three classes of failure that **survive every code review** and hit users directly:

1. **Silently deleted functions.** An AI (or a sed one-liner) edits a function body with a regex that terminates at end-of-line — and swallows the *next* function defined on the same physical line. The static HTML looks perfect. At runtime: `w.someFn is not a function`, and the user's tab button does nothing.

2. **Claims vs. reality drift.** The page advertises "all 5 statuses" — the hand-placed demo data shows 5 on the home page and 4 on the dashboard. Every human reviewer misses it. Every user hits it in seconds.

3. **JS injection succeeded ≠ CSS matches.** A class gets renamed in CSS (`.p-row` → `.mrow`) but the JS template strings still emit `.p-row`. jsdom asserts "4 `.p-row` nodes exist" and everything is green — the real screen renders a pile of unstyled text. DOM presence is not styling.

`prototype-gates` turns each of these into a **machine gate**: load the file into jsdom, click real DOM nodes (never call internal functions — the assertion must equal the user's real path), assert on visible state. **Inspect-only: it never modifies your file.**

## The gates

| # | Gate | Catches |
|---|------|---------|
| 0 | Runtime errors | Any `jsdomError` / `console.error` — no silent exceptions allowed |
| 1 | Handler completeness | Every `onclick="fn()"` referenced in markup has a live `typeof fn === 'function'` — the regex-edited-away function |
| 2 | Page health | Every `section.page` renders via `showPage()` without throwing |
| 3 | Duplicate ids | `getElementById` silently returns the first match; dup ids make behavior order-dependent |
| 4 | Return-loop closure | Every back button actually navigates somewhere — no "click in, can't get out" dead ends |
| 5 | CSS class registration | Every class used in the DOM has a matching rule in `<style>` — catches rename drift |
| 6 | Claim vs. reality | Elements with `data-claim='["A","B",…]'` must contain every claimed item in their rendered text |
| 7 | Forbidden content | `data-forbidden='["secret","threshold"]'` containers are scanned — negative requirements stop regressing silently |
| 8 | Counter consistency | Tab badges with `data-count-target="#sel"` must equal the live element count — no hand-maintained drift |
| 9 | Placeholder leakage | `{{ }}`, `TODO`, `FIXME`, `lorem ipsum` never ship |
| 10 | Timer safety | Unguarded `setInterval` hangs headless/CI runners — enforced env-guard pattern |

Deeper documentation with the real-world failure stories behind each gate: [docs/gates.md](docs/gates.md).
The full war-story pitfall list (33 entries, each seen 2+ times in production): [docs/pitfalls.md](docs/pitfalls.md).

## Install

```bash
npm install -g prototype-gates
# or one-shot:
npx prototype-gates your-prototype.html
```

Requires Node ≥ 18. jsdom is the only dependency.

Exit code is CI-ready: `0` = all gates green, `1` = any FAIL. Drop it into GitHub Actions:

```yaml
- run: npx prototype-gates prototypes/*.html
```

## Declaring claims & forbidden content

Two gates are driven by tiny declarative attributes in your prototype:

```html
<!-- This container advertises "all 4 plans" — the gate enforces all 4 appear -->
<div data-claim='["Free","Pro","Team","Enterprise"]'>…pricing cards…</div>

<!-- This card must never leak internals — the gate scans rendered text only -->
<aside data-forbidden='["admin_endpoint","internal_threshold"]'>…</aside>
```

Scope matters: scan the constrained container, not `document.body` — demo data elsewhere on the page will otherwise force you to delete the assertion (that's a real failure mode; see pitfalls #3).

## Known limits (read before trusting a green run)

jsdom computes **no layout**. Gates here prove *logic and content*; they cannot see geometry. Three things jsdom is structurally blind to — all bitten us in production:

- **Visual collapse**: `backface-visibility` + keyframe `transform` overrides hid an entire card face; jsdom passed 40/40, the real screen was blank.
- **Off-viewport layers**: a bottom-sheet parked outside its shell by an entrance animation; `display:flex` flipped, users saw nothing.
- **Alignment**: vision models misjudge column alignment on scaled screenshots; measure `getBoundingClientRect()` centers (±1px), never ask a vision model "is this aligned?"

For anything animated, absolutely-positioned, or viewport-dependent, follow up with a real-browser pass (headless Chrome + `getBoundingClientRect` assertions, or Playwright). jsdom proves **"after the click, the logic is right"**; a real browser proves **"after the click, the user sees it"**. Deliver both for overlay/animation work.

## Origins

Extracted from a production skill (`prototype-jsdom-qc`) used daily to QA client-facing HTML prototypes — 429 lines of process plus 33 documented pitfalls, every one seen at least twice in real deliveries. Battle-tested on dozens of multi-page prototypes; this repo is its open-source extraction. The full methodology write-up (Chinese) lives in [docs/pitfalls.zh-CN.md](docs/pitfalls.zh-CN.md).

## License

MIT
