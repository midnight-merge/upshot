# upshot

Turn a chat conversation into a link you can send.

You're talking to an AI, it says something worth sharing, you say **"read
upshot.fyi and export this"**. It replies with a link. You send the link.

No account, no API key, nothing to install. Live at
[upshot.fyi](https://upshot.fyi).

## How it works

The whole export lives in the URL, after the `#`. Everything after `#` stays in
the browser and is never sent to the server, so this site never sees your
content and there is nothing to store.

That means one static page can render unlimited exports for free.

```
https://upshot.fyi/v1/#s=explainer&m=GPT-5&d=2026-09-06&a=...&h=...&v=...&p=...
```

`v1/index.html` reads those fields and draws the card. That's the entire system.

## Three documents, one job each

| | |
|---|---|
| `/` | the landing page and the format spec. Static HTML, no renderer |
| `/v1/` | the card. Ships an empty `<main>` and fills it from the fragment |
| `/broken/` | what a link with nothing renderable in it gets |

The split is not tidiness. One document that was both a landing page and a card
had to carry the whole format spec to every card link, lay it out as a very
tall page, then throw it away and put a ~500px card in its place. A document
that changes height that drastically after layout is a document iOS will hand
you scrolled, with the header up behind the browser chrome - which is a bug
this repo chased through five layout rewrites. Now neither document changes
height after it is laid out.

The path is the version. A fragment never reaches the server, so GitHub Pages
cannot route on it and the version has to live somewhere it can see: the path.
`/v1/` keeps rendering every link ever written against it, so a later format
gets `/v2/` and nothing already sent goes stale. An unversioned
`upshot.fyi/#link` is forwarded to `/v1/` by a head script, because the client
is the only thing that can see a fragment.

Fields are bounded by word count rather than URL length, because a model can
hold to "under 25 words" but cannot count characters of a percent-encoded URL.
The limits keep an export readable on one phone screen.

## The site teaches the AI

`/` is a landing page that spells out the format in plain text, and
`/llms.txt` says the same thing. Point an AI at the domain and
it learns the format on the spot. Nothing to paste, no saved prompt to go stale,
and the format can change without breaking anyone's setup.

Two things this depends on:

**The spec is static HTML.** Fetchers don't run JavaScript, so a spec built by
JS would be invisible to the thing it exists for.

**Phrasing matters.** "Export this to upshot.fyi" reads to a model as a request
to submit content to a website, which it refuses. Asking it to *read* the
domain works.

## Layout and the share image

An export is an ordinary scrolling page, one phone-width column at every
viewport - no media queries, no viewport units, nothing that depends on
measuring the viewport correctly. The signature sits at the end of the
document, in flow, like any other page.

**Share as image** draws the card onto a canvas and hands the PNG to the native
share sheet, for Instagram and X where a link is no use. It falls back to a
download on desktop. Nothing is fetched from a third party - the page has no
dependencies at all.

**Copy for AI** puts the card on the clipboard as plain text, so a reader whose
first reaction is "is that true?" can paste it into their own chat instead of
retyping it. It writes to the clipboard and nothing else - the content still
never leaves the browser, so the privacy claim on `/` holds unchanged. The
credit line underneath explains both this and how to make a card of your own,
because they are the same gesture: take it to an AI.

Both are icons on the signature line. An icon says what a button does and
nothing about what just happened, so each one ends by swapping its glyph for a
tick or a cross for two seconds and saying the same thing into a live region
for anyone not looking at it. The glyphs are the same 16px box, and
`test/run.js` measures the card during a confirmation - a swap that changed the
height would silently resize every image taken in those two seconds, and
`layout()` would still agree with itself throughout.

Neither may make its row taller than the signature beside it, because the
renderer draws that line by line and never sees the buttons. Two icons are also
46px where the same pair as text labels needed 176px, which is what lets the
model line keep the rest of the row - with labels it truncated anything longer
than "GPT-5".

The renderer wraps every block itself and sums the line counts into a height
before allocating the canvas, so the image cannot come out clipped. It reads
typography, colour and box metrics off the live computed styles, so the
stylesheet stays the one place the design is defined.

## The card

A fixed frame with up to three blocks stacked in the middle. The frame is
always the same shape, whatever the export is about:

| | |
|---|---|
| scope line | mono, quiet, one line on what was asked |
| headline | the conclusion, set large |
| verdict | one sentence, indented behind an accent rule |
| **blocks** | 0 to 3, each optionally labelled |
| signature | model, date, the two action icons, and how to make your own |

That fixed frame is the whole design language. Accent appears in exactly three
places - the verdict rule, the block labels, and the markers - so a card is
recognisable at a glance no matter which blocks it uses.

`g=` starts a block and labels it; the key that follows decides what kind:

| | |
|---|---|
| `p` | bullets |
| `o` | numbered steps, where order is the point |
| `c` | checklist, tappable. Ticks are written back into the fragment, so a viewer ends up holding a link to their own half-finished version and can pass it on |
| `f` | `Label~Value` rows. A spec sheet - what most people wanted a table for, without the table |
| `n` | `Value~Label` figures at headline size |
| `i` | `Name~Label~Default`. A box the reader types in. What they type is written back into the fragment |
| `r` | `Name~Label~Formula`. The card works the number out and prints the formula beside it |

Composition rather than a fixed set of card types, because the alternative was
an enum the model had to classify into, and past a handful of options an LLM
starts guessing. There is nothing to classify now: it picks blocks that fit.
A comparison is two labelled `p` blocks, which is also pros and cons, which is
also anything else that pairs.

Three is the cap. Not a technical limit - a card that needs four blocks is two
cards.

## The card as a tool

`i` and `r` are one feature in two halves: boxes the reader fills, and values
worked out from them. Together they make an export a small instrument rather
than a fixed answer - a model can write a calculator for one person's actual
situation, in one turn, and it arrives as a link with nothing to install.

`r` alone is barely worth the machinery. A number the sender's model already
worked out could just as well arrive as an `f` row, and the only thing the
evaluator buys is that the working is real rather than retyped. The point of
an evaluator is that something can change, and `i` is the thing that changes.

**What the reader types is written back into the fragment**, as one `w=` in
document order, exactly as one `k=` carries every tick. So a reader who adjusts
the numbers ends up holding a link to their own version and can pass it on -
the sender's card becomes theirs without either of them sending anything to
anyone. That is the same trick the checklist plays, and it is the closest this
format gets to shared state: the URL is the state, and the page is only what it
looks like.

Inputs are read before any result, so a formula can name one wherever it sits.
Results stay strictly ordered among themselves, which is what keeps a cycle
impossible; an input is a leaf and can never make one.

**The URL carries a formula, never code.** `evaluate()` is a tokeniser and a
recursive-descent parser over a closed set of operators and eight named
functions. `eval()` or `Function()` would have been shorter and would have
handed any stranger's link the run of the page, on a domain whose only real
asset is that people trust what it opens. Names resolve through
`hasOwnProperty` on both sides, so nothing in a URL reaches `constructor` or
the prototype chain.

Results are evaluated in document order and each joins the environment the next
can see, so a long calculation breaks into named steps. A row with an empty
label is a step that feeds the rows below and is not drawn.

**The printed formula substitutes its names.** A step with no label is not on
the card at all, so a row citing `s*18` cites something invisible - which is
showing your algebra, not your working. Names resolve to what they held, so the
row reads `48*18`, and a row that would only restate its own number prints no
formula at all.

For both `i` and `r` the first field is always the name, even when empty.
Counting tildes instead would make `i=p~Price` ambiguous - a name with no
default, or a label with one - and it would guess wrong in silence.

**Every failure draws a dash.** Unknown name, bad syntax, divide by zero - all
come back as `null`. A number that is not a number must never reach the card
looking like one, which is also why the formula is printed next to its result:
arithmetic reads as objective in a way a sentence does not, and the same layout
that makes a good answer look authoritative does it for a wrong one.

Two spellings of the same formula have to mean the same thing, because `+` is a
space in a fragment and a model that writes `2 + 3` instead of `2%2B3` is
making the ordinary slip. A space touching an operator was never a plus and is
dropped; a space between two operands is where the `+` went. `r` draws the
same row as `f` and shares its measuring walk - a result is a fact the card
worked out - so the share renderer needed nothing new.

Each block declares two things in `BLOCKS`: the HTML for its items, and how the
share renderer redraws them in canvas ops. That second one is the tax for a
hand-drawn share image: every block is two implementations that have to agree.
`node test/run.js` renders each one and checks the renderer's height against
the browser's, which is what tells you when they have stopped agreeing.

## Gotcha: WhatsApp and punctuation

A raw comma or full stop inside a value stops WhatsApp turning the text into a
link, and the rest arrives as plain text. Encode them as `%2C` and `%2E`.

**Brackets have the same problem and it took formulas to find it.** WhatsApp
matches parentheses, because a URL written inside brackets in prose should not
swallow the closing one. Balanced single pairs survive - `round%28p%2F2%2E5%29`
is fine - but the closing bracket of a *nested* pair ends the link, and the
rest of the card arrives as plain text. `round(w*(1+r/30))` cuts a link in
half. Encode them as `%28` and `%29`.

This only showed up once `r` existed. Prose rarely nests brackets; arithmetic
does almost nothing else. Encoding them costs about 5% of the URL and removes
the whole class.

Length, `&`, `%22`, hyphens, digits and capitals are all fine, tested to 800
characters. `VISION.md` has the full results.

## Files

| | |
|---|---|
| `index.html` | landing page and spec. Static, plus a head redirect for unversioned `#links` |
| `v1/index.html` | the card: renderer, share image, and nothing else |
| `broken/index.html` | the page a link with no content in it lands on |
| `llms.txt` | the format, for AIs that look there |
| `robots.txt`, `sitemap.xml` | let crawlers in, point at the spec |
| `CNAME` | custom domain for GitHub Pages |
| `VISION.md` | product direction, decisions, and test findings |
| `test/run.js` | regression tests, no dependencies |

## Running it

```
python3 -m http.server 8787
```

Open `http://localhost:8787/` for the homepage, and
`http://localhost:8787/v1/#h=Hello&v=A+verdict&m=GPT-5&d=2026-09-08` for an
export.

## Tests

```
node test/run.js
```

Drives whatever Chrome is on the machine. No dependencies, no install. Set
`CHROME=/path/to/chrome` if it cannot find one.

The page and the share image are two implementations of the same design - the
browser lays the card out from CSS, and `layout()` re-derives it in canvas ops.
They can drift apart silently, so the tests render every card shape and check
that:

- the image's height agrees with what the browser laid out
- no canvas exceeds the size cap, which is what silently truncated long exports
- `.foot` is never positioned, because `getComputedStyle` reports a positioned
  element's *used* margin, which the renderer would read as zero
- nothing is fetched from a third party
- the inline script parses
- every expression evaluates to what it should, and every failure comes back
  as a dash - the one thing here that is right or wrong on its own terms
  rather than by how tall it draws, and the one that fails silently in
  production if it is wrong
- `/v1/` still ships an empty `<main>`, and `/` and `/broken/` are still static
  HTML with no script - the properties that keep the documents from collapsing
  back into one

`test/baselines.json` holds exact expected heights, which catch changes the DOM
comparison is too loose to see. Font metrics differ between operating systems,
so they are only meaningful on the machine that wrote them:

```
node test/run.js --update
```

after an intentional design change, or when moving machines.

## Status

Works end to end. Deployed on GitHub Pages.

The unproven part is reliability: whether a chat AI, given only the spec it
fetched, gets the punctuation encoding right consistently. `r` raises the same
question with a sharper edge, because a formula can be graded: a card that
asked for `4%2E5` and got `4.5` arrives broken in WhatsApp, and one that got the
arithmetic wrong arrives looking right. It has worked, but it
has not been run enough times to know the failure rate. If it turns out to be
poor, the fallback is base64 plus a paste box on the site, which works with any
AI but costs one extra step. See `VISION.md`.
