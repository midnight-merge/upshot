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

An export is a fixed-height card sized to the phone screen. The scope line at
the top and the signature at the bottom stay pinned; the headline, verdict and
points scroll if they overflow, with a fade and a chevron to show there's more.
The homepage is an ordinary scrolling page, not a card.

**Share as image** renders the card to a PNG in the browser and hands it to the
native share sheet, for Instagram and X where a link is no use. It falls back to
a download on desktop. This is the only dependency: html2canvas, pinned, from
cdnjs.

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

## Running it

```
python3 -m http.server 8787
```

Open `http://localhost:8787/` for the homepage. Add a fragment to see an export.

## Status

Works end to end. Deployed on GitHub Pages.

The unproven part is reliability: whether a chat AI, given only the spec it
fetched, gets the punctuation encoding right consistently. It has worked, but it
has not been run enough times to know the failure rate. If it turns out to be
poor, the fallback is base64 plus a paste box on the site, which works with any
AI but costs one extra step. See `VISION.md`.
