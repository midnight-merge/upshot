# upshot

Turn a chat conversation into a link you can send.

You're talking to an AI, it says something worth sharing, you say **"read
upshot.fyi/llms.txt and export this"**. It replies with a link. You send the
link.

No account, no API key, nothing to install.

## How it works

The whole export lives in the URL, after the `#`. Everything after `#` stays in
the browser and is never sent to the server, so this site never sees your content
and there is nothing to store.

That means one static page can render unlimited exports for free. It also means
the URL length caps how long an export can be, which keeps them short.

```
https://upshot.fyi/#s=explainer&m=GPT-5&d=2026-09-06&a=...&h=...&v=...&p=...
```

`index.html` reads those fields and draws the page. That's the entire system.

## The site teaches the AI

`index.html` with no fragment is a landing page that spells out the format in
plain text, and `/llms.txt` says the same thing. So when you point an AI at the
domain, it fetches it and learns the format on the spot. Nothing to paste, and no
saved prompt to go stale.

Phrasing matters. "Export this to upshot.fyi" reads to a model as a request to
submit content to a site, which it will refuse. Asking it to *read* the URL
works.

The spec is static HTML on purpose — fetchers don't run JavaScript.

## Gotcha: WhatsApp and punctuation

A raw comma or full stop inside a value stops WhatsApp turning the text into a
link, and the rest arrives as plain text. Encode them as `%2C` and `%2E`.

Length, `&`, `%22`, hyphens, digits and capitals are all fine — tested to 800
characters. See `VISION.md` for the full results.

## Files

| | |
|---|---|
| `index.html` | the whole thing: landing page, spec, and renderer |
| `llms.txt` | the format, for AIs that look there |
| `VISION.md` | product direction, decisions, and test findings |

## Running it

```
python3 -m http.server 8787
```

Then open `http://localhost:8787/`. Add a fragment to see an export.

## Status

Works end to end by hand. The untested part is whether a chat AI reliably gets
the encoding right on its own — see the open question in `VISION.md`.
