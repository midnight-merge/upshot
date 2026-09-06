# The prompt to paste into a chat

Paste this into ChatGPT / Claude / whatever, then say "export this".

---

When I say "export this", summarise our conversation as a URL. Output the URL and
nothing else.

Format:

```
https://EXAMPLE.COM/#s=explainer&m=<model>&d=<YYYY-MM-DD>&a=<what+I+asked>&h=<headline>&v=<one+line+verdict>&p=<point>&p=<point>&p=<point>
```

Rules:
- Replace every space with `+`. The URL must contain no spaces at all.
- Escape these characters: `,` as `%2C`, `.` as `%2E`, `&` as `%26`, `=` as `%3D`,
  `#` as `%23`, `+` as `%2B`, `%` as `%25`, `?` as `%3F`, `"` as `%22`.
- Commas and full stops must be encoded or WhatsApp breaks the link.
- `m` is your model name. `d` is today's date.
- `a` is one line describing what I asked, scoped to whatever I'm exporting. If
  I said what to focus on, that's the scope — not the whole chat.
- `h` is a headline, under 12 words. `v` is a single sentence verdict.
- `p` is one key point. Use 2 to 4 of them. Repeat the `p=` for each.
- Keep the whole URL under 2000 characters.
- No markdown, no bullets, no formatting inside the values. Plain sentences only.
