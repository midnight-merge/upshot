# Export AI Chat

Export any AI conversation to a permanent, shareable link — no account, no backend required.

---

## How it works

```
┌──────────────┐     ┌─────────────────────┐     ┌──────────────────────┐
│  AI tool     │     │  Bookmarklet        │     │  view.html           │
│  (ChatGPT,   │     │  (runs on the       │     │  (hosted on GitHub   │
│  Claude,     │     │   AI tool page)     │     │   Pages)             │
│  Gemini)     │     │                     │     │                      │
│              │     │ 1. Reads messages   │     │ 3. Asks for OpenAI   │
│  User has    │────▶│    from the page    │────▶│    key (first time)  │
│  conversation│     │ 2. Encodes them     │     │ 4. Calls OpenAI API  │
│              │     │    into a URL       │     │ 5. Renders summary   │
│              │     │    (#raw=...)       │     │ 6. Updates URL to    │
│              │     │    and opens        │     │    #data=... so the  │
│              │     │    view.html        │     │    link is shareable │
└──────────────┘     └─────────────────────┘     └──────────────────────┘
```

The bookmarklet never calls any API — it only reads the page. The API call happens on `view.html` (your page), so it is never blocked by the AI tool's security policy. The final `#data=` URL is self-contained: anyone can open it without an API key.

---

## Architecture

| File | Purpose |
|---|---|
| `index.html` | Landing page — provides the draggable bookmarklet |
| `view.html` | Viewer — summarises the conversation and renders the result |
| `bookmarklet.src.js` | Readable source for the bookmarklet embedded in `index.html` |

---

## Setup

### Prerequisites
- A modern browser (Chrome or Firefox)
- An OpenAI API key — [get one here](https://platform.openai.com/api-keys)
- Node.js (for local testing)

### Local testing

```bash
cd /path/to/export-ai-chat
npx serve .
```

Open `http://localhost:3000`, drag the **Export Chat** button to your bookmarks bar, then go to ChatGPT and click it.

> You cannot open `index.html` as a plain file — browsers block bookmarklets from opening `file://` URLs when running on `https://` pages like ChatGPT.

### Sharing with colleagues — GitHub Pages

`localhost` is only accessible on your own machine. To share the tool with others it needs to be publicly hosted over `https://`. GitHub Pages does this for free — it serves the static HTML files in this repo at a public URL with no server, no database, and no running costs. Every `git push` updates the live site automatically.

**Deploy steps:**

1. Push this repo to GitHub
2. Go to **Settings → Pages** → set source to `main`
3. Wait ~60 seconds — your site is live at `https://yourusername.github.io/export-ai-chat`
4. Share that URL with colleagues

**Full workflow once deployed:**

```
  Colleague visits
  https://yourusername.github.io/export-ai-chat
          │
          ▼
  Drags "Export Chat" bookmark to their bookmarks bar  (one-time setup)
          │
          ▼
  Goes to ChatGPT / Claude / Gemini and has a conversation
          │
          ▼
  Clicks the "Export Chat" bookmark
          │
          ▼
  Bookmarklet reads the conversation from the page
  and opens view.html#raw=... in a new tab
          │
          ▼
  view.html loads — first time: asks for OpenAI API key (saved in browser)
          │
          ▼
  Calls OpenAI API → generates title, topics, summary, takeaways
          │
          ▼
  Summary is rendered — URL updates to view.html#data=...
          │
          ▼
  Colleague copies the link and shares it with anyone
          │
          ▼
  Recipient opens the link → sees the summary instantly
  (no API key needed, no server involved)
```

---

## Supported AI tools

| Tool | Status |
|---|---|
| ChatGPT (`chat.openai.com`) | Supported |
| Claude (`claude.ai`) | Supported |
| Gemini (`gemini.google.com`) | Supported |
| Other pages | Generic fallback |
