# Upshot language and maintenance

This document defines the current language, its product constraints, test
process, regression coverage, and known limits. `llms.txt` is the model-facing
authoring contract. `v2/index.html` is the implementation.

## Sources of truth

| Subject | Source |
|---|---|
| Model authoring instructions | `llms.txt` |
| Parser, evaluator, renderer, and state | `v2/index.html` |
| Automated verification | `node test/run.js` |
| Architecture | `HOW_IT_WORKS.md` |
| Language maintenance and current status | This file |

The landing page contains a static copy of `llms.txt`. Run
`node scripts/sync-prompt.js` after changing the prompt. The automated suite
checks that the two copies match.

## Product constraints

- A card is fully represented by its URL fragment.
- Card rendering and calculation run in the browser.
- The renderer does not fetch card data.
- The language is a closed set of primitives. Visual variants do not receive
  separate keys.
- A card must provide a useful initial state before the reader changes it.
- Interactive headlines and summaries remain valid after input values,
  selections, or checks change.
- Formula working must reproduce the displayed result.
- Invalid card structure is refused. Unanswerable calculations display a dash.
- Unsupported capabilities remain limitations until a deliberate language
  change is approved.

The current language does not include free-text reader inputs, charts, images,
network requests, polling, interviews, server-side storage, or URL shortening.

## Frame and blocks

```text
a=Question                  scope of the card
h=Headline                  static headline
v=Summary                   static method or assumption
m=Model                     authoring model
d=YYYY-MM-DD                generation date
g=Label                     starts and labels a block
p=Wording                   bullet
o=Wording                   ordered step
f=Label:Value               fixed fact; both fields are text
c=name:Wording              checkbox; name may be empty
i=name:start:Label          editable number
s=name:value:Label          numeric choice; rows sharing a name form a group
r=name:formula:Label        computed number; name or label may be empty
t=Label:condition:Wording   decision outcome; rows sharing a label form a group
u=name:unit                 display unit for a name
k=state                     checkbox state written by the renderer
w=state                     input state written by the renderer
x=state                     choice state written by the renderer
z=print                     print of the card the state was typed into
```

`g=` is the only block boundary. A block may contain multiple primitive types.
Machine fields precede human wording. Human wording occupies the final field
where the grammar permits it.

## Primitive semantics

The middle column is what the reader sees, taken from a card carrying one of
each. Wording is the author's; every other character is drawn by the renderer.

| Key | Draws as | Behaviour |
|---|---|---|
| `p` | `• Wording` | Displays an unordered point |
| `o` | `1 Wording` | Displays an ordered step |
| `f` | `180ms`<br>`Cold start` | Displays fixed text as a value above its label |
| `c` | `[ ] Wording` | Displays a checkbox; a named checkbox evaluates to 1 or 0 |
| `i` | `[ 40000 ] Annual salary £` | Displays an editable numeric input; any unit rides on the label |
| `s` | `(•) Plan 2`<br>`( ) Plan 1` | Displays one exclusive option; the shared name holds the selected numeric value |
| `r` | `Monthly  £3,333.33  40000/12` | Evaluates and displays a numeric formula beside its working; an empty label creates a hidden intermediate result |
| `t` | `Budget  Over budget  3333.33>1000` | Displays the wording from the first true condition beside the comparison that chose it; an empty final condition is the fallback |
| `u` | `3333.33` → `£3,333.33`<br>`1.5` → `1h 30m` | Formats display output without changing the value used by formulas |

One or two `f` rows draw large, as shown. Three or more become a spec sheet.
The card decides that, not the author. `r` rows do not change shape with
count.

Decision rows sharing a label are one cascade. Rows remain together. The first
true condition wins. A fallback is optional and must be last. Decisions return
wording and do not declare formula names.

Inputs contain values supplied by the conversation or replaceable starting
values when the user requests a calculator without numbers. Starting values do
not require an example-value disclaimer.

## Names and dependencies

- Names use formula identifier syntax: `[A-Za-z_][A-Za-z0-9_]*`.
- Names are card-wide except `ticks` and `boxes`, which are scoped to their
  checklist block.
- `ticks`, `boxes`, and `pi` are reserved.
- A name is claimed once. A choice group is the exception because each option
  intentionally shares the group name.
- Formula references may point to declarations later in the fragment.
- A result requires a name when another formula uses it or when it has a unit.
- An unnamed checkbox contributes only to `ticks` and `boxes` in its block.

## Formulas

Supported formula elements:

- decimal and scientific-notation numbers;
- `+ - * / ( )`;
- names declared on the card;
- comparisons `< > <= >= == !=`;
- chained comparisons;
- constant `pi`;
- functions `min max round abs sqrt pow floor ceil ln exp`.

Formula results must be finite numbers. Decimal and scientific-notation
literals are supported. Undefined names, dependency cycles, division by zero,
and other unanswerable expressions display a dash.

Conditional numeric expressions are not part of the grammar. Use `t=` for a
wording decision.

## Units

Units affect display only. They do not propagate through formulas and do not
scale values.

- `£`, `$`, `€`, and `¥` use money formatting.
- `%` appends a percent sign to the numeric value.
- `hr` formats decimal hours with explicit hour and minute suffixes.
- `min` formats decimal minutes with explicit minute and second suffixes.
- Other units are appended to the formatted number.

Every displayed result that needs a unit declares its own unit.

## Static card wording

For interactive cards:

- `a` may repeat the user's specific question and supplied values.
- `h` names the task without embedding mutable values or selections.
- `v` describes the method or stable assumption without embedding mutable
  values or selections.
- Supplied values seed `i` and `s` fields.
- Current answers belong in `r` and current outcomes belong in `t`.

Missing decision criteria are not replaced with invented thresholds. The
authoring model remains responsible for factual premises and domain formulas.
The renderer is responsible for parsing, evaluating, and displaying the stated
card consistently.

## Encoding and size

- Spaces in wording become `+`.
- Wording keeps ASCII letters, digits, and hyphens unencoded.
- Formulas also keep `+ - / = _` unencoded.
- All other characters are UTF-8 percent-encoded.
- Colons used as field separators remain literal. Colons inside fields are
  encoded as `%3A` where the field position supports them.
- Authoring output remains below 2000 URL characters.

The 2000-character value is an authoring and transport budget. The renderer
does not enforce a runtime URL-length cap.

## Validation and failure behaviour

The renderer refuses structurally invalid cards, including:

- duplicate claimed names;
- reserved names;
- duplicate units for one name;
- a unit for an undeclared name;
- malformed numeric starts or option values;
- invalid identifier names;
- missing decision labels;
- a decision fallback before another outcome;
- formula syntax outside the supported grammar;
- a key the language does not have.

Reader state is honoured only when `z` matches a print of the card's authoring
fields. State with no print, or one taken from a different card, is ignored and
the authored start values stand. The renderer writes state and print together,
so a link a reader passes on always carries both.

The renderer displays a dash for a structurally valid value that cannot be
calculated, including undefined references, cycles, non-finite arithmetic, an
unknown decision condition, or a decision with no true outcome and no fallback.

## Automated testing

Run the complete suite with:

```sh
node test/run.js
```

`test/run.js` owns execution, the Chrome harness, and the final exit status.
`test/transport.js` provides transport, encoding, arithmetic, prompt-sync, and
generated-link scoring helpers. `test/boundaries.js` provides boundary fixtures
and browser assertions. Helper files do not launch separate suites.

Chrome is required. Set `CHROME` to its executable path if it is not found.

| Exit | Meaning |
|---|---|
| `0` | All automated assertions passed |
| `1` | One or more assertions failed |
| `2` | The run was incomplete, including a missing or failed browser run |

The suite verifies:

- prompt synchronization;
- URL encoding and simulated chat transport;
- fixed and generated arithmetic;
- parser and validator behaviour;
- rendered DOM, text, numbers, units, working, and refusals;
- numeric and identifier boundaries;
- combined inputs, choices, and checkboxes;
- fragment state after edits and after reopening;
- Copy and Share button handlers on valid and refused cards.

Clipboard and native Share calls are stubbed at the operating-system boundary.
The real page buttons and handlers are exercised.

Score a local file of generated links separately with:

```sh
node test/transport.js links.txt
```

This scorer reads one URL per line. Local model-generation corpora match
`test/corpus-*.txt` and are ignored by Git.

## Manual checks

For renderer, control, or transport changes:

1. Open one calculator, one checklist with a decision, and one choice card on
   a phone.
2. Change their controls.
3. Share them through the messaging client being evaluated.
4. Reopen the shared URLs.
5. Compare displayed values, control state, wording, and layout.

For prompt changes, paste the complete current `llms.txt` into a fresh model
chat and generate these cases:

1. taxi split;
2. paint quantity followed by cost;
3. required checklist;
4. hotel choice with optional breakfast;
5. savings target with a threshold crossing;
6. judgement without supplied numeric criteria.

Check the initial answer, change inputs or choices, cross any threshold, and
reopen a shared link. Random additional prompts are optional exploration.

## Maintenance procedure

1. State the behaviour being changed and the affected primitives.
2. Check compatibility with existing versioned URLs.
3. Add a failing regression case with a specific expected number, text,
   refusal, or user action.
4. Add a boundary or feature-interaction case when relevant.
5. Fix the implementation.
6. Run `node test/run.js`.
7. Perform the relevant manual checks.
8. Update `llms.txt`, run `node scripts/sync-prompt.js`, and rerun the suite if
   authoring instructions changed.
9. Record remaining behaviour as a bug, supported behaviour, or known limit.

Add cases to the existing runner or helpers. Do not create another test runner
or test framework. Generated corpora remain local. Do not commit, push, deploy,
or open a pull request unless requested.

## Release condition

A change is ready when:

- the complete automated suite exits 0;
- known bugs relevant to the changed area are resolved;
- compatibility decisions are explicit;
- relevant manual checks are complete;
- known limits relevant to the change are documented.

Report the revision, automated result, manual checks, open bugs, known limits,
and compatibility decision. Passing checks establish only the behaviour they
cover.

## Regression coverage

The suite includes regression cases for:

- Copy and Share controls on refused cards;
- strict numeric input and choice values;
- rejection of syntax outside the formula grammar;
- identifier validation;
- required decision labels;
- fallback ordering;
- variables that share names with formula functions;
- checklist counters used outside their checklist block;
- scientific notation in input, choice, and formula values;
- explicit duration units;
- a key outside the language, which used to be ignored silently;
- reader state arriving without this card's print;
- printed working that reproduces the result above a million.

## Current known limits and pending decisions

| ID | Current behaviour or decision |
|---|---|
| L01 | Unknown references, cycles, and division by zero display a dash. An unknown decision condition does not select its fallback. |
| L05 | The 2000-character budget is not enforced by the renderer. |
| L06 | Final wording can contain raw colons. Old four-field decision syntax cannot be distinguished reliably from legitimate wording. |
| D01 | `/v2/` compatibility starts when the version is declared released. A breaking post-release change requires `/v3/`. The release status must be explicit before changing field order or semantics. |
