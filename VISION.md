# Vision notes

You took a vague idea and built it. This is the clearer version of the idea.

## The problem

I'm talking to an AI. It says something good. I want to send it to my friends.
Screenshots are ugly. Pasted text feels like nothing. What's missing is: "yo, export
this" → a link I can drop in WhatsApp.

Real case: I was telling friends about a murder trial, had just checked details with
ChatGPT, and wanted to send something short and clean instead of a wall of text.

## The good part: keep it

Put the data in the URL after the `#`, host one static page that reads it. No
server, no database, no cost per link, infinite links off one file. And the URL
length limit is a feature — it forces the export to stay short.

This is right. Don't change it.

## The bad part: the API key

Right now `view.html` asks the visitor for an OpenAI key and saves it in their
browser. It needs that key to summarise the text — but an AI already summarised it,
in the chat the user just came from. We're paying for the same work twice.

And it means "anyone can use this" really means "anyone with an OpenAI account, a
card on file, and enough trust to paste a key into a stranger's site". That's almost
nobody.

Write the summary in the chat. `view.html` just decodes and displays.

## How the link gets made

The real question is who builds the URL.

**Option A — the AI types it.** Then the URL has to be plain readable text, not
base64. One step, no tools, no pasting. Catch: the AI has to escape things right and
use no spaces (WhatsApp stops the link at the first space), and our page has to
decode loosely so small mistakes still work.

**Option B — something else builds it.** Either a paste box on the site (AI writes
text, user pastes, site gives back the link), or the AI runs a script if it has tools
(Claude Code, ChatGPT's code tool). Slightly more work for the user, but it never
breaks, and the URL can be base64 since nobody types it.

Either way, a saved prompt helps — a custom GPT or pinned snippet that teaches the
format once, so "export this" just works after that.

A server-side shortener would fix everything and kill the free static thing. No.

**Test this first:** can a normal chat, with no tools, actually spit out a clean
1-2k character URL with no spaces? If yes, Option A is the product. If no, Option B
is the floor and no design work changes that.

## Format and size

No base64 doesn't mean no structure. A readable URL still has fields, like
`#m=<model>&d=<date>&a=<the+ask>&b=<body>`. Just separated instead of encoded. The
metadata works either way.

Size is what changes. Base64 + compression turns a 2000 character export into about
800 characters of URL. Readable text doesn't compress, so the same thing is about
2400. Both are fine to send. Option A is just tighter.

Full chat transcripts are out either way. 20k characters, the link looks insane in a
chat, and it kills the "short and clean" thing that made the idea good.

## The URL carries structure, not just text

If we only put prose in the URL, the page gets a blob and doesn't know what's a
headline, what's a bullet, what's the verdict. So the URL has to be a filled-in
form.

```
#s=explainer
&m=GPT-5
&d=2026-09-06
&a=Whether+seed+oils+are+actually+bad+for+you
&h=Seed+oils+are+not+the+villain+the+internet+says
&v=The+claim+rests+on+lab+studies+humans+trials+havent+reproduced
&p=Swapping+saturated+fat+for+seed+oil+lowers+LDL
&p=The+inflammation+link+comes+from+animal+work
&p=Reheated+frying+oil+is+a+separate+issue
```

`s` picks the shape, so the page knows which skeleton to draw. `m`, `d`, `a` are
the container and are always there. The rest are slots that shape expects — repeat
`p` for each bullet. A list shape or a steps shape would have different slots.

This is the real cost of the no-base64 path. The AI isn't just writing text, it's
filling in a form, and there's more for it to get wrong. So the test question is
sharper than it first looked: not "can a chat emit a clean URL", but "can a chat
emit a clean URL with the right fields in the right slots."

Page should decode loosely — missing slot, just don't draw it. Unknown shape, fall
back to the plainest one.

## WhatsApp findings (tested 6 Sep 2026)

Tested by sending real links to WhatsApp and seeing what stays blue.

Fine: length up to at least 800 characters, `&` separators, `%22`, hyphens,
`localhost` with a port, capitals, digits.

Breaks it: **a raw comma or full stop inside a value.** WhatsApp stops linkifying
at that point and the rest of the URL arrives as plain text. It doesn't cut at the
punctuation itself, it cuts earlier, so it looks random until you bisect it.

Fix: encode `,` as %2C and `.` as %2E. Confirmed working on the full 806 character
Clancy link.

**What this means for the format.** Every sentence has a full stop. So the AI now
has to encode punctuation on every single sentence it writes, in a URL it can't
see rendered, with silent failure if it slips once. That's a big reliability ask
for a plain chat model, and it's real evidence for base64 plus a paste box or a
tool, rather than the AI typing the URL by hand.

Test this before committing to the readable path. If ChatGPT gets punctuation
encoding right nine times in ten, the readable path lives. If it's six in ten, it
doesn't.

## Container and shapes

**Metadata is the container.** It's on every page, always. Model, date, and one line
saying what was asked. It's the frame, and the frame is what makes the content mean
something.

One honest note: most chats are many messages, so there's no single prompt to quote.
That one line is the AI describing its own brief. Weaker than a real quote, but fine
as long as we call it a summary of the ask, not a quote.

Also, the export is scoped to whatever you point at, not the whole conversation. You
might talk to ChatGPT about five things and only want one of them exported — "export
this, mainly the bit about x". So the one-liner describes the ask behind that bit. If
you don't say what to focus on, the AI uses whatever you were last on.

**Shapes go inside the container.** This isn't just for debates — recipes, trip
plans, gym plans, explainers, book recs, code. So the body can't be shaped like a
debate. Small set of layouts the AI picks from: explainer, list, steps, comparison.
Same look, different skeleton.

## The site teaches the AI

The user shouldn't have to paste a wall of instructions. Host the spec as a plain
text file and let the AI fetch it. Then the whole flow is one sentence:

> "export this to upshot.fyi"

The AI reads `/llms.txt`, gets the format, writes the URL. No setup, no custom GPT,
no pinned prompt. Still just a static file — the "server" is a text file.

Two nice side effects. We can change the format whenever we like and every AI picks
it up straight away, so nobody's saved prompt goes stale. And we can version it, so
old links keep working.

Catch: it needs browsing on, and some models will guess the format instead of
fetching. So keep the spec short, and make the page say "this link looks
incomplete" instead of rendering blank.

**Every export carries the instruction.** The footer of a rendered page tells you
how to make your own. Someone gets a link off a mate, sees the line, does their
own. The thing being shared is the thing that spreads it.

## Hosting

Real domain, self-hosted.

**Short domain = more room.** Every character in the base URL is one less for the
content. Keep the path short too.

**The domain is part of the feel.** It's the first thing people see in WhatsApp,
before the page even loads. Same job as the fonts and spacing.

**Every link gets the same WhatsApp preview.** Anything after `#` never reaches the
server, so we can't make a custom preview card per link. Doing that would mean
moving the data into a `?query`, which means running a real server instead of a
static file, and then everyone's content goes through our logs. Not worth it.
Decided: keep the `#`, design one good generic preview card.

## Why this works at all

The presentation is the product. A screenshot is ugly and easy to fake. Pasted text
has no weight. A proper page reads like something someone made — it gives the content
a feel. That's the whole moat: the fonts, the spacing, how the link looks in a chat.

One thing to keep in mind while designing: the same page makes a good answer and a
made-up answer look exactly the same, and looking authoritative is the point. A small
"AI summary" badge won't fix that, people read the layout not the footer. Model, date
and the one-line ask are cheap and do the job. Ship those and stop there.

## Next

Build the encoder and a stripped-down `view.html` that renders one shape properly.
Look at it, tweak the feel, then add the other shapes.
