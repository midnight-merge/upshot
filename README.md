# Export AI Chat

Export any AI conversation to a permanent, shareable link — no account, no backend.

## What it does

You have a conversation on ChatGPT, Claude, or Gemini. You click a bookmark in your browser. The tool reads the conversation from the page, sends it to OpenAI to summarise, then opens a new tab with a summary, topic timeline, key takeaways, and the full transcript. That tab's URL contains all the data — copy it and share it with anyone. The link never expires because there is no server; everything is encoded directly into the URL itself.

## Architecture

```
index.html          Landing page — explains the tool and provides the
                    draggable bookmarklet (no API key needed here)

bookmarklet.src.js  The bookmarklet source. When clicked on an AI tool page it:
                      1. Reads the conversation from the DOM
                      2. Encodes the raw messages into a URL fragment
                      3. Opens view.html#raw=... — no API call made here

view.html           The viewer page. On first use it asks for an OpenAI API
                    key (saved in localStorage). It then calls gpt-4o-mini
                    to summarise the conversation and renders the result.
                    The URL is upgraded from #raw= to #data= after summarising,
                    so anyone you share the link with sees the summary directly
                    without needing their own API key.
```

Data flow: DOM extraction → base64 encoded raw messages → `view.html#raw=...` → OpenAI API → summary rendered → URL updated to `view.html#data=...`

The `#data=` fragment never leaves the browser. Anyone with the link can open it directly; there is nothing stored on a server.

The API call happens on `view.html` (your hosted page), not on the AI tool's page. This avoids being blocked by the Content Security Policy that ChatGPT, Claude, and Gemini enforce on their own pages.

---

## Testing the tool locally

### Prerequisites

- A modern browser (Chrome or Firefox recommended)
- An OpenAI API key — get one at platform.openai.com

### Steps

1. **Open the landing page.** Navigate to the project folder and open `index.html` in your browser (drag the file into a browser tab, or open it with File → Open).

2. **Show your bookmarks bar** if it is not visible. Press `Ctrl+Shift+B` on Windows or `⌘+Shift+B` on Mac.

3. **Drag the bookmarklet to your bookmarks bar.** Click and hold the "Export Chat" button on the landing page, drag it up to the bookmarks bar, and release.

4. **Go to an AI tool and have a conversation.** Open ChatGPT (`chat.openai.com`), Claude (`claude.ai`), or Gemini (`gemini.google.com`) and send a few messages.

5. **Click the bookmarklet.** Click the "Export Chat" bookmark in your bookmarks bar. A new tab opens showing a loading screen.

6. **Enter your OpenAI API key (first time only).** If this is your first export, you will be prompted for your API key (`sk-...`). Enter it and click **Generate summary** — it is saved in your browser's localStorage so you will not be asked again.

7. **Review the export.** The viewer renders:
   - The conversation title and source
   - A topic timeline with the last topic highlighted
   - A prose summary
   - Key takeaways
   - A collapsible full transcript

8. **Copy the link.** Click **Copy link** in the top-right corner. The link is self-contained and works for anyone — they do not need an API key to view it.

---

## Deploying for other users

1. Push this repository to GitHub.
2. Go to **Settings → Pages** in the repo and set the source to the `main` branch.
3. Your site will be live at `https://yourusername.github.io/export-ai-chat`.
4. Optionally, add a custom domain under the same Pages settings.

Once deployed, users visit your URL instead of opening `index.html` locally. Everything else works the same way.

---

## Supported AI tools

| Tool | Status |
|---|---|
| ChatGPT (`chat.openai.com`) | Supported |
| Claude (`claude.ai`) | Supported |
| Gemini (`gemini.google.com`) | Supported |
| Other pages | Falls back to generic text extraction |

## Notes

- Your OpenAI API key is baked into the bookmarklet at generation time. It is only ever sent to `api.openai.com` — never to any other server.
- Very long conversations are trimmed to the most recent ~12,000 words before being sent to the API. The summary covers the full conversation; only the transcript in the viewer may be incomplete.
- The URL can become long for lengthy conversations. If a link gets truncated when pasting into a messaging app, use the browser's **Print → Save as PDF** option on the viewer page instead.
