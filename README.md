# upshot

Turn a chat conversation into something you can use.

You're talking to an AI, it says something worth sharing, you say **"read
https://upshot.fyi and export this"**. It replies with a link. You send the
link.

What arrives is not a summary. It does the sums, keeps the checklist, makes the
call - a small tool the AI built for the question you actually asked.

No account, no API key, nothing to install, on either end. Live at
[upshot.fyi](https://upshot.fyi).

## How it works

The whole card lives in the URL, after the `#`. Everything after `#` stays in
the browser and is never sent to the server, so this site never sees your
content and there is nothing to store.

That means one static page can render unlimited cards for free. It also means
the numbers a reader types are worked out on their own device and written back
into their own link - a calculator that structurally cannot phone home.

```
https://upshot.fyi/v2/#a=...&h=...&v=...&m=GPT-5&d=2026-09-10&g=Split+it&i=Bill:80:bill&i=People:3:n&r=Each+pays:bill/n
```

`v2/index.html` reads those fields and draws the card. That's the entire
system.

## Four documents, one job each

| | |
|---|---|
| `/` | the landing page and the format spec. Static HTML, no renderer |
| `/v2/` | the card. Ships an empty `<main>` and fills it from the fragment |
| `/v1/` | the same, for the format as it was. Frozen |
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
`/v2/` keeps rendering every link ever written against it, so a later format
gets `/v3/` and nothing already sent goes stale. An unversioned
`upshot.fyi/#link` is forwarded to `/v2/` by a head script, because the client
is the only thing that can see a fragment.

`/v1/` is what that promise costs, and it is the whole cost: a static file
nobody touches again. Links written before v2 still render exactly as they did.
Nothing new is written against it and the tests no longer cover it.

Fields are bounded by word count rather than URL length, because a model can
hold to "under 25 words" but cannot count characters of a percent-encoded URL.
The limits keep a card readable on one phone screen.

## The site teaches the AI

`/` is a landing page that spells out the format in plain text, and
`/llms.txt` says the same thing. Point an AI at the domain and it learns the
format on the spot. Nothing to paste, no saved prompt to go stale, and the
format can change without breaking anyone's setup.

Three things this depends on, all of them found the hard way:

**The spec is static HTML.** Fetchers don't run JavaScript, so a spec built by
JS would be invisible to the thing it exists for.

**The verb matters.** "Export this to upshot.fyi" reads to a model as a request
to submit content to a website, which it refuses. Asking it to *read* the
domain works.

**So does the scheme.** `read https://upshot.fyi` is materially more reliable
than `read upshot.fyi`, which a model has to recognise as a URL before it can
fetch one - and sometimes searches for instead. Both failures happen at the
entry point, where nothing downstream gets a chance to work, so both are worth
the characters.

**The spec is examples first.** A model copies a worked example far more
reliably than it applies a rule, and every rule is a branch that can go wrong.
Eight complete cards come before any prose, and the prose that survives is the
part that breaks links if ignored.

## The card

A fixed frame with up to three blocks stacked in the middle. The frame is
always the same shape, whatever the card is about:

| | |
|---|---|
| scope line | mono, quiet, one line on what was asked |
| headline | the conclusion, set large |
| verdict | one sentence, indented behind an accent rule |
| **blocks** | 0 to 3, each optionally labelled |
| signature | model, date, and how to make your own |

That fixed frame is the whole design language. Accent appears in exactly three
places - the verdict rule, the block labels, and the markers - so a card is
recognisable at a glance no matter which blocks it uses.

`g=` starts a block and labels it, and nothing else starts one, so a block
holds whatever mix of lines it needs:

| | |
|---|---|
| `p` | bullets |
| `o` | numbered steps, where order is the point |
| `c` | checklist, tappable. Ticks are written back into the fragment, so a viewer ends up holding a link to their own half-finished version and can pass it on. A formula can read them: `ticks`, `boxes`, or a box's own name |
| `f` | `Label:Value` rows. One or two on their own are set as headline figures, three or more become a spec sheet |
| `i` | an input box. What the reader types is written back into the fragment, the same bargain the checklist makes |
| `r` | `Label:Formula`. The card works it out and prints the formula beside it, every name replaced by what it held |
| `t` | `Label:Condition:When+true:When+false`. The card tests the condition and prints the wording that applies |

Composition rather than a fixed set of card types, because the alternative was
an enum the model had to classify into, and past a handful of options an LLM
starts guessing. There is nothing to classify now: it picks lines that fit. A
comparison is two labelled `p` blocks, which is also pros and cons, which is
also anything else that pairs.

Three blocks is the cap. Not a technical limit - a card that needs four blocks
is two cards. There is no cap on the lines inside one, because how many boxes a
tool needs is part of the tool.

A box can carry a name - `c=You have a railcard:card` - which a formula reads
as 1 when ticked and 0 when not. Two more names are always in scope: `ticks`,
how many boxes are ticked, and `boxes`, how many there are. Name the boxes when
the options differ from each other, count them when only how many matters. That is the whole of "referenceable
checkboxes" - no name per item, no change to `c=` or `k=`, nothing new in the
grammar - and it buys the shape a static list cannot do: tick what applies, get
a score and a verdict. `ticks/boxes` rather than a hardcoded total, so the card
survives the model adding a fifth item. Every item weighs the same; if
weighting ever matters, per-item names are still available and this does not
block them.

`i` and `r` are why the card is a tool rather than an answer: the AI writes the
formula, the reader supplies the numbers. Any question with that split is a
card waiting to be made. `t` is the same trick for a decision - the sender
writes the condition and both readings, the reader's own numbers pick which one
they see.

Inputs are read across the whole card before anything is computed, and results
are computed in document order, so a formula can name an input anywhere on the
card and a result defined above it. That makes a cycle impossible rather than
something to detect, and it lets a two-stage card work: name a step in one
block, use it in the next.

### Why `f` decides its own size

`n=` used to exist for a headline figure, next to `f=` for a spec-sheet row.
They were the same object - a labelled value - with the fields in opposite
orders, so the only thing the model chose between them was a look. That is the
card's job, not the model's, and the reversed order was a live trap. One key
now, and the card sets one or two rows large only when they are the whole
block: beside a bullet and a result, a row at 34px is not a figure, it is a row
shouting.

## Sharing

The link is the export, so the share button hands the URL to
`navigator.share` - the native sheet on a phone, a clipboard copy on desktop.
The other action copies the card as plain text for pasting back into a chat,
formula and all, because someone whose first reaction is "is that right?" is
about to paste it into their own model.

v1 drew the card onto a canvas and shared a PNG, for Instagram and X where a
link is no use. That is gone. A v2 card is mostly inputs, results and
checklists, and a picture of a tool is not one - it freezes one reader's
numbers and presents them as the answer. The OS screenshot button now does the
job, on a page that was already designed, which is what the hand-rolled
renderer was really for.

Removing it took about 650 lines with it, and with them the tax the README used
to describe: every block declaring two implementations, one in HTML and one in
canvas ops, that had to be kept in agreement. A block declares its HTML and
nothing else.

## Gotchas, all found by sending real links

**Punctuation.** A raw comma or full stop inside a value stops WhatsApp turning
the text into a link, and the rest arrives as plain text. Encode them as `%2C`
and `%2E`. A closing bracket that ends a nested pair does it too, which is why
the spec tells a model to name a step and reuse it rather than nest.

**Markdown in the chat you are replying in.** A bare `*` is an italic marker
and gets eaten before the reader ever copies the link, so `*` is always `%2A`.
v1 had the same problem with `~`, which is one of the reasons v2 separates
fields with `:` instead.

**`:` is safe**, tested end to end through WhatsApp, including after digits
where a linkifier might read `host:port`. `=`, `<` and `>` inside a condition
are safe too and are written bare.

**`+` where `&` was needed.** The one failure seen in real generations: a model
writes `&g=Freedom+r=Raw+runway`, the `+` decodes to a space, and the whole
`r=` is swallowed into the label - taking every formula downstream with it. The
card repairs this, but only inside a `g=`: a label is a few words and never
contains `r=`, so the split is unambiguous there in a way it would not be
inside a sentence.

**Length**, `&`, `%22`, hyphens, digits and capitals are all fine, tested to 800
characters. `VISION.md` has the full results.

## Files

| | |
|---|---|
| `index.html` | landing page and spec. Static, plus a head redirect for unversioned `#links` |
| `v2/index.html` | the card: parser, renderer, and nothing else |
| `v1/index.html` | the previous format, frozen |
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
`http://localhost:8787/v2/#h=Hello&v=A+verdict&m=GPT-5&d=2026-09-10` for a
card.

## Tests

```
node test/run.js
```

Drives whatever Chrome is on the machine. No dependencies, no install. Set
`CHROME=/path/to/chrome` if it cannot find one.

v1's suite existed mostly to police the share image: the browser laid the card
out from CSS, `layout()` re-derived it in canvas ops, and the two could drift
apart silently, so every case was pinned to an exact pixel height in
`test/baselines.json`. Those heights depended on the operating system's font
metrics and were only meaningful on the machine that wrote them.

Both are gone. With one implementation there is nothing to keep in agreement,
so the tests assert what the page renders instead - how many blocks, and every
figure in them - which is the same answer on every machine.

What they cover:

- every block kind, alone and mixed together in one block
- the arithmetic, the evaluator and the number formatter, including the
  formulas that should fail
- both branches of a `t=` decision
- the `+`-for-`&` repair, which has to come out identical to the card the model
  meant to write
- typing and ticking: the card, the `w=`/`k=` in the link, and what a reader
  sees when that link is opened fresh
- copy-for-AI carrying every block kind, which is where a key added to the
  renderer alone shows up as raw text
- nothing is fetched from a third party, the inline script parses, `/v2/` still
  ships an empty `<main>`, and nothing draws the card into a canvas
- the spec has not drifted: every worked example appears byte-identical in both
  the landing page and `llms.txt`, both escape the same characters, and every
  key in `BLOCK_KEYS` is documented

## Status

Works end to end. Deployed on GitHub Pages.

Reliability of the readable URL was the open question and now looks settled for
frontier models: around thirty consecutive clean links from GPT-5.6, and every
card it wrote through the v2 spec parsed and rendered. The one real failure was
the `+`-for-`&` slip above, which the card now repairs.

The unproven part is smaller and further out: whether a model that has to
invent a formula, rather than apply a known one, invents a defensible one. A
card renders `(upside*confidence*urgency)/10` with exactly the authority it
renders `bill/n`, and the printed working proves the arithmetic, not the
premise.
