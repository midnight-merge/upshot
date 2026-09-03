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

`localhost` is only accessible on your machine. To share the tool, deploy it:

1. Push this repo to GitHub
2. Go to **Settings → Pages** → set source to `main`
3. Share `https://yourusername.github.io/export-ai-chat` with colleagues

GitHub Pages is free, requires no server, and updates automatically on every `git push`.

---

## Supported AI tools

| Tool | Status |
|---|---|
| ChatGPT (`chat.openai.com`) | Supported |
| Claude (`claude.ai`) | Supported |
| Gemini (`gemini.google.com`) | Supported |
| Other pages | Generic fallback |
