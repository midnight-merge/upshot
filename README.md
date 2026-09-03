# Export AI Chat

Export any AI conversation to a permanent, shareable link — no account, no backend.

## What it does

You have a conversation on ChatGPT, Claude, or Gemini. You click a bookmark in your browser. The tool reads the conversation from the page, sends it to OpenAI to summarise, then opens a new tab with a summary, topic timeline, key takeaways, and the full transcript. That tab's URL contains all the data — copy it and share it with anyone. The link never expires because there is no server; everything is encoded directly into the URL itself.

## Architecture

```
index.html          Landing page — users enter their OpenAI API key and
                    generate a personalised bookmarklet

bookmarklet.src.js  The bookmarklet source. When clicked on an AI tool page it:
                      1. Reads the conversation from the DOM
                      2. Calls gpt-4o-mini to produce a structured summary
                      3. Encodes the result into a URL fragment
                      4. Opens view.html with the data in the URL hash

view.html           The viewer page. Reads the URL hash, decodes it, and
                    renders the summary — no server request needed
```

Data flow: conversation text → OpenAI API → JSON summary → base64 encoded → `view.html#data=...`

The `#data=` fragment never leaves the browser. Anyone with the link can open it directly; there is nothing stored on a server.

---

## Testing the tool locally

### Prerequisites

- A modern browser (Chrome or Firefox recommended)
- An OpenAI API key — get one at platform.openai.com

### Steps

1. **Open the landing page.** In your file explorer, navigate to the project folder and open `index.html` in your browser. You can also drag the file directly into a browser tab.

2. **Enter your OpenAI API key.** Paste your key (starting with `sk-`) into the field and click **Generate bookmarklet**. A draggable button labelled "Export Chat" will appear.

3. **Show your bookmarks bar.** If it is not visible, press `Ctrl+Shift+B` on Windows or `⌘+Shift+B` on Mac.

4. **Drag the bookmarklet to your bookmarks bar.** Click and hold the "Export Chat" button, drag it up to the bookmarks bar, and release. It will appear there as a bookmark.

5. **Go to an AI tool and have a conversation.** Open ChatGPT (`chat.openai.com`), Claude (`claude.ai`), or Gemini (`gemini.google.com`) and send a few messages to create a conversation worth exporting.

6. **Click the bookmarklet.** While on the AI tool page, click the "Export Chat" bookmark you added in step 4. A small loading indicator will appear in the corner of the page.

7. **Review the export.** A new tab opens with `view.html` showing:
   - The conversation title and source
   - A topic timeline with the last topic highlighted
   - A prose summary
   - Key takeaways
   - A collapsible full transcript

8. **Copy the link.** Click **Copy link** in the top-right corner of the viewer page. Paste it anywhere — the link is self-contained and works for anyone who opens it.

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
