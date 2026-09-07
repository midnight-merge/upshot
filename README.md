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
https://upshot.fyi/#s=explainer&m=GPT-5&d=2026-09-06&a=...&h=...&v=...&p=...
```

`index.html` reads those fields and draws the card. That's the entire system.

Fields are bounded by word count rather than URL length, because a model can
hold to "under 25 words" but cannot count characters of a percent-encoded URL.
The limits keep an export readable on one phone screen.

## The site teaches the AI

`index.html` with no fragment is a landing page that spells out the format in
plain text, and `/llms.txt` says the same thing. Point an AI at the domain and
it learns the format on the spot. Nothing to paste, no saved prompt to go stale,
and the format can change without breaking anyone's setup.

Two things this depends on:

**The spec is static HTML.** Fetchers don't run JavaScript, so a spec built by
JS would be invisible to the thing it exists for.

**Phrasing matters.** "Export this to upshot.fyi" reads to a model as a request
to submit content to a website, which it refuses. Asking it to *read* the
domain works.

## The card

An export is an ordinary scrolling page, one phone-width column at every
viewport - no media queries, no viewport units, nothing that depends on
measuring the viewport correctly. The signature sits at the end of the
document, in flow, like any other page. The homepage uses the same shell.

**Share as image** draws the card onto a canvas and hands the PNG to the native
share sheet, for Instagram and X where a link is no use. It falls back to a
download on desktop. Nothing is fetched from a third party - the page has no
dependencies at all.

The renderer wraps every block itself and sums the line counts into a height
before allocating the canvas, so the image cannot come out clipped. It reads
typography, colour and box metrics off the live computed styles, so the
stylesheet stays the one place the design is defined.

## Shapes

`s=` picks what the middle of the card is. Three exist:

| | |
|---|---|
| `explainer` | a conclusion and the points behind it. The default |
| `steps` | a how-to where order matters. Shares `p=` with explainer - only the presentation differs |
| `checklist` | things to do, tappable. Ticks are written back into the fragment, so a viewer ends up holding a link to their own half-finished version and can pass it on |
| `compare` | two named options with points under each, stacked |
| `facts` | a spec sheet of `Label~Value` rows. What most people wanted a table for, without the table |
| `stats` | two to four figures at headline size |

Six is about the ceiling. Every shape costs two implementations that have to
agree, a test case, and - the one that bites - a harder decision for the model.
The spec is a prompt, and past a handful of options an LLM starts guessing; a
mis-picked shape is a worse export than a plain explainer would have been.

A shape owns only the body beneath the verdict - the scope line, headline,
verdict and signature are the same whatever it is. Each declares three things
in `SHAPES`: whether a fragment carries its content, the HTML for its body, and
how the share renderer redraws that body in canvas ops.

That last one is the tax for a hand-drawn share image: every shape is two
implementations that have to agree. `node test/run.js` renders each shape and
checks the renderer's height against the browser's, which is what tells you
when they have stopped agreeing. A shape with no `measure()` still works as a
page, it just cannot be exported as an image.

## Gotcha: WhatsApp and punctuation

A raw comma or full stop inside a value stops WhatsApp turning the text into a
link, and the rest arrives as plain text. Encode them as `%2C` and `%2E`.

Length, `&`, `%22`, hyphens, digits and capitals are all fine, tested to 800
characters. `VISION.md` has the full results.

## Files

| | |
|---|---|
| `index.html` | the whole thing: landing page, spec, and renderer |
| `llms.txt` | the format, for AIs that look there |
| `robots.txt`, `sitemap.xml` | let crawlers in, point at the spec |
| `CNAME` | custom domain for GitHub Pages |
| `VISION.md` | product direction, decisions, and test findings |
| `test/run.js` | regression tests, no dependencies |

## Running it

```
python3 -m http.server 8787
```

Open `http://localhost:8787/` for the homepage. Add a fragment to see an export.

## Tests

```
node test/run.js
```

Drives whatever Chrome is on the machine. No dependencies, no install. Set
`CHROME=/path/to/chrome` if it cannot find one.

The page and the share image are two implementations of the same design - the
browser lays the card out from CSS, and `layout()` re-derives it in canvas ops.
They can drift apart silently, so the tests render eight cards and check that:

- the image's height agrees with what the browser laid out
- no canvas exceeds the size cap, which is what silently truncated long exports
- `.foot` is never positioned, because `getComputedStyle` reports a positioned
  element's *used* margin, which the renderer would read as zero
- nothing is fetched from a third party
- the inline script parses

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
fetched, gets the punctuation encoding right consistently. It has worked, but it
has not been run enough times to know the failure rate. If it turns out to be
poor, the fallback is base64 plus a paste box on the site, which works with any
AI but costs one extra step. See `VISION.md`.
