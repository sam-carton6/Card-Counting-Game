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

---

## Getting started

### Play in a browser (desktop or mobile)

The app is hosted at:  
**[https://sam-carton6.github.io/Card-Counting-Game/](https://sam-carton6.github.io/Card-Counting-Game/)**

Open that link on any device — no install required.

### Download and run locally

1. Go to the [GitHub repository](https://github.com/sam-carton6/Card-Counting-Game)
2. Click **Code → Download ZIP**
3. Unzip the folder
4. Open **`index.html`** in any modern browser

No internet connection required after download.

### Clone with git

```bash
git clone https://github.com/sam-carton6/Card-Counting-Game.git
cd Card-Counting-Game
# open index.html in your browser
```

---

## Install on iPhone (works offline)

The app is a Progressive Web App — it can be installed on your iPhone home screen and works fully offline after the first visit.

1. Open **Safari** on your iPhone (must be Safari, not Chrome)
2. Go to **[https://sam-carton6.github.io/Card-Counting-Game/](https://sam-carton6.github.io/Card-Counting-Game/)**
3. Tap the **Share** button (the box with an arrow pointing up)
4. Scroll down and tap **Add to Home Screen**
5. Tap **Add**

The app will appear on your home screen and launch full-screen with no browser chrome, just like a native app. All game modes, stats, and settings work offline.

> **Android:** Open in Chrome → tap the three-dot menu → **Add to Home screen**

---

## Casino Settings

| Setting | Options |
|---|---|
| Number of decks | 1, 2, 4, 6, 8 |
| Penetration | 25% – 95% (how deep before reshuffling) |
| Speed Round timer | 30 s · 60 s · 90 s · 2 min |
| Multi-Card group size | 3 · 4 · 5 cards |
| Counting system | Hi-Lo |

Settings and all session stats are saved automatically in your browser's `localStorage`.

---

## Custom card artwork

Drop your own PNG card images into the `assets/cards/` folder and they will replace the CSS-drawn cards automatically — no code changes needed. See [`assets/cards/NAMING.md`](assets/cards/NAMING.md) for the file naming convention (`AS.png`, `10H.png`, `back.png`, etc.). CSS cards are the fallback if any image is missing.

To generate the app icon PNGs, open `assets/make-icons.html` in a browser and save the two canvases as `icon-192.png` and `icon-512.png` into the `assets/` folder.

---

## File structure

```
index.html          — app shell: all mode sections, settings panel, modal
style.css           — casino theme, dark/light mode, card styles, layout
app.js              — deck engine, Hi-Lo logic, all game modes, stats
manifest.json       — PWA manifest (installable app)
sw.js               — service worker (offline caching)
assets/
  cards/            — optional hand-drawn card PNGs (see NAMING.md)
  make-icons.html   — generates icon-192.png and icon-512.png
```

---

## Hi-Lo quick reference

| Cards | Value | What it means |
|---|---|---|
| 2 · 3 · 4 · 5 · 6 | **+1** | Low cards gone — shoe getting richer |
| 7 · 8 · 9 | **0** | Neutral — no change |
| 10 · J · Q · K · A | **−1** | High cards gone — shoe getting weaker |

A positive running count means high cards dominate the remaining shoe — this is when you bet more.
