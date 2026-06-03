# ♠ Card Counter Pro

A browser-based card counting practice app built in vanilla HTML, CSS, and JavaScript — no frameworks, no build step, no dependencies.

## Modes

| Mode | Status | Description |
|---|---|---|
| **Flashcard Drill** | ✅ Live | One card at a time — enter running count, get instant feedback |
| **Speed Round** | ✅ Live | Timed drill — maximize accuracy under pressure |
| **Multi-Card** | ✅ Live | 3–5 cards revealed at once — count groups at a glance |
| **Blackjack Practice** | ✅ Live | Full game — count tracked and graded in the background |
| **Learn** | ✅ Live | Hi-Lo reference: card values, true count, betting ramp |

## Getting started

### Play instantly (no install)

1. Go to the [GitHub repository](https://github.com/sam-carton6/Card-Counting-Game)
2. Click **Code → Download ZIP**
3. Unzip the folder
4. Open **`index.html`** in any modern browser (Chrome, Firefox, Edge, Safari)

That's it — no internet connection required after download.

### Clone with git

```bash
git clone https://github.com/sam-carton6/Card-Counting-Game.git
cd Card-Counting-Game
# open index.html in your browser
```

### Optional: run a local server

Opening `index.html` directly works fine. If you prefer a proper server (useful when adding custom card image assets):

```bash
python -m http.server 3400
# then visit http://localhost:3400
```

## Casino Settings

| Setting | Options |
|---|---|
| Number of decks | 1, 2, 4, 6, 8 |
| Penetration | 25% – 95% (how deep before reshuffling) |
| Speed Round timer | 30 s · 60 s · 90 s · 2 min |
| Multi-Card group size | 3 · 4 · 5 cards |
| Counting system | Hi-Lo |

Settings and all session stats are saved automatically in your browser's `localStorage`.

## Custom card artwork

Drop your own PNG card images into the `assets/cards/` folder and they will replace the CSS-drawn cards automatically — no code changes needed. See [`assets/cards/NAMING.md`](assets/cards/NAMING.md) for the file naming convention. The CSS cards remain the fallback if any image is missing.

## File structure

```
index.html          — app shell: all mode sections, settings panel, modal
style.css           — casino theme, dark/light mode, card styles, layout
app.js              — deck engine, Hi-Lo logic, all game modes, stats
assets/
  cards/            — optional hand-drawn card PNGs (see NAMING.md)
```

## Hi-Lo quick reference

| Cards | Value | What it means |
|---|---|---|
| 2 · 3 · 4 · 5 · 6 | **+1** | Low cards gone — shoe getting richer |
| 7 · 8 · 9 | **0** | Neutral — no change |
| 10 · J · Q · K · A | **−1** | High cards gone — shoe getting weaker |

A positive running count means high cards dominate the remaining shoe — this is when you bet more.
