# ♠ Card Counter Pro

A browser-based card counting practice app built in vanilla HTML, CSS, and JavaScript — no frameworks, no dependencies.

## Features

### Flashcard Drill *(live)*
- Cards dealt one at a time from a configurable shoe
- Enter your running count after each card; app confirms and auto-advances
- Session stats: correct answers, streak, accuracy, cards seen
- Session history saved to `localStorage`

### Coming soon
- **Speed Round** — timed flashcard drill
- **Multi-Card** — 3–5 cards revealed at once
- **Blackjack Practice** — full game with background count grading

### Learn section
- Complete Hi-Lo reference: card values, running count, true count formula, betting ramp table

### Casino Settings
| Setting | Options |
|---|---|
| Number of decks | 1, 2, 4, 6, 8 |
| Penetration | 25% – 95% |
| Counting system | Hi-Lo (2–6 = +1 · 7–9 = 0 · 10/J/Q/K/A = −1) |

- Dark / light mode toggle
- All settings and stats persist via `localStorage`

## Running locally

No build step required — it's static HTML.

**Option 1 — open the file directly:**
```
index.html   (double-click or drag into a browser)
```

**Option 2 — local server (avoids any file:// quirks):**
```bash
python -m http.server 3400
# then open http://localhost:3400
```

## File structure

```
index.html   — app shell, all mode sections, settings panel, modal
style.css    — casino theme, CSS variables for dark/light mode, card styles
app.js       — deck engine, Hi-Lo logic, Flashcard Drill, stats, Learn content
push.ps1     — one-command commit + push helper (see below)
```

## Quick commit & push

A PowerShell helper is included so you can ship updates with one command:

```powershell
.\push.ps1
```

It shows what changed, prompts for a commit message, stages everything, commits, and pushes. You can also pass the message directly:

```powershell
.\push.ps1 "add speed round mode"
```

## Counting system — Hi-Lo quick reference

| Cards | Value | Meaning |
|---|---|---|
| 2 · 3 · 4 · 5 · 6 | **+1** | Low cards removed — shoe getting better |
| 7 · 8 · 9 | **0** | Neutral |
| 10 · J · Q · K · A | **−1** | High cards removed — shoe getting worse |

A positive running count means the remaining shoe is rich in high cards — bet more.
