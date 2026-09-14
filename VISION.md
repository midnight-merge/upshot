# Vision

What upshot is, what was decided, and what was refused. The format itself is in
`README.md` and `llms.txt` — this is the reasoning behind it, the part that
isn't recoverable from the code.

Current as of 13 Sep 2026.

## What it is

A small UI language, and a compilation target. The human writes intent in chat,
the model compiles it, the card is the output. The asset is the closed
vocabulary, not expressiveness.

It is not an export format, and framing it as one undersells it. An export
preserves what was said. This produces something that *works* — it does the
sums, keeps the checklist, makes the call.

## The founding test

An upshot's founding moment is "I have something worth showing you" — a gift,
not an ask. Every interactive feature has to pass: **the card has to be good
even if the recipient never touches it.**

That test is what kills most feature ideas, and it should keep killing them.

## Settled architecture

**The whole card lives after the `#`.** A fragment never reaches the server, so
one static page renders unlimited cards for free, and there is structurally
nothing to store, leak, or sell. This is the good part. Don't change it.

**The path is the version.** A fragment never reaches GitHub Pages, so it can't
route on one — the version has to live where the server can see it: `/v2/`.
Every link ever written against `/v2/` keeps rendering, forever. A later format
gets `/v3/`. `/v1/` is frozen and still works.

The rule that follows: **a change that makes a previously-valid card render
differently is a new path, not an edit.** Those links are already out in the
world.

**Four documents, one job each.** `/` is landing page and spec. `/v2/` is the
card. `/broken/` is what an unrenderable link gets. `/llms.txt` is the spec for
models. Nothing is both a landing page and a card — that was five layout
rewrites of pain on iOS.

## How the link gets made — answered

The open question in the first version of this file was whether a plain chat
model could emit a clean URL by hand, or whether it needed base64 and a paste
box.

**Answered: it can.** ~30 consecutive clean links from GPT-5.6, two batches of
real generations at 100% valid, three clean cold links from Claude on 13 Sep
2026. The readable path lives.

**Base64 plus a paste box is rejected** (10 Sep 2026). "The beauty is llm >
upshot straight." One step is the product; three steps is a tool you have to be
motivated to use. Do not re-propose it — design within the readable URL instead.

**The verb matters.** "Export this *to* upshot.fyi" reads to a model as a
request to submit content to a website, which it refuses. Asking it to *read*
the domain works. So does the scheme: `read https://upshot.fyi` is materially
more reliable than `read upshot.fyi`, which a model has to recognise as a URL
before it can fetch one — and sometimes searches for instead. Both failures
happen at the entry point, where nothing downstream gets a chance to work.

The phrase is: **read https://upshot.fyi and export this**

## The design laws

- Cut any key whose only difference from another is how it looks. The card
  decides how things are drawn; that is not the model's job.
- A repeated key beats a separator.
- Soft shape belongs in examples, hard constraints in rules.
- The test for a new primitive: would a model get this right cold, first try,
  having seen the spec but no example of this exact case?
- Composition, not an enum of card types. An enum is something the model has to
  classify into, and past a handful of options an LLM starts guessing. There is
  nothing to classify now — it picks lines that fit.

## The model behind `f`, `i` and `c`

Worked out 13 Sep 2026, after a cold generation routed settled facts into a
checklist and produced a card that contradicted its own headline.

Two independent axes, not one:

|  | fixed | reader can change |
|---|---|---|
| **the conversation knows it** | `f` | `i` |
| **only the reader knows it** | — | `c` (yes/no), `i` (number) |

This is what an `i`'s `Start` value actually is — not a default, but *the
conversation's own number, left editable*. "Bill: 80" is an `f` row you can play
with. Once framed that way, `i` stops looking like an anomaly.

The decision table in `llms.txt` currently flattens this 2×2 into a linear list
of questions, and asks about widget behaviour ("the reader ticks it off?")
rather than about what the information is — which contradicts the first design
law and is how a settled fact falls through into `c`. **Re-cutting that table
around provenance is the next language change**, and it should be validated
against real generations rather than reasoning alone.

Note where `pick-one` lands on that grid: unknown + editable + *exclusive*. It
is a missing cell, not a nice-to-have.

## Refused on purpose

- **Reader text inputs** — can't feed a formula, and free text in a URL is a
  liability.
- **Charts and images** — break both "fits in a link" and the one-look design.
- **Anything that fetches** — kills the structural privacy claim outright.
- **The AI-generated interview, and polls** — both invert the gift into a chore.
- **A server-side shortener** — would fix everything and kill the free static
  thing.
- **Per-link preview cards** — would mean moving data into a `?query`, which
  means a real server, which means everyone's content in our logs. One good
  generic preview card instead.
- **v1's share-image renderer** — deleted. A v2 card is mostly inputs, results
  and checklists, and a picture of a tool is not one: it freezes one reader's
  numbers and presents them as the answer. Took ~650 lines with it.

## What the testing taught

**Model compliance is not the problem. We are.** Six bugs on 12 Sep 2026, four
more on 13 Sep — every one ours, none of them a model disobeying. A model that
follows a wrong spec faithfully produces confidently broken output, not garbage.
So spec bugs are *invisible*: they look like success until someone pastes a link
into WhatsApp.

That is the entire argument for the reference encoder in `test/transport.js` —
it's the Encoding section as executable code, and the only thing that makes a
spec bug fail loudly.

**Model the channel, not the renderer.** Every bug found on 12 Sep lived below
the renderer: the card drew perfectly from a URL a chat client had already
truncated. Opening a link in a browser proves nothing — the address bar never
truncates and never renders markdown. **Score links as text.**

**One rule beats a list of characters.** The encoding rule was a list, and the
list *was* the bug: `>` was told to be written plainly, `*` and `.` were wrongly
exempted, `\ ^ \` { | }` were never mentioned, and `_` silently ate `snake_case`
as italic. The rule is now one sentence — in wording keep letters, digits and a
hyphen; in a formula also `+ - / = _`; encode everything else — so a character
nobody thought about is encoded by default. It cost zero characters on the
worked examples.

The findings that produced it, kept because they're empirical and not
re-derivable: a raw comma or full stop inside a value stops WhatsApp linkifying
and the rest arrives as plain text (found 6 Sep). A closing bracket that ends a
*nested* pair does the same, which was invisible until formulas went in the URL,
because prose almost never nests brackets (found 9 Sep). Both are now covered by
the general rule rather than by name.

**Refuse, don't repair.** `decodeAll`'s decode-until-stable was added when
getting the encoding wrong was common; it couldn't tell a double-encoded comma
from text containing one. Removing it changed nothing across 34 known cards.
Same shape, 13 Sep: a `t=` whose condition has no comparison operator now draws
a dash rather than truthy-coercing a stray number into a real-looking verdict.

**A dash is the only honest failure.** `t=` used to treat "could not be worked
out" as "false" and print the losing branch with full authority. Anything
unanswerable draws a dash, as `r=` always did.

**The printed working must reproduce the answer when recomputed.** Formatting is
not cosmetic here — it is the proof.

**One owner for a grammar.** Splitting fields on colons happened in six places,
each re-deriving the rule, which is why `%3A` worked in some fields and silently
truncated in others.

**The scorer cannot see a wrong number.** Two of the worst bugs passed every
structural check — a card printed "Stay home. The numbers have spoken." with
every input dashed, and another showed working that recomputed to a different
answer than it displayed. Read the computed values, not the pass rate.

## Known gaps, ranked

1. **Pick-one.** Boxes are binary; a reader cannot choose one of N (tax band,
   tier, plan). Faking it with named boxes cannot stop them ticking three.
   Biggest expressive hole in the vocabulary.
2. **Units.** Every numeric card smuggles units into labels ("Interest rate
   percent") and results print bare — "Payment 222" of what. Arguably cosmetic,
   but an ambiguous number is not.
3. **Duration formatting.** The known 5.64-not-5:38 soft spot. Adding `ln` made
   it worse, because "how long until" cards became easy to write.
4. **`t=` is binary.** Three-way outcomes (under/right/over) need two `t=` rows
   that can contradict each other. It is also the most fragile key to parse —
   four positional fields, only the last protected from an embedded colon — and
   the only key whose *wording is chosen by a formula*, which is what makes a
   card feel alive. Most important, least robust. Resist fixing it with a
   heuristic that guesses which field is the condition; refusal is the right
   shape.
5. **The three-block cap is binding, not spare.** A comparison plus a verdict
   eats all three. Keep it — it protects the one-screen promise — but know it.

**Most key distinctions are advisory, not structural.** Nothing stops `c`
holding facts, `p` holding ordered steps, or `f` holding a number the model
worked out itself. The grammar accepts all of it. One of those failed under test
on 13 Sep; `p` vs `o` is the same shape of risk, untested.

## The live risk

Not encoding reliability any more. It is a model that has to *invent* a formula
rather than apply a known one — which the card then renders with full authority,
and whose printed working proves the arithmetic, not the premise.

Still unmeasured: other people's phrasing, and models beyond GPT-5.6 and Claude.
The corpus is how that gets measured — `node test/transport.js <file>` scores any
file of links, one per line. Keep collecting them.

## Where things stand

Live at [upshot.fyi](https://upshot.fyi), behind Cloudflare in front of GitHub
Pages. Zero `set-cookie` headers on `/`, `/v2/` and `/made/`, so the "no cookies"
line in Privacy is still true — re-check it if bot protection or WAF rules ever
go on. Do not enable APO or a Cache Everything rule; that is what would create a
stale-renderer risk. Traffic analytics are server-side with no script on the
page, so they can show homepage vs card vs `/made/`, never which card.

Homepage confirmed indexed by Google 13 Sep 2026.

`/made/` is curated by hand — a static list, no server, no moderation queue. A
submission box comes only when there are more good cards than can be collected by
hand, and the cheap version is a pre-filled GitHub issue rather than a backend.
The reason to delay: choosing what appears makes us a publisher, which
contradicts the Terms line that text on the domain "never reaches us to moderate
or remove." Ask permission before featuring a card — it lives in its URL and
cannot be edited or withdrawn by whoever made it.

## Working agreements

**Do not commit or push unless asked.** Make the edits, show the result, wait.
Same for opening PRs.

**Do not tack on rules.** A rule you have to remember is a rule that gets
skipped. Prefer a question that cannot produce the wrong answer — the same move
that replaced the character list with one encoding sentence.

**Terse imperative beats explanatory prose** in anything a model reads.
