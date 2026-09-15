# Fixing the language

Everything wrong with the format as it stands, and what to do about it. Written
15 Sep 2026, after a real generation hit a wall and printed spec syntax at a
reader.

Nothing here is a bug report against a model. Every item is ours: a model that
follows a wrong spec faithfully produces confidently broken output, which is
the failure this format exists to avoid.

`/v2/` is deployed but has never been shown to anyone outside a handful of
testers, so these changes go into `/v2/` in place rather than earning `/v3/`.
The path-is-the-version promise starts at launch, not before.

## How these are ranked

Three classes, worst first.

1. **Silent wrong answers.** The card renders, looks right, and is wrong. No
   dash, no broken page, nothing for a reader to notice. These are the ones
   worth breaking the format over.
2. **Walls.** The model wants to say something the vocabulary cannot express,
   so it improvises. The toddler card is one of these, and improvising is how
   a class 1 failure gets written.
3. **Shape.** Nothing is wrong today, but the grammar permits nonsense or the
   spec asks the wrong question.

Every finding below was reproduced against the real renderer on 15 Sep 2026.

## Class 1 - silent wrong answers

**A raw colon in a label silently mis-splits `i=`, `s=` and `t=`.** Only the
last field absorbs colons, and the label is always first.

    i=Be there by 9:30:n   ->  label "Be there by 9", value 30

Not detectable: "30" is a valid value and "n" a valid name, so nothing is
malformed. The card computes with 30 and looks perfect. The only defence is
the encoding rule, which the spec already carries.

**A duplicate name draws a dead control.** `i=Rate:5:x` and `i=Other:9:x` both
render. The second shows 9. Every formula reads 5. The reader has a box in
front of them that does nothing, and nothing says so.

**A fourth block vanishes.** Blocks past three are dropped with no dash and no
`/broken/`. A card labelled IMPORTANT disappeared in test.

**An input whose start value is not a number becomes 0.** `i=Name:abc:q`
computes as zero rather than refusing.

**`ticks` and `boxes` are card-wide.** Two checklists on one card share one
count, so a score for the first list silently counts the second. The formula
reads correctly and the number is wrong.

**`c=` eats a trailing word as a name.** `c=Bring one thing:passport` loses
"passport" from the label. `c=Bring ID: passport` survives, purely because of
the space. A heuristic, which is the thing the encoding rewrite was supposed
to end.

## Class 2 - walls

**`t=` is binary.** Under / about right / over is how people think about a
threshold, and the key cannot say it. A live generation tried to chain a
second condition into the false slot and the card printed
`c>=40:Snacks may stabilise the situation:Suspiciously reasonable` to a
reader. The spec says "Four fields, always" but never says what to do instead,
and a rule that forbids without offering an alternative gets broken.

**No units, anywhere.** `f=` can print "17%" because its value is free text.
`r=` cannot: it prints 0.17. So every numeric card smuggles units into the
label ("Interest rate percent") and results arrive bare. "Payment 222" of
what.

**No duration.** The known 5.64-not-5:38 soft spot. Same root as units: there
is no notion of what a number *is*, only what it equals.

**Nothing can read a decision.** `t=` has no name, so a verdict cannot feed
anything else on the card.

**A branching result cannot be named.** `r=Band:n>3?10:20:band` is dead, and so
is every row citing it, because `a?b:c` uses the field separator. Fails
honestly with a dash, but the model has no way to express it.

**No `exp`, `e` or `pi`.** `ln` is in the function list and has no inverse, so
compound growth is unreachable, and so is anything geometric.

**Chained comparison is unsupported.** `18<=age<65` draws a dash. Honest, but a
model will write it.

## Class 3 - shape

**Most key distinctions are advisory, not structural.** Nothing stops `c`
holding settled facts, `p` holding ordered steps, or `f` holding a number the
model worked out itself. One of those already failed under test.

**The decision table asks the wrong question.** It asks about widget behaviour
("the reader ticks it off?") rather than what the information is, which is how
a settled fact falls through into a checklist. VISION already flags re-cutting
it around provenance as the next language change.

## What to do

### Settled, cheap, no decision needed

**`t=` becomes a cascade.** Rows sharing a label are one decision. First true
condition wins. A row with an empty condition is the fallback and must be
last. Nothing matches and no fallback: a dash.

    t=Threat level:c>=80:Do not negotiate
    t=Threat level:c>=40:Snacks may stabilise the situation
    t=Threat level::Suspiciously reasonable

Three fields instead of four, which makes the **wording** the last field and
therefore colon-safe at last. The most fragile key becomes one of the safest.
Binary is two rows. Outcomes are uncapped; two or three goes in the examples,
not in the rules. Same grouping rule as `s=`, which a model got right cold,
and it is what the model reached for unprompted.

**Add `exp`, `e` and `pi`** to the function list. Pure addition, no format
change.

**Support chained comparison,** or keep the dash. Low stakes either way.

**Refuse instead of dropping silently.** A fourth block, a duplicate name, and
a non-numeric input start are all malformed cards. They should reach
`/broken/` with a reason rather than render something plausible. A dash is the
only honest failure, and a card that silently loses a block is not failing at
all.

### Needs a decision

**Units.** The hard one, because it is an attribute and the grammar has no
place for attributes. Three candidate shapes:

1. A fourth positional field on `r=` and `i=`. Rejected on sight: growing
   positional fields is exactly what we are removing from `t=`.
2. A declaration key, `u=name:£` or `u=name:prefix:suffix`, drawn nowhere and
   attaching a unit to a name. Consistent with "a repeated key beats a
   separator" and with one job per line. Costs a line per unit.
3. Formalise the smuggling: the card parses a trailing unit out of the label
   and renders it on the value. No new syntax, but it is a heuristic, and
   heuristics are what keep biting.

Option 2 is the only one that does not contradict a design law. Decide before
building.

**Duration.** Same root as units and should be solved by the same mechanism: a
number that knows it is minutes can be printed as 5:38. Do not add a
formatting function, because formulas return numbers and a formatter would be
the only exception.

**`ticks` and `boxes` scoping.** Card-wide is wrong, but block-scoped means a
card can no longer score across two lists at once. Block-scoped is the simpler
rule and matches how a reader sees the card. Confirm the trade-off is
acceptable.

**Naming a decision.** Probably refuse rather than fix. A decision is wording
chosen by a formula; feeding that wording back into another formula has no
obvious meaning. Left open.

### Deliberately not fixed

**The colon-in-label split.** Not detectable, and the encoding rule already
covers it. The right place to catch it is the scorer: flag a raw colon in a
label when scoring generations, so it shows up as a spec-adherence miss rather
than a silent wrong number in someone's card.

## Order

1. `t=` cascade, with the toddler card as the test case.
2. The refusals: fourth block, duplicate name, non-numeric start.
3. Functions: `exp`, `e`, `pi`.
4. Units and duration, once the shape is decided.
5. `ticks`/`boxes` scoping.
6. Re-cut the decision table around provenance, and validate it against real
   generations rather than reasoning.

Every one of these changes every shipped card, so the examples in `llms.txt`,
the landing page, `README.md`, `/made/` and the four homepage demos get
regenerated at the end, once, rather than after each step.

## The test that matters

Not the suite. The suite catches what we thought of. The question that found
the `t=` bug was a real person asking a real model for something nobody had
anticipated, and the answer arrived as spec syntax in a verdict slot.

Keep collecting generations. `node test/transport.js links.txt` scores any file
of them. A wall a model hit is worth more than a rule we reasoned our way to.

---

## Simulating the language

For the next session. The question was whether these issues could be found
automatically instead of by hand, and the answer is yes for most of them.

Six of the seventeen findings above were found by writing adversarial cards by
hand on one evening. That does not scale and it does not repeat. But nothing
about it was clever, which is the point: a generator would have found them
faster.

### The machinery already exists

`test/transport.js` lifts `parse` and `evaluate` straight out of
`v2/index.html` and drives them headlessly, then generates 3983 formulas and
checks each against plain JavaScript arithmetic. That is already differential
testing. It just points at formulas rather than at the grammar.

So this is an extension, not a new idea: point the same approach at whole
cards.

### The three parts

**A card generator.** Build cards from the grammar rather than from
imagination. Vary, deliberately and nastily:

- block count 0 to 6, so the cap is crossed on purpose
- every key, in every mix a `g=` allows
- labels drawn from a corpus of known-hostile strings: raw colons, `%3A`,
  paired `*` and `_`, nested brackets, commas, full stops, emoji, 200
  characters of one word
- names: fresh, duplicated, reserved (`ticks`, `boxes`), colliding across
  `i=`, `c=`, `s=` and `r=`
- values: integer, float, negative, tiny, huge, empty, not a number
- formulas: valid, citing a name defined later, citing a name never defined,
  ternary, nested brackets, chained comparison
- reader state: `k=`, `w=`, `x=` valid, short, long, and garbage

**The invariants.** This is the part that does the work, and most of them are
one line each:

1. **Conservation.** Every line the author wrote appears in the card, or the
   card refuses. Nothing written may silently vanish. *(catches the fourth
   block, the duplicate name, the `c=` word eaten as a name)*
2. **Fidelity.** Every label and every piece of wording drawn is byte-identical
   to what was authored. *(catches the colon mis-split, where "Be there by
   9:30" arrives as "Be there by 9")*
3. **Liveness.** Every control drawn is read by at least one formula, or is
   knowingly decorative. *(catches the dead duplicate-named input)*
4. **Reproducibility.** Every number shown is recomputable from the working
   printed beside it. *(already a stated principle, never enforced by a test)*
5. **State round-trip.** Any reader interaction writes a fragment that redraws
   the identical card. *(covers `k=`, `w=`, `x=` together)*
6. **Honest failure.** A malformed card draws a dash or reaches `/broken/`. It
   never draws a plausible number. *(catches the non-numeric start becoming 0)*

Invariant 1 alone would have caught four of the six class 1 findings.

**A shrinker.** When a generated card fails an invariant, cut fields until it
stops failing, and report the smallest card that still breaks. Without this the
failures are unreadable and nobody acts on them.

### What it cannot catch, and what to do instead

A generator only ever checks the properties you thought to state. It would not
have found that `t=` is binary, because that is not a broken card - it is a
card nobody could write. Every wall in class 2 is invisible to a fuzzer.

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
