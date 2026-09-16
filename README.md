<div align="center">

<img src="og.png" width="640" alt="upshot — make the tiny tool you wish existed">

[![Licence MIT](https://img.shields.io/badge/licence-MIT-C8FF3D?style=flat-square&labelColor=12131A)](LICENSE)
![Dependencies none](https://img.shields.io/badge/dependencies-none-C8FF3D?style=flat-square&labelColor=12131A)
![Build step none](https://img.shields.io/badge/build_step-none-C8FF3D?style=flat-square&labelColor=12131A)
[![Live](https://img.shields.io/badge/live-upshot.fyi-C8FF3D?style=flat-square&labelColor=12131A)](https://upshot.fyi)

</div>

---

Drive or take the train. Whether the annual gym membership is worth it. What
you actually take home after the student loan. Small, specific questions that
nothing exists for and that aren't worth a spreadsheet.

Describe one to an AI and say **"read https://upshot.fyi and export this"**. It
hands back a link, and the link *is* the tool — boxes to type in, formulas that
work themselves out, a verdict that changes its mind when you change the
numbers.

The whole thing lives in the URL, so there is no account, nothing installed and
nothing stored anywhere. Keep it to yourself or send it to someone; it works the
same either way.

## See one

Question, verdict, boxes, formula and decision — all of it encoded in the URL,
and nothing else anywhere:

<div align="center">
  <img src="assets/card.png" width="330" alt="An upshot card: nine months is the number to beat. Three input boxes, a computed runway of 8.18, and a decision reading 'Not yet' with its condition 8.18>=9 shown beside it.">
</div>

These ones are live. Open them, type in the boxes, watch the numbers move:

- **[Splitting dinner three ways][dinner]** — change the bill or the number
  of people; each share updates in pounds.
- **[Do my savings meet my runway target?][runway]** — change a number and the
  verdict at the bottom changes its mind.
- **[UK take-home pay, with student loan plans][payslip]** — pick your plan,
  and the choice is written back into your copy of the link.

More at [upshot.fyi/made](https://upshot.fyi/made/).

## The trick

The whole card lives in the URL, after the `#`.

```
https://upshot.fyi/v2/#a=...&h=...&m=GPT-5&d=2026-09-10&g=Split+it&i=bill:80:Bill&i=n:3:People&r=:bill/n:Each+pays
```

Browsers never send the part after `#` to a server. So:

- **Nothing is stored, because there is nothing to store.** No database, no
  account, no rows with your text in them. The site cannot see your card even in
  principle.
- **Your numbers never leave your device.** They are worked out in the browser
  and written back into your own copy of the link — an instrument that
  structurally cannot phone home.
- **One static file renders unlimited cards, for free.** There is no per-link
  cost, so there is no reason to ever charge for one.

The flip side, stated plainly: anyone holding the link can read the card, and so
can your chat history. Private from us is not private in general.

## Using it

Say this to any AI that can read a web page:

> read https://upshot.fyi and export this

That's the whole setup. Nothing to paste, no custom GPT, no saved prompt to go
stale. The AI fetches [`/llms.txt`](https://upshot.fyi/llms.txt), learns the
format, and writes the URL.

The verb matters, oddly. "Export this **to** upshot.fyi" reads to a model as a
request to submit your content to a website, which it will often refuse. Asking
it to **read** the domain works. So does including the scheme — `read
https://upshot.fyi` beats `read upshot.fyi`, which a model has to recognise as
a URL before it can fetch one, and sometimes searches for instead.

## The format

A fixed frame with blocks stacked in the middle. The frame is always the same
shape, whatever the card is about: a scope line, a headline, a one-sentence
verdict, the blocks, and a signature saying which model wrote it and when.

`g=` starts a block and labels it. Nothing else starts one, so a block holds
whatever mix of lines it needs:

| key | what it is |
|---|---|
| `p` | a bullet |
| `o` | a numbered step, where order is the point |
| `c` | a checklist item you can tick off |
| `s` | one option of a pick-one; the lines sharing a name are the group |
| `f` | a `Label:Value` row |
| `i` | a box you type a number into |
| `r` | a `name:Formula:Label` result, worked out and shown with its working |
| `t` | one outcome of a decision, `Label:Condition:Wording` |
| `u` | the unit a name prints in, `name:unit` |

Machine fields come first and wording comes last. `f=` has two text fields,
and `t=` groups by a leading label; encode colons inside those leading labels.

Where the options rule each other out — a tax band, a tier, a plan — `s=` is
the one that says so. Each option carries its own number and the group's name
holds whichever is chosen, so a whole table of thresholds collapses into
`max(0,salary-thr)*0.09`. A checklist cannot do this: nothing stops a reader
ticking three plans.

The AI writes the formulas; you type the numbers. A `t=` handles a decision the
same way: one row per outcome, all sharing a label, and the first row whose
condition your numbers make true is the one that shows. Two rows is a
yes-or-no; three is under, about right, over. Anything it cannot work out
draws a dash rather than guessing.

Ticks and typed numbers are written back into the URL as you go, so the link in
your address bar is always a link to the state you're looking at. Bookmark it,
or send that.

Two or three blocks is usual. There is no hard cap — the real limit is 2000
characters of URL, and the verdict sits at the top of the frame, so a longer
card still reads at a glance.

The full spec, with worked examples, is at
[upshot.fyi/llms.txt](https://upshot.fyi/llms.txt). It is written for a model to
read, which makes it a decent short read for a human too.

## Your links keep working

The path is the version. `/v2/` will render every link ever written against it,
permanently. A format change that would alter how an existing card renders gets a
new path — `/v3/` — rather than an edit. `/v1/` is frozen and still works.

That is the entire cost of the promise: an old static file nobody touches again.

## The link has to survive intact

Because the card *is* the link, anything that damages the link destroys the
card — and the damage is usually invisible, since a truncated URL still renders
a perfectly convincing card with half the content missing.

Use a conservative alphabet across chat clients: in wording keep ASCII letters,
digits and a hyphen; in formulas also `+ / = _`; percent-encode everything else.
Spaces in wording become `+`. The rule avoids depending on each client's
link detection and formatting behavior.

The 15 Sep phone checks found that mid-URL full stops and tildes survived
WhatsApp intact, correcting earlier claims that they always broke links.
The encoding rule stays; the simulated channel is a consistency check, not
proof of how every real client behaves. See `LANGUAGE.md` for the measurements.

`test/transport.js` models this channel: it round-trips every character through
every field, simulates a markdown-rendering chat client, and checks the shipped
examples still survive both.

## Running it

```
python3 -m http.server 8787
```

Then open `http://localhost:8787/`. There is no build step and no dependencies —
it is static HTML all the way down.

## Tests

```
node test/run.js        # the renderer. Drives whatever Chrome is installed
node test/transport.js  # the URL itself. No Chrome, no model, no network
```

Both are dependency-free. `run.js` asks whether the card draws what the URL says.
`transport.js` asks the question underneath: whether the URL can survive being
sent at all — 900+ character-by-field round trips, the shipped examples through a
simulated chat client, and 4000 generated formulas checked against plain
JavaScript arithmetic.

It also scores a batch of real generations:

```
node test/transport.js links.txt   # one URL per line
```

which reports valid-first-render plus a tally of what went wrong. Links are
scored as text, exactly as they left the model — opening one in a browser proves
nothing, because the address bar never truncates and never renders markdown.

For prompt changes, keep pasting the whole `llms.txt` into fresh chats and
collecting the returned links. [The prompt test guide](test/PROMPT_TESTS.md)
has a short set of asks with expected answers and input changes to try.
The original fifteen asks remain in `test/asks.txt` for comparison across runs.

After editing the prompt, sync its static homepage copy:

```
node scripts/sync-prompt.js
```

The transport suite checks the full prompt matches, including inline examples.

## Writing another renderer

The format is documented for reimplementation, not just for use. `/llms.txt` is
the whole specification, `test/transport.js` contains the encoder as executable
code, and the tests are the closest thing to a conformance suite. If you write a
renderer, links written for `/v2/` should render identically on it.

## Files

| | |
|---|---|
| `index.html` | landing page and spec. Static, plus a head redirect for unversioned `#links` |
| `v2/index.html` | the card: parser, renderer, and nothing else |
| `v1/index.html` | the previous format, frozen |
| `broken/index.html` | the page a link with nothing renderable in it gets |
| `llms.txt` | the format, for AIs that look there |
| `made/` | a hand-curated gallery of cards people have made |
| `test/` | the two suites |
| `VISION.md` | product direction, decisions, what was refused, and why |

## Licence

MIT — see [LICENSE](LICENSE).

Cards themselves are not covered by it: a card lives entirely in its own URL and
never touches this repository. Anyone can put any text in a link, so text on the
domain is not published or endorsed by us, and never reaches us to moderate or
remove.

[dinner]: https://upshot.fyi/v2/#a=Splitting+dinner+three+ways&h=Split+the+bill&v=Divides+the+total+equally+between+the+people+sharing+it%2E&m=GPT-6&d=2026-09-16&g=Split+it&i=bill:80:Bill&i=n:3:People&r=each:bill/n:Each+pays&u=bill:%C2%A3&u=each:%C2%A3
[runway]: https://upshot.fyi/v2/#a=Whether+my+savings+meet+my+runway+target&h=Compare+your+runway+with+your+target&v=This+checks+your+savings+against+the+number+of+months+you+want+covered%2E&m=GPT-6&d=2026-09-16&g=Runway&i=cash:18000:Cash+saved&i=burn:2200:Monthly+spending&i=target:9:Months+you+want&r=months:cash/burn:Runway&t=Target:months%3E=target:Target+met&t=Target::Below+target&u=cash:%C2%A3&u=burn:%C2%A3&u=target:months&u=months:months
[payslip]: https://upshot.fyi/v2/#a=UK+take-home+pay+calculator+with+student+loan&h=Calculate+your+2026%2F27+take-home+pay&v=Enter+your+salary%2C+pick+your+student+loan+plan%2C+and+tick+Postgraduate+if+you+have+one%2E&m=Claude+Opus+5&d=2026-09-14&g=Pay&i=salary:40000:Annual+salary&r=allowance:max%280%2C12570-max%280%2Csalary-100000%29/2%29:Personal+allowance&r=taxable:max%280%2Csalary-allowance%29:Taxable+income&r=tax:min%28taxable%2C37700%29%2A0%2E2+max%280%2Cmin%28taxable-37700%2C87440%29%29%2A0%2E4+max%280%2Ctaxable-125140%29%2A0%2E45:Income+tax&r=ni:min%28max%280%2Csalary-12570%29%2C37700%29%2A0%2E08+max%280%2Csalary-50270%29%2A0%2E02:National+Insurance&g=Student+loan&s=thr:29385:Plan+2&s=thr:26900:Plan+1&s=thr:33795:Plan+4&s=thr:25000:Plan+5&c=pg:I+also+have+a+Postgraduate+Loan&r=loan:max%280%2Csalary-thr%29%2A0%2E09+pg%2Amax%280%2Csalary-21000%29%2A0%2E06:Student+loan&g=Take+home&r=net:salary-tax-ni-loan:Annual+take-home&r=:net/12:Monthly+take-home
