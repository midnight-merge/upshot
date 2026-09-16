# Testing the prompt with models

Keep your current workflow: paste the whole **`llms.txt`** into a fresh chat,
then send an ask. Use a fresh chat for each ask so earlier examples cannot
rescue a weak prompt. You can paste each ask below as written.

## Collect and check the links

1. Save the model's first URL from each ask, one per line, in a file such as
   `test/my-links.txt`. Keep broken links exactly as returned. Note the model,
   date and ask numbers in `#` comment lines. Save a copy of the prompt with
   the run if you plan to compare revisions.
2. From the project directory, run:

   ```sh
   node test/transport.js test/my-links.txt
   ```

   This uses the renderer in your checkout. It checks the URL, frame, syntax,
   refusals, unused inputs and uncomputable visible results. It cannot judge
   the premise, the correct answer, or whether a headline contradicts it.
3. Open each card and try the changes below. Check the **whole card** after
   each change, including its headline, summary and units. Copy the changed
   link and reopen it; it should show the same state.
4. Record structural pass and behavior pass separately. If a model returns
   no URL, record that too; the scorer only counts URL lines. Keep retries
   separate from first attempts.

For numeric tools, also try zero and cross any target or limit. A decision can
change correctly while a nearby result becomes nonsense. Domain accuracy is
the authoring model's responsibility; this test judges whether the resulting
tool behaves coherently with the formula it was given.

Before deployment, test the UI against this checkout:

```sh
python3 -m http.server 8787
```

In a copy of the model's link, replace `https://upshot.fyi/v2/` with
`http://localhost:8787/v2/`. Leave everything from `#` onward untouched.
Keep the original URL in the file you score. Pasting the prompt does not
require deploying it or asking a model to fetch the site.

## Six quick asks

Paste only the text inside a code block. The checks underneath are for you.
Wording and layout can differ; judge the behavior and numbers.

### 1. A calculated answer stays live

```text
Four of us shared a taxi and it was 38 quid, work out what we each owe. Export this.
```

- Initially **£9.50 each**, computed from editable fare and people.
- Change people to **2**: **£19 each**. Change fare to **50**: **£25 each**.
- The headline and summary still make sense. The answer has a pound sign.
- The small original-ask line can still say £38 and four people. The main
  headline and summary must not depend on those values: "split equally"
  survives edits; "split equally between all four people" does not.
- A fixed `f` row saying £9.50 is a failure even if the URL passes.

### 2. A calculator before the numbers are known

```text
Make me a calculator for painting a room. I'll enter the wall area in square metres, coverage in square metres per litre, and paint price per litre in pounds later. Ignore tins and extra coats. Export this.
```

- It opens with sensible, usable starting numbers.
- Enter area **48**, coverage **12**, price **18**: **4 litres**, **£72**.
  Showing just the final cost is also fine.
- Change area to **60**: **5 litres**, **£90**.
- It should not need another question: all information needed to choose the
  calculation is already present.

### 3. Tasks with an explicit completion rule

```text
Before publishing my newsletter I need to proofread it, check every link and approve the subject line. All three are required. Make me a checklist that tells me when those requirements are complete. Export this.
```

- Three working checkboxes. Initially incomplete; two ticks still incomplete.
- All three ticks: complete. Untick one: incomplete again.
- If a percentage is shown, it reaches **100%** only when all three are ticked.

### 4. Pick-one and named checkboxes together

```text
The hotel quotes £60 per night for Standard or £90 for Deluxe. Breakfast is optional and adds £10 per night. I'm staying two nights in Standard without breakfast. Make a cost calculator. Export this.
```

- Initially **£120**. Standard is selected and breakfast is off.
- Choose Deluxe: **£180**. Add breakfast: **£200**.
- Change to three nights: **£300**. Turn breakfast off: **£270**.
- Exactly one room type can be selected. One calculation follows the choice.

### 5. A decision against the user's target

```text
I'm saving for a £1200 bike. I have £300 and can put aside £240 a month. Make me a tool to check whether I can reach that price in four months, with the amounts and months editable. Export this.
```

- At four months: **£1260 available**, so the target is met.
- Change to two months: **£780 available**, so the target is not met.
  Equivalent results such as £60 spare and £420 short are fine.
- The conclusion changes in a decision row. The fixed headline and summary
  do not keep promising that four months is enough.

### 6. A duration with units

```text
How long does the drive take if it is 290 miles at about 62 mph with two twenty minute stops? Make the distance, speed and stops editable. Export this.
```

- Total **about 5 hours 21 minutes**. `5:21` with a clear duration label is fine.
- Remove the stops: **about 4 hours 41 minutes**.
- The result should read as time, not an unexplained `5.34`.

## One judgment check

```text
Help me decide if I should quit my job. I haven't decided how much savings would make me comfortable. Export this.
```

An honest summary, a useful checklist without a fabricated score, or a short
question about the missing criterion can all be appropriate. A confident
"quit now" based on an invented savings threshold is a failure. A clarification
is expected behavior here, not a malformed URL to feed into the scorer.

## Comparing runs

Use the same six asks across models or prompt revisions. For a broader pass,
use the unchanged fifteen asks in `test/asks.txt`; the original batch is in
`test/corpus-2026-09-15.txt`. Watch ask 14 for a live calculation instead of a
worked-out answer stored in `f`.

A simple record is enough:

| Model / prompt revision | Ask | URL passes | Initial answer right | Changes work | Frame stays true | Notes |
|---|---|---|---|---|---|---|
| | | | | | | |

## Checks after editing the prompt

```sh
node scripts/sync-prompt.js
node test/transport.js
node test/run.js
```

The first updates the static homepage prompt. The second checks transport,
prompt consistency and example calculations after changing inputs. The third
checks rendering and browser interaction using an installed Chrome. These
protect the implementation; fresh model generations measure the prompt.
