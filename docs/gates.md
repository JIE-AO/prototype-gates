# The Gates — what each one catches, and the failure story behind it

Every gate in this repo exists because a real prototype shipped a real defect of
this class. Each section: what the gate asserts, the failure mode as seen in the
wild, and why humans (and code review) systematically miss it.

## Gate 1 — Inline handler completeness

**Asserts:** every function referenced as `onclick="fn(…)"` in the static
markup exists as `typeof fn === 'function'` in the executed page.

**The failure:** a function body is edited via regex (by a human sed one-liner
or an AI applying a "targeted fix"). The regex is anchored to end-of-line — but
the next function was defined on the *same physical line* (`function a() {…} function b() {…}`).
The edit deletes `b` silently. The HTML renders flawlessly. Clicking the button
that calls `b` does nothing, or throws only in the console nobody opens.

**Why review misses it:** the diff shows one small in-place change. The deleted
function never appears in the diff as a deletion — it was on the same line.

**Workaround that fails:** grep for `function <name>(` after every edit. It
catches *known* names only; the gate catches all of them, including the ones
nobody thought to check.

## Gate 2 — Page health

**Asserts:** every `section.page` can be brought active via `showPage(id)`
without throwing.

**The failure:** a page whose init block references a function that a later
edit removed. The page is never visited in the happy-path demo, so nobody
clicks into it — until a stakeholder does, live.

## Gate 3 — Duplicate ids

**Asserts:** zero duplicated `id` attributes.

**The failure:** copy-paste a card, forget to change the id. `getElementById`
returns the first match, so every scripted interaction binds to a stale node.
Symptoms look like "buttons sometimes don't work" — never reproducible on the
reviewer's machine, always reproducible for the user.

## Gate 4 — Return-loop closure

**Asserts:** every back control visible on a page actually navigates to a
different page (the root page is exempt — back that stays is correct there).

**The failure:** "有去无回" — click in, can't get out. Deep pages get a back
button in the header template; a refactor renames the route map and one page's
back handler now toggles the page it's on. Demo always starts at home, so the
dead end is invisible until someone enters from the share link.

**Note:** this gate drives *real clicks on real DOM*, not `goBack()` calls —
a page can have its own back implementation distinct from the global one, and
only the real control equals the user's real path.

## Gate 5 — CSS class registration

**Asserts:** every class present in the live DOM has a `.classname` rule in
some `<style>` block.

**The failure:** JS template strings build rows as `<div class="p-row">`; a
later CSS refactor renames the class to `.mrow`. The gate "count `.p-row`
nodes === 4" still passes (DOM is fine!), the text is correct — and the screen
shows a pile of unstyled text, because nothing styles `.p-row` anymore.
**DOM injection success is not CSS matching.** Triple false-green: nodes exist,
text is right, screen is broken.

**Workflow this enables:** after renaming a CSS class, run the gates — any
template still emitting the old class turns red instantly.

## Gate 6 — Claim vs. reality

**Asserts:** any element carrying `data-claim='["A","B",…]'` contains every
claimed string in its rendered text.

**The failure:** the page headline says "快捷入口 · 各状态" (quick access · all
statuses). The statuses are hand-placed demo data: home shows all 5, the
dashboard shows 4. Every human reviewer — including the person who wrote it —
reads what they *expect*, not what's rendered. Users spot it in seconds,
because for them the claim is the spec.

**Why an attribute?** The claim must be *declared* to be *checked*; free-reading
the page cannot know what the page promises. One attribute turns marketing copy
into a machine-checked contract.

## Gate 7 — Forbidden content

**Asserts:** text inside a `data-forbidden='["…","…"]'` container never
contains the listed strings.

**The failure:** requirements say "must not display third-party names / risk
thresholds / internal field names". Positive assertions can't enforce
absence; nothing does — until the next iteration quietly reintroduces the
forbidden content and the suite stays green. Negative requirements **must**
be re-asserted every run or they regress silently.

**Scoping rule:** scan the constrained container, not the whole document.
Demo data elsewhere (a seeded admin nickname in an unrelated card) will trip a
document-wide scan, and the assertion gets deleted — that's how real suites
die. (See pitfalls #3.)

## Gate 8 — Counter consistency

**Asserts:** `data-count-target="#sel"` badges show a number equal to
`document.querySelectorAll(sel).length`.

**The failure:** tab says "Orders (5)", the list renders 4 — demo drift between
two hand-maintained places. Same root cause as gate 6, different symptom:
numbers are compared, not sets. The general lesson: **any fact stated twice in
the demo must be derived from one source** — either compute the badge, or let
the gate compute it.

## Gate 9 — Placeholder leakage

**Asserts:** no `{{ }}`, `TODO`, `FIXME`, `lorem ipsum` in the shipped file.

**The failure:** template scaffolding left from generation (`{{field}}`) ships
to a stakeholder demo. Small, embarrassing, and completely preventable.

## Gate 10 — Timer safety

**Asserts:** `setInterval` usage is guarded for non-browser runs
(`typeof process === 'undefined'`) or otherwise safe.

**The failure:** the prototype has a per-second "session timer". Under Node,
`setInterval` keeps the event loop alive forever — CI hangs until the runner's
timeout kills it (exit 124), and the log says nothing about why. The guard
pattern costs one line; the gate makes sure it stays there.

---

## What these gates deliberately do NOT cover

jsdom computes no layout, so **geometry is out of scope by design** — see
"Known limits" in the README. Three production incidents shaped this boundary:

1. A flip-card's front face was hidden by `backface-visibility:hidden` after a
   keyframe's `transform` overrode the static `rotateY(180deg)`. jsdom: 40/40
   green. Real screen: blank.
2. A bottom-sheet's entrance animation (`translateY(100%)` → parked at its own
   height) left it rendered outside the phone shell. `display` flipped; users
   saw nothing happen.
3. Vision models, asked "are these columns aligned?", misjudge scaled
   screenshots — twice reported a 0px-deviation grid as "shifted one column".
   Alignment verdicts must come from `getBoundingClientRect()` centers (±1px),
   never from a vision model.

For animated / absolutely-positioned / viewport-dependent work: run a real
browser (headless Chrome measuring rects, or Playwright) **in addition**.
jsdom proves *the logic after the click*; the browser proves *the user sees it*.
