# Designing the language

The format as it stands, what is wrong with it, and the language that replaces
it. Written 15 Sep 2026, after a real generation hit a wall and printed spec
syntax at a reader.

Nothing here is a bug report against a model. Every item is ours: a model that
follows a wrong spec faithfully produces confidently broken output, which is
the failure this format exists to avoid.

This is a language change, not a patch, and it goes into `/v2/` in place.
See **Versioning**.

## Root cause

Seventeen findings were reproduced against the real renderer. They are three
bugs.

**One separator doing two jobs.** A colon separates fields and also appears in
prose. Any key whose wording is not the last field is unparseable in
principle, because only the last field absorbs colons. That single fact
produces the colon mis-split, the `c=` heuristic that eats a trailing word,
the fragility of `t=`, and the dead `r=Band:n>3?10:20:band`.

**Values are untyped.** A number does not know whether it is pounds, a
percentage, minutes or a count. That absence produces: no units anywhere,
no durations, `f=` able to print "17%" while `r=` prints 0.17, results that
arrive bare ("Payment 222" of what), and `i=Name:abc:q` silently computing as
zero.

**Names are the data model and are never declared.** Every name is minted as a
trailing positional field in passing. So duplicates collide silently,
`ticks` and `boxes` can be shadowed, scope is card-wide by accident, `t=`
cannot have a name at all, and there is no arity, liveness or type check
anywhere in the grammar.

Fix those three and eleven of the seventeen findings stop existing rather than
getting fixed.

## The laws

**1. Machine fields first, one human field last.** A line is split n-1 times
from the left; everything after the last split is wording. Names, numbers,
formulas and conditions have restricted character sets and can never be
ambiguous. Wording can contain anything, encoded or not, and is safe because
nothing follows it. The most fragile key in the language becomes one of the
safest.

Where a field is optional it is still present and may be empty. An empty
leading field costs one character and removes a heuristic; a heuristic is what
keeps biting.

**2. A name is declared once, with its attributes.** Anything true of a *name*
- its unit, its type, its label - is declared. Anything true of a *row* is
inline. This is the only mechanism that needs adding, and units, durations,
percentages, input validation, duplicate detection and labelling a decision
all fall out of it rather than each needing their own rule.

**3. Blocks are scopes.** `ticks` and `boxes` resolve within the block that
contains them. Card-wide was never a decision; it was the absence of one. A
card that wants to score across two lists names the boxes.

**4. Order does not matter.** Names resolve as a dependency graph, not in
document order. A formula may cite a name defined later. A cycle draws a dash.
Today the language is sequential by accident, which is one more thing for a
model to get wrong cold for no benefit.

**5. Hard constraints are the grammar, the encoding, and 2000 characters.**
Nothing else. Every word count, line count and block count is soft shape and
belongs in the examples. The three-block cap is gone. So are "under 35 words",
"1 to 4 words" and "three to five lines a block" as rules.

## The grammar

Unchanged, single field, already law-1 clean:

    g=Label                     starts and labels a block
    p=Wording                   a bullet
    o=Wording                   a step, where order is the point

Reordered so the wording is last:

    f=Value:Label               a known row
    c=name:Wording              a checklist item; name may be empty
    i=name:start:Label          a box the reader types in
    s=name:value:Label          one option of a pick-one, grouped by name
    r=name:formula:Label        a result; name may be empty
    t=name:condition:Wording    one outcome of a decision, grouped by name

New:

    u=name:unit                 the unit a name is printed in

`t=` is a cascade. Rows sharing a name are one decision, the first true
condition wins, and a row with an empty condition is the fallback and must be
last. Nothing matches and no fallback: a dash. Binary is two rows. Outcomes
are uncapped.

    t=Threat level:c%3E=80:Do not negotiate
    t=Threat level:c%3E=40:Snacks may stabilise the situation
    t=Threat level::Suspiciously reasonable

`f=` stays. It looked redundant once units existed - a known number with a
unit beside it is a result whose sum is just that number - but the difference
is not how it looks, it is where the number came from, and that is the one
distinction in the language that carries weight for a reader. It also falls
out cleanly: `f=` has no name, so it can have no declared attributes, so its
value stays free text and carries its own unit as it always has. The way this
gets disproved is the corpus showing models putting worked-out numbers in
`f=`, not an argument.

Rows group by their label, and an earlier draft of this document had them
group by a name instead, with `u=` carrying the label. Building it killed
that: a name bought nothing, because a decision yields wording and nothing can
compute with wording, while it cost a mandatory second line whose absence made
the whole decision vanish - the exact failure being removed here. Grouping by
label also decoupled `t=` from `u=`, and dropped `u=` to two fields.

The label leads, so it is the one field here not protected from a raw colon.
That is the same trade `f=` makes and for the same reason: a label is a short
noun phrase, wording is a sentence, and the sentence gets the safe slot.

A fallback prints the conditions that failed as its working. A row that wins
is its own proof, but a fallback wins because everything else did not, so the
failed conditions are the proof - and for a two-row decision that comes to
exactly the one condition the old four-field key printed. Printing nothing
there, which the first build did, hands the reader a verdict with nothing
behind it.

The grouping rule is the one `s=` already uses, which a model got right cold
and is what it reached for unprompted when it hit the wall.

`u=` carries a unit, a label, or both.

A unit does one of two jobs, and both are allowed:

- **It decorates.** `£`, `$`, `%`, `kb`, `ms`. Short free text, printed beside
  the number, which is left alone. Free rather than a closed list because
  shipped cards already carry "180ms" and "42kb" and no list will hold them.
- **It reformats.** A duration: `hr`, `min`, `s`, `days`. A closed list, and
  the only units that change the number as drawn, so 5.64 hours prints 5:38.

The closed list is short enough to state in the spec, which is what keeps two
behaviours in one slot from being a guess. Do not add a formatting function
instead: formulas return numbers, and a formatter would be the only
exception.

## Refusals

A malformed card reaches `/broken/` with a reason. It never renders something
plausible.

- a duplicate name
- two `u=` lines for one name
- a non-numeric `i` start value
- a name that shadows `ticks`, `boxes` or `pi`
- a unit declared for a name nothing on the card claims

A dash, not `/broken/`, for anything merely unanswerable: an undefined name, a
cycle, a `t=` group with nothing true and no fallback.

The fourth-block refusal is gone, because the cap is gone. It was the one
refusal that made a reader's outcome worse - today they lose a block, and the
refusal would have given them nothing at all.

## Functions

Add `exp` and `pi`. `ln` was in the list with no inverse, so compound growth
and anything geometric were unreachable. `pi` becomes a reserved name.

`e` was added as a constant too, and taken back out the same day. Rescoring
the corpus broke two real generations on it: a model had used `e` as the name
for energy, which is what `e` is for in any physics card anyone would write.
Reserving a single common letter to save writing `exp(1)` is a bad trade, and
the corpus said so before it shipped. Nobody names a variable `pi`.

Support chained comparison - `18<=age<65` - rather than drawing a dash at it.
A model will write it.

## The findings, and where they go

Kept because they are empirical and were each reproduced against the renderer.

**Fixed by law 1.** A raw colon in a label mis-splitting `i=`, `s=` and `t=`.
`c=Bring one thing:passport` losing "passport". `t=` being four positional
fields with only the last protected. This was previously marked "deliberately
not fixed, catch it in the scorer" - it is free now, and the scorer does not
need to know about it.

**Fixed by law 2.** No units. No durations. `f=` printing "17%" where `r=`
prints 0.17. `i=Name:abc:q` becoming 0.

**Fixed by law 3.** `ticks` and `boxes` being card-wide, so a score for one
checklist silently counted another. A block with no checklist in it does not
get the names at all rather than getting zero - zero would answer a question
the card cannot answer, and `ticks/boxes` would be a nonsense 0/0.

**Fixed by law 4.** A formula citing a name defined later.

**Fixed by law 5.** A fourth block vanishing with no dash and nothing in
`/broken/`. A card labelled IMPORTANT disappeared in test.

**Fixed by refusal.** A duplicate name drawing a live-looking control that no
formula reads.

**Fixed by addition.** No `exp` or `pi`. Chained comparison.

**Not fixed, and worse than it looks.** A branching *number* -
`r=Band:n>3?10:20:band` - is dead because `?:` collides with the field
separator, and law 1 does not save it: a formula is a machine field, so it is
never last.

The `t=` cascade does not cover this, and the earlier draft of this document
was wrong to imply it might. A decision yields *wording*, not a number, so
nothing can compute with it - naming a `t=` makes it groupable and labellable,
not citable. A banded number is a genuine wall of the same class as `t=` being
binary: a tax band derived from a salary, a tier derived from a count, a rate
that steps. `s=` only helps when the *reader* picks the band; it cannot derive
one.

So there are three options and no free one:

1. A conditional in formulas with a non-colon syntax.
2. A cascade that yields a number rather than wording - `t=` and this would be
   the same shape with different outputs, which argues for one key with the
   distinction in the name it declares.
3. Leave the wall and let the corpus say how often models hit it.

Option 2 is the most consistent with the rest of this document and the most
work. Do not pick from reasoning alone - this is exactly the kind of wall the
corpus run is for, and the cost of guessing wrong is a key nobody uses.

**Deliberately unresolved.** Most key distinctions remain advisory rather than
structural. Nothing stops `c` holding settled facts, `p` holding ordered
steps, or `f` holding a number the model worked out itself. One of those
already failed under test. The grammar cannot enforce provenance; only the
decision table can push on it, which is why the table gets re-cut.

## Still open

**Does `u=` pay for itself?** It costs a line per attributed name, maybe
fifteen to twenty characters, against a 2000-character budget. Fine on a
five-name card. The alternative - declaring labels there too, so every drawing
key becomes pure machine data - is architecturally cleaner and was rejected on
two grounds: the character cost roughly doubles, and a split declaration and
use is more for a model to keep in sync cold. Inline labels stay because a
model got `Label:Value:name` right first try. Revisit only if the corpus shows
`u=` being skipped.

**No live corpus.** `test/generated.txt` is written against the old grammar
and was deliberately left that way - translating real generations into the new
grammar turns evidence into cards nobody wrote. So nothing currently measures
what models do with this language, which is the one thing the design cannot
reason its way to. Collecting a fresh corpus is the first thing to do next,
ahead of the decision table it is needed for.

**Re-cutting the decision table.** It asks about widget behaviour ("the reader
ticks it off?") rather than what the information is, which is how a settled
fact falls through into a checklist. VISION has the 2x2 - who knows it, and
can the reader change it. Add the type axis and it becomes the real question.
Validate against real generations rather than reasoning.

## Versioning

This goes into `/v2/` in place. `/v2/` has not been launched - it has been
seen by a handful of testers and nothing else - so there is no body of links
in the world to protect. The path-is-the-version promise starts at launch, and
`/v3/` is what the next change after that earns.

The argument for taking `/v3/` now, recorded because it is the stronger
argument on the merits and was overruled on the facts: a field reorder does
not break an old card, it renders it wrongly. `i=Bill:80:bill` reads under the
new grammar as a name of "Bill", a start of 80 and a label of "bill". The keys
are identical and only their order changes, so nothing can detect an old card
in order to refuse it - it just draws, and looks fine. That is a class 1
silent wrong answer at the level of the version.

It is the right call anyway if no such links exist, which is the part only we
can know. It stops being the right call the moment one is sent to someone who
is not a tester.

## Order

All of this is built, 15 Sep 2026. Both suites pass - 300 checks in
`test/transport.js`, and `test/run.js` green against real Chrome.

1. Law 1: the field reorder, with `fields()` the one owner of a line. Done.
2. Law 4: names as a dependency graph. Done.
3. `t=` as a cascade, with the toddler card as the test case. Done.
4. Law 3: blocks as scopes. Done.
5. The refusals, drawn on the card rather than at `/broken/`. Done.
6. Functions: `exp`, `pi`, chained comparison. Done.
7. Law 2: `u=`, both kinds of unit. Done.
8. Law 5: the soft shape out of the rules. Done.
9. Re-cut the decision table, validated against generations. **Not done** -
   the only item left, and the one that wants real generations rather than
   reasoning.

Every example was regenerated at the end rather than after each step:
`llms.txt`, the landing page, `README.md`, `/made/` and the homepage demos.
All 76 shipped cards render clean, the 32-card corpus in
`test/generated.txt` included.

### What the refusals do instead of `/broken/`

`/broken/` stays static HTML with no script, which is a deliberate invariant -
it is the page that has to work when everything else has not, and there is a
test asserting it. So a refused card explains itself in place, keeping the
frame and the scope line, since those are the parts of a malformed card still
worth trusting. `/broken/` remains for a link with nothing in it at all.

The first build sent refusals to `/broken/#why=` and had it render the reason
with a script. That broke the invariant and told the reader to go looking for
a truncated link when the link had arrived whole.

## What looking at a card found

The suites were green and both of these were live. Neither is findable by a
structural check, which is the argument for the invariants and for opening the
thing.

**A result wore its unit; an input did not.** `u=apr:%` put `%` on every
computed row and nothing on the box, so a card still read "Interest rate 24" -
24 of what, which is the entire problem units were added to solve. The unit
now rides on the input's label, dimmed, because a number input cannot hold a
`£` and a third column would break the alignment the fixed-width box exists to
protect. That is the same slot the model used to smuggle units into, and it
reads the same; what changed is that it is declared once as data and the card
decides how to draw it.

**The printed working did not reproduce the answer.** Class 1, and the worst
kind: the card was right and its own working said otherwise. A compound growth
step held 1.9991314, and because the working cited names through the same
two-decimal rounding the display uses, it printed `round(14000*2)` - which
recomputes to 28,000 under an answer reading 27,988.

`showNumber` presents and `plainNumber` proves, and they were the same
function. They are now different: six significant figures for working, two
decimal places for display. `twoPlaces` already carried half this fix below a
hundredth, with a comment about exactly this failure, so the reasoning was
already in the file - it just stopped at 0.01.

This was never about `exp`. Writing the test turned up `n/3` then `third*3`
printing `33.33*3 = 99.99` beneath an answer of 100, and `sqrt(2)` squaring
back to `1.41*1.41 = 1.99` beneath an answer of 2. Any named step holding a
repeating or irrational value had a self-refuting proof, on the most ordinary
card anyone could write. `exp` only made it easy to notice.

**Invariant 4 is now enforced**, in `sweepWorking`. It was a stated principle
of the format with no test behind it, and it failed the moment it got one.

## The first cold batch

Ten cards written against the new `llms.txt` and scored: 10/10 valid first
render, every value checked by hand rather than by pass rate. They covered a
how-to, a comparison, a spec sheet, a pick-one with units, a checklist driving
a three-way cascade, compound growth, a chained comparison, two checklists in
separate blocks, a duration, and a single figure.

Worth very little as evidence, and worth saying why: they were written by the
model that had just built the renderer. A corpus is for finding what the
author could not think of, and this author is the wrong subject. It does show
the spec is internally consistent enough to write against, and it is what
turned up both findings above. Real signal needs other models and fresh
sessions.

## The test that matters

Not the suite. The suite catches what we thought of. The question that found
the `t=` bug was a real person asking a real model for something nobody had
anticipated, and the answer arrived as spec syntax in a verdict slot.

Keep collecting generations. `node test/transport.js links.txt` scores any file
of them. A wall a model hit is worth more than a rule we reasoned our way to.

`test/asks.txt` is the fixed ask-set and how to run it. Fifteen asks in plain
English, crossed with every model reachable, a fresh chat each time. The list
does not change - that is what makes one month's run comparable to the next.

Asks 13 and 14 lean on the known wall on purpose: income tax bands and stamp
duty both want a banded *number*, which the language cannot say. What a model
does when it cannot say a thing is the most informative output in the run.

The scorer now reports two counts, and the second matters more:

    8/32 valid first render
    26/32 wrote syntax the grammar does not have

The first says whether a model got the spec right. The second says whether the
grammar came up short - a model wanted to say something, found no way, and
made one up. That is exactly how the `t=` wall was found, and it is the only
place a missing primitive shows up as a number. It catches an unknown key, a
`t=` written with four fields, a ternary, an operator the grammar does not
have, and a call to a function that does not exist.

Read the examples, not the count. One invention recurring is a feature
request. Many different ones mean the vocabulary is too weak.

---

## Simulating the language

For the next session. The question was whether these issues could be found
automatically instead of by hand, and the answer is yes for most of them.

Six of the seventeen findings above were found by writing adversarial cards by
hand on one evening. That does not scale and it does not repeat. But nothing
about it was clever, which is the point: a generator would have found them
faster.

### The machinery already exists

`test/transport.js` lifts `parse` and `evaluate` straight out of the renderer
and drives them headlessly, then generates 3983 formulas and checks each
against plain JavaScript arithmetic. That is already differential testing. It
just points at formulas rather than at the grammar.

So this is an extension, not a new idea: point the same approach at whole
cards.

### The three parts

**A card generator.** Build cards from the grammar rather than from
imagination. Vary, deliberately and nastily:

- block count 0 to 6, now that there is no cap to cross
- every key, in every mix a `g=` allows
- labels drawn from a corpus of known-hostile strings: raw colons, `%3A`,
  paired `*` and `_`, nested brackets, commas, full stops, emoji, 200
  characters of one word
- names: fresh, duplicated, reserved (`ticks`, `boxes`, `e`, `pi`), colliding
  across `i=`, `c=`, `s=`, `r=` and `t=`
- values: integer, float, negative, tiny, huge, empty, not a number
- formulas: valid, citing a name defined later, citing a name never defined,
  cyclic, nested brackets, chained comparison
- `u=` lines: absent, duplicated, attached to no name, unit only, label only
- reader state: `k=`, `w=`, `x=` valid, short, long, and garbage

**The invariants.** This is the part that does the work, and most of them are
one line each:

1. **Conservation.** Every line the author wrote appears in the card, or the
   card refuses. Nothing written may silently vanish.
2. **Fidelity.** Every label and every piece of wording drawn is byte-identical
   to what was authored.
3. **Liveness.** Every control drawn is read by at least one formula, or is
   knowingly decorative.
4. **Reproducibility.** Every number shown is recomputable from the working
   printed beside it.
5. **State round-trip.** Any reader interaction writes a fragment that redraws
   the identical card.
6. **Honest failure.** A malformed card draws a dash or reaches `/broken/`. It
   never draws a plausible number.
7. **Order independence.** Shuffling the lines of a card, within the blocks
   they belong to, draws the identical card.

Invariant 1 alone would have caught four of the six class 1 findings.
Invariant 7 is new and only meaningful once law 4 lands; it is the cheapest
possible check on the dependency graph.

**A shrinker.** When a generated card fails an invariant, cut fields until it
stops failing, and report the smallest card that still breaks. Without this the
failures are unreadable and nobody acts on them.

### What it cannot catch, and what to do instead

A generator only ever checks the properties you thought to state. It would not
have found that `t=` is binary, because that is not a broken card - it is a
card nobody could write. Every wall is invisible to a fuzzer.

Walls are found by real models hitting them. The toddler card was written by a
model that wanted a three-way threshold, found none, and invented one. That is
the signal, and it only appears in real generations.

So the second half is a corpus run: a fixed set of asks crossed with every
model available, scored with `node test/transport.js links.txt`, and counted
not only for valid renders but for **invented syntax** - a card where the model
wrote something the grammar does not have. A rising count there names the next
missing primitive without anyone reasoning about it.

Two halves, two jobs. The generator proves the renderer is honest about what it
was given. The corpus finds what nobody thought to give it.
