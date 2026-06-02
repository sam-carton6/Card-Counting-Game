'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   CARD COUNTER PRO — app.js
   ═══════════════════════════════════════════════════════════════════════════ */

// ── Constants ───────────────────────────────────────────────────────────────

const SUITS  = ['♠', '♥', '♦', '♣'];
const RANKS  = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const RED_SUITS = new Set(['♥', '♦']);

/** Hi-Lo point values */
const HI_LO = {
  'A':-1, '2':1, '3':1, '4':1, '5':1, '6':1,
  '7':0,  '8':0, '9':0,
  '10':-1,'J':-1,'Q':-1,'K':-1
};

// ── Settings ────────────────────────────────────────────────────────────────

const SETTINGS_KEY = 'cc_settings';

let settings = {
  numDecks:    1,
  penetration: 0.75,
};

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    settings = { ...settings, ...saved };
  } catch { /* ignore corrupt data */ }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// ── Deck Engine ─────────────────────────────────────────────────────────────

class Deck {
  /**
   * @param {number} numDecks    - how many 52-card decks to combine
   * @param {number} penetration - fraction of shoe dealt before reshuffling (0–1)
   */
  constructor(numDecks, penetration) {
    this.numDecks    = numDecks;
    this.penetration = penetration;
    this._build();
  }

  _build() {
    this.cards = [];
    for (let d = 0; d < this.numDecks; d++) {
      for (const suit of SUITS) {
        for (const rank of RANKS) {
          this.cards.push({
            suit,
            rank,
            red:   RED_SUITS.has(suit),
            value: HI_LO[rank],
          });
        }
      }
    }
    this._shuffle();
    this.pos       = 0;
    this.cutCard   = Math.floor(this.cards.length * this.penetration);
  }

  /** Fisher-Yates in-place shuffle */
  _shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  /**
   * Deal one card. Automatically rebuilds + reshuffles when the cut card is
   * reached, then deals the first card of the new shoe.
   * @returns {{ card: object, reshuffled: boolean }}
   */
  deal() {
    if (this.pos >= this.cutCard) {
      this._build();
      return { card: this.cards[this.pos++], reshuffled: true };
    }
    return { card: this.cards[this.pos++], reshuffled: false };
  }

  /** Cards remaining before the cut card */
  get remaining() { return Math.max(0, this.cutCard - this.pos); }

  /** Total cards in play (up to cut card) */
  get total() { return this.cutCard; }

  /** Fraction of shoe dealt (0–1) */
  get progress() { return this.pos / this.cutCard; }

  /** Approximate decks remaining past the cut card */
  get decksRemaining() { return this.remaining / 52; }
}

// ── Stats Manager ────────────────────────────────────────────────────────────

class StatsManager {
  constructor() {
    this._load();
  }

  _load() {
    try {
      const raw = localStorage.getItem('cc_stats');
      this.data = raw ? JSON.parse(raw) : this._empty();
    } catch {
      this.data = this._empty();
    }
  }

  _empty() {
    return {
      sessions: [],
      allTime: { correct: 0, total: 0, bestStreak: 0 },
    };
  }

  _save() {
    localStorage.setItem('cc_stats', JSON.stringify(this.data));
  }

  /**
   * @param {{ mode:string, correct:number, total:number, bestStreak:number }} session
   */
  recordSession(session) {
    if (session.total === 0) return;
    this.data.sessions.unshift({
      date: new Date().toISOString(),
      ...session,
    });
    if (this.data.sessions.length > 100) this.data.sessions.length = 100;

    this.data.allTime.correct   += session.correct;
    this.data.allTime.total     += session.total;
    if (session.bestStreak > this.data.allTime.bestStreak)
      this.data.allTime.bestStreak = session.bestStreak;

    this._save();
  }

  clear() {
    this.data = this._empty();
    this._save();
  }
}

// ── Card Rendering ───────────────────────────────────────────────────────────

/**
 * Populate a .playing-card element with face-up or face-down markup.
 * @param {object|null} card - card object from Deck, or null for face-down
 * @param {HTMLElement} el   - the .playing-card element
 * @param {boolean}     [animate=false]
 */
function renderCard(card, el, animate = false) {
  if (!card) {
    el.className = 'playing-card face-down';
    el.innerHTML = '<div class="card-back"></div>';
    return;
  }

  el.className = `playing-card ${card.red ? 'red' : 'black'}${animate ? ' dealing' : ''}`;
  el.innerHTML = `
    <div class="card-corner top-left">
      <div class="card-rank">${card.rank}</div>
      <div class="card-suit-small">${card.suit}</div>
    </div>
    <div class="card-center-suit">${card.suit}</div>
    <div class="card-corner bottom-right">
      <div class="card-rank">${card.rank}</div>
      <div class="card-suit-small">${card.suit}</div>
    </div>`;

  if (animate) {
    // Remove class after animation so it can replay next deal
    el.addEventListener('animationend', () => el.classList.remove('dealing'), { once: true });
  }
}

// ── Flashcard Drill ───────────────────────────────────────────────────────────

class FlashcardDrill {
  constructor() {
    // Game state
    this.deck         = null;
    this.runningCount = 0;
    this.correct      = 0;
    this.total        = 0;
    this.streak       = 0;
    this.bestStreak   = 0;
    this.currentCard  = null;
    this.locked       = false; // true while feedback is showing
    this.active       = false;

    this._cacheElements();
    this._bindEvents();
    this._updateStats();
    this._updateShoeBar();
    renderCard(null, this._el.card);
  }

  _cacheElements() {
    this._el = {
      card:     document.getElementById('fc-card'),
      input:    document.getElementById('fc-count-input'),
      feedback: document.getElementById('fc-feedback'),
      shoeInfo: document.getElementById('fc-shoe-info'),
      deckInfo: document.getElementById('fc-deck-info'),
      progress: document.getElementById('fc-shoe-progress'),
      correct:  document.getElementById('fc-correct'),
      streak:   document.getElementById('fc-streak'),
      accuracy: document.getElementById('fc-accuracy'),
      cards:    document.getElementById('fc-cards'),
      startBtn: document.getElementById('fc-start'),
      submit:   document.getElementById('fc-submit'),
    };
  }

  _bindEvents() {
    this._el.submit.addEventListener('click', () => this._submit());
    this._el.startBtn.addEventListener('click', () => this.start());
    document.getElementById('fc-reset').addEventListener('click', () => this._endSession());

    document.getElementById('fc-minus').addEventListener('click', () => {
      this._el.input.value = (parseInt(this._el.input.value) || 0) - 1;
      this._el.input.focus();
    });
    document.getElementById('fc-plus').addEventListener('click', () => {
      this._el.input.value = (parseInt(this._el.input.value) || 0) + 1;
      this._el.input.focus();
    });
    this._el.input.addEventListener('keydown', e => {
      if (e.key === 'Enter') this._submit();
    });
  }

  // ── Public API ──────────────────────────────────────────────────────────

  start() {
    this.deck         = new Deck(settings.numDecks, settings.penetration);
    this.runningCount = 0;
    this.correct      = 0;
    this.total        = 0;
    this.streak       = 0;
    this.bestStreak   = 0;
    this.active       = true;
    this.locked       = false;

    this._el.input.value = '0';
    this._clearFeedback();
    this._el.startBtn.textContent = 'New Shoe';
    this._updateStats();
    this._updateShoeBar();
    this._deal();
  }

  /** Called when settings change so the shoe info refreshes without a restart */
  refreshShoeBar() {
    this._updateShoeBar();
  }

  // ── Private ─────────────────────────────────────────────────────────────

  _deal() {
    if (!this.active) return;

    const { card, reshuffled } = this.deck.deal();

    if (reshuffled) {
      this.runningCount    = 0;
      this._el.input.value = '0';
      this._showFeedback('info', '🔀 Shoe reshuffled — running count reset to 0');
    }

    this.currentCard = card;
    this.locked      = false;
    renderCard(card, this._el.card, true);
    this._updateShoeBar();
    this._el.input.focus();
    this._el.input.select();
  }

  _submit() {
    if (!this.active || !this.currentCard || this.locked) return;

    const raw = this._el.input.value.trim();
    const userVal = parseInt(raw, 10);
    if (isNaN(userVal)) {
      this._el.input.select();
      return;
    }

    this.locked = true;
    this.runningCount += this.currentCard.value;
    this.total++;

    const isCorrect = userVal === this.runningCount;

    if (isCorrect) {
      this.correct++;
      this.streak++;
      if (this.streak > this.bestStreak) this.bestStreak = this.streak;
    } else {
      this.streak = 0;
    }

    // Sync input to correct count so next card starts from right baseline
    this._el.input.value = String(this.runningCount);

    const sign = n => (n > 0 ? '+' : '') + n;
    if (isCorrect) {
      this._showFeedback('correct', `✓  Correct! Running count: ${sign(this.runningCount)}`);
    } else {
      this._showFeedback(
        'incorrect',
        `✗  You entered ${sign(userVal)} — actual count is ${sign(this.runningCount)}`
      );
    }

    this._updateStats();

    // Auto-deal after brief feedback pause
    setTimeout(() => {
      this._clearFeedback();
      this._deal();
    }, 1300);
  }

  _endSession() {
    if (this.active && this.total > 0) {
      statsManager.recordSession({
        mode:       'Flashcard',
        correct:    this.correct,
        total:      this.total,
        bestStreak: this.bestStreak,
      });
    }
    this.active      = false;
    this.currentCard = null;
    this.locked      = false;
    this.runningCount = 0;
    this.correct     = 0;
    this.total       = 0;
    this.streak      = 0;
    this.bestStreak  = 0;
    this._el.input.value     = '0';
    this._el.startBtn.textContent = 'Start';
    this._clearFeedback();
    renderCard(null, this._el.card);
    this._updateStats();
    this._updateShoeBar();
  }

  _showFeedback(type, msg) {
    this._el.feedback.textContent = msg;
    this._el.feedback.className   = `feedback-bar ${type}`;
  }

  _clearFeedback() {
    this._el.feedback.textContent = '';
    this._el.feedback.className   = 'feedback-bar';
  }

  _updateShoeBar() {
    const { numDecks, penetration } = settings;
    const pct = Math.round(penetration * 100);
    const deckLabel = `${numDecks} deck${numDecks > 1 ? 's' : ''} · ${pct}% penetration`;

    if (!this.deck || !this.active) {
      this._el.shoeInfo.textContent  = 'Press Start to begin';
      this._el.deckInfo.textContent  = deckLabel;
      this._el.progress.style.width  = '0%';
      return;
    }

    const rem = this.deck.remaining;
    const tot = this.deck.total;
    this._el.shoeInfo.textContent  = `${rem} / ${tot} cards in shoe`;
    this._el.deckInfo.textContent  = deckLabel;
    this._el.progress.style.width  = `${Math.min(100, this.deck.progress * 100).toFixed(1)}%`;
  }

  _updateStats() {
    const { correct, total, streak } = this;
    this._el.correct.textContent  = correct;
    this._el.streak.textContent   = streak;
    this._el.accuracy.textContent = total === 0
      ? '—'
      : `${Math.round((correct / total) * 100)}%`;
    this._el.cards.textContent = total;
  }
}

// ── Learn Content ────────────────────────────────────────────────────────────

function buildLearnContent() {
  const miniCards = (ranks, colorClass) =>
    ranks.map(r => `<span class="mini-card ${colorClass}">${r}</span>`).join('');

  return `<div class="learn-page">
    <h2>Hi-Lo Card Counting</h2>
    <p class="lead">
      Card counting is a strategy that tracks the composition of the remaining shoe to determine
      when the player has a statistical edge. Hi-Lo is the most widely-used system — balanced,
      powerful, and practical at the table.
    </p>

    <section class="learn-section">
      <h3>Card Values</h3>
      <div class="hilo-table">
        <div class="hilo-row positive">
          <div class="hilo-value">+1</div>
          <div class="hilo-cards">${miniCards(['2','3','4','5','6'], 'black')}</div>
          <div class="hilo-desc">Low cards — unfavorable for player</div>
        </div>
        <div class="hilo-row neutral">
          <div class="hilo-value">0</div>
          <div class="hilo-cards">${miniCards(['7','8','9'], 'black')}</div>
          <div class="hilo-desc">Neutral — ignore these</div>
        </div>
        <div class="hilo-row negative">
          <div class="hilo-value">−1</div>
          <div class="hilo-cards">
            ${miniCards(['10','J','Q','K'], 'black')}
            ${miniCards(['A'], 'red')}
          </div>
          <div class="hilo-desc">High cards — favorable for player</div>
        </div>
      </div>
    </section>

    <section class="learn-section">
      <h3>Running Count</h3>
      <p>
        Start at <strong>0</strong> when a fresh shoe is shuffled. As each card is dealt,
        add or subtract its Hi-Lo value. The result is the <em>running count</em>.
      </p>
      <div class="example-block">
        <div class="ex-title">Example hand</div>
        <div class="ex-steps">
          <div class="ex-step">Card: <strong>5♠</strong> (+1) → count: <span class="pos">+1</span></div>
          <div class="ex-step">Card: <strong>K♥</strong> (−1) → count: <span class="neu">0</span></div>
          <div class="ex-step">Card: <strong>8♦</strong>  (0) → count: <span class="neu">0</span></div>
          <div class="ex-step">Card: <strong>3♣</strong> (+1) → count: <span class="pos">+1</span></div>
          <div class="ex-step">Card: <strong>A♠</strong> (−1) → count: <span class="neu">0</span></div>
        </div>
      </div>
    </section>

    <section class="learn-section">
      <h3>True Count</h3>
      <p>
        The running count is biased by how many cards remain — a count of +6 with
        half a deck left is much stronger than +6 with 4 decks left. The
        <em>true count</em> normalizes for deck depth:
      </p>
      <div class="formula-block">
        True Count = Running Count ÷ Decks Remaining
      </div>
      <p>
        <strong>Example:</strong> Running count of +6 with 2 decks remaining →
        True Count = <strong>+3</strong>. Use the true count to size your bets.
      </p>
    </section>

    <section class="learn-section">
      <h3>Why It Works</h3>
      <p>High cards (10s and Aces) favor the player for three reasons:</p>
      <ul>
        <li>
          <strong>Natural blackjacks</strong> (A + 10-value) pay 3:2 to the player but only
          even money to the dealer — you win more when they occur.
        </li>
        <li>
          <strong>Dealer bust rate rises</strong> — the dealer must hit until 17 and is more
          likely to bust when the shoe is 10-heavy.
        </li>
        <li>
          <strong>Doubles and splits pay off more</strong> when high cards are likely to follow.
        </li>
      </ul>
      <p>
        A high positive count signals that low cards have been flushed from the shoe, leaving
        a disproportionate share of 10s and Aces. This is when you bet big.
      </p>
    </section>

    <section class="learn-section">
      <h3>Betting Ramp (True Count)</h3>
      <div class="bet-table">
        <div class="bt-row header">
          <span>True Count</span>
          <span>Approximate Edge</span>
          <span>Bet Size</span>
        </div>
        <div class="bt-row negative-bg">
          <span>≤ 0</span><span>House edge ≈ 0.5%</span><span>Minimum</span>
        </div>
        <div class="bt-row neutral-bg">
          <span>+1</span><span>Near break-even</span><span>1× base</span>
        </div>
        <div class="bt-row low-positive-bg">
          <span>+2</span><span>Player +0.5%</span><span>2× base</span>
        </div>
        <div class="bt-row medium-positive-bg">
          <span>+3 to +4</span><span>Player +1–1.5%</span><span>4× base</span>
        </div>
        <div class="bt-row high-positive-bg">
          <span>+5 or more</span><span>Player +2%+</span><span>Max bet</span>
        </div>
      </div>
    </section>
  </div>`;
}

// ── Stats View ───────────────────────────────────────────────────────────────

function renderStatsView() {
  const { allTime, sessions } = statsManager.data;
  const accuracy = allTime.total > 0
    ? `${Math.round((allTime.correct / allTime.total) * 100)}%`
    : '—';

  const el = document.getElementById('stats-content');
  el.innerHTML = `
    <h2>Your Statistics</h2>

    <div class="stats-overview">
      <div class="stat-card">
        <div class="stat-big">${accuracy}</div>
        <div class="stat-desc">All-Time Accuracy</div>
      </div>
      <div class="stat-card">
        <div class="stat-big">${allTime.total.toLocaleString()}</div>
        <div class="stat-desc">Cards Tracked</div>
      </div>
      <div class="stat-card">
        <div class="stat-big">${allTime.bestStreak}</div>
        <div class="stat-desc">Best Streak</div>
      </div>
      <div class="stat-card">
        <div class="stat-big">${sessions.length}</div>
        <div class="stat-desc">Sessions</div>
      </div>
    </div>

    <div class="sessions-section">
      <h3>Recent Sessions</h3>
      ${sessions.length === 0
        ? '<p class="muted">No sessions yet — start practicing!</p>'
        : `<div class="sessions-list">
            <div class="session-row header">
              <span>Mode</span>
              <span>Date</span>
              <span>Accuracy</span>
              <span>Cards</span>
              <span>Best Streak</span>
            </div>
            ${sessions.slice(0, 30).map(s => {
              const acc   = s.total > 0 ? `${Math.round(s.correct / s.total * 100)}%` : '—';
              const good  = s.total > 0 && s.correct / s.total >= 0.9;
              const dStr  = new Date(s.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
              return `<div class="session-row">
                <span class="mode-badge">${s.mode}</span>
                <span>${dStr}</span>
                <span class="acc-val${good ? ' good' : ''}">${acc}</span>
                <span>${s.total}</span>
                <span>${s.bestStreak}</span>
              </div>`;
            }).join('')}
          </div>`
      }
    </div>
    ${sessions.length > 0
      ? '<button class="danger-btn" id="clearStatsBtn">Clear All Statistics</button>'
      : ''}
  `;

  document.getElementById('clearStatsBtn')?.addEventListener('click', () => {
    if (confirm('Clear all statistics? This cannot be undone.')) {
      statsManager.clear();
      renderStatsView();
    }
  });
}

// ── How-to-Play Content ──────────────────────────────────────────────────────

const HOW_TO_PLAY = {
  flashcard: {
    title: 'Flashcard Drill',
    html: `
      <p>
        Cards are dealt one at a time from a shuffled shoe. Your goal is to maintain an
        accurate <strong>running count</strong> using the Hi-Lo system.
      </p>
      <ol>
        <li>Click <strong>Start</strong> to shuffle a fresh shoe.</li>
        <li>
          A card appears. Mentally update your running count:
          <div class="hilo-quick">
            <div class="hilo-quick-row">
              <span class="hilo-val pos">+1</span>
              <span class="hilo-ranks">2 · 3 · 4 · 5 · 6</span>
            </div>
            <div class="hilo-quick-row">
              <span class="hilo-val neu">0</span>
              <span class="hilo-ranks">7 · 8 · 9</span>
            </div>
            <div class="hilo-quick-row">
              <span class="hilo-val neg">−1</span>
              <span class="hilo-ranks">10 · J · Q · K · A</span>
            </div>
          </div>
        </li>
        <li>
          Enter your running count total and press <strong>Submit</strong>
          or <kbd>Enter</kbd>.
        </li>
        <li>The app tells you if you're right and shows the correct count.</li>
        <li>When the shoe hits the cut card, it reshuffles and resets to 0.</li>
      </ol>
      <p>
        Use the <strong>⚙ Settings</strong> button to change the number of decks and
        penetration depth — more decks and deeper penetration are closer to real casino conditions.
      </p>
    `,
  },
};

let _modalMode = null;

function showHowToPlay(mode) {
  const content = HOW_TO_PLAY[mode];
  if (!content) return;
  _modalMode = mode;
  document.getElementById('modal-title').textContent = content.title;
  document.getElementById('modal-body').innerHTML    = content.html;
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.add('active');
  overlay.removeAttribute('aria-hidden');
  document.getElementById('closeModal').focus();
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('active');
  overlay.setAttribute('aria-hidden', 'true');
  _modalMode = null;
}

// ── App Bootstrap ────────────────────────────────────────────────────────────

let statsManager;
let flashcardDrill;
let currentMode = 'flashcard';

function initApp() {
  loadSettings();
  statsManager = new StatsManager();

  // Populate static sections
  document.getElementById('learn-content').innerHTML = buildLearnContent();
  flashcardDrill = new FlashcardDrill();

  // ── Navigation ──────────────────────────────────────────────────────────
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchMode(btn.dataset.mode));
  });

  // ── Settings Panel ───────────────────────────────────────────────────────
  const settingsPanel = document.getElementById('settingsPanel');
  const overlay       = document.getElementById('overlay');

  document.getElementById('settingsBtn').addEventListener('click', () => {
    settingsPanel.classList.add('open');
    settingsPanel.removeAttribute('aria-hidden');
    overlay.classList.add('active');
  });

  function closeSettings() {
    settingsPanel.classList.remove('open');
    settingsPanel.setAttribute('aria-hidden', 'true');
    overlay.classList.remove('active');
  }

  document.getElementById('closeSettings').addEventListener('click', closeSettings);
  overlay.addEventListener('click', closeSettings);

  // Deck count buttons
  document.querySelectorAll('#deckCountGroup .opt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#deckCountGroup .opt-btn')
        .forEach(b => b.classList.toggle('active', b === btn));
      settings.numDecks = parseInt(btn.dataset.value, 10);
      saveSettings();
      flashcardDrill.refreshShoeBar();
    });
  });

  // Penetration slider
  const slider     = document.getElementById('penetrationSlider');
  const pctDisplay = document.getElementById('penetrationDisplay');
  slider.value     = Math.round(settings.penetration * 100);
  pctDisplay.textContent = slider.value + '%';

  slider.addEventListener('input', () => {
    settings.penetration       = parseInt(slider.value, 10) / 100;
    pctDisplay.textContent     = slider.value + '%';
    saveSettings();
    flashcardDrill.refreshShoeBar();
  });

  // ── Dark Mode ────────────────────────────────────────────────────────────
  const darkBtn = document.getElementById('darkModeBtn');
  // default is dark; light-mode class = light
  const savedDark = localStorage.getItem('cc_darkmode');
  if (savedDark === 'false') {
    document.body.classList.add('light-mode');
    darkBtn.textContent = '🌙';
  }

  darkBtn.addEventListener('click', () => {
    const isNowLight = document.body.classList.toggle('light-mode');
    darkBtn.textContent = isNowLight ? '🌙' : '☀';
    localStorage.setItem('cc_darkmode', String(!isNowLight));
  });

  // ── Modal ────────────────────────────────────────────────────────────────
  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('modal-dismiss').addEventListener('click', closeModal);
  document.getElementById('modal-start').addEventListener('click', () => {
    closeModal();
    if (_modalMode === 'flashcard') flashcardDrill.start();
  });
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target.id === 'modal-overlay') closeModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  // ── Help Buttons ─────────────────────────────────────────────────────────
  document.querySelectorAll('.help-btn').forEach(btn => {
    btn.addEventListener('click', () => showHowToPlay(btn.dataset.mode));
  });

  // Apply saved settings to the settings panel UI
  syncSettingsUI();
}

function switchMode(mode) {
  if (mode === currentMode) return;
  currentMode = mode;

  document.querySelectorAll('.nav-btn')
    .forEach(b => b.classList.toggle('active', b.dataset.mode === mode));

  document.querySelectorAll('.mode-section')
    .forEach(s => s.classList.remove('active'));

  const section = document.getElementById(`${mode}-mode`);
  if (section) section.classList.add('active');

  if (mode === 'stats') renderStatsView();
}

function syncSettingsUI() {
  document.querySelectorAll('#deckCountGroup .opt-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.value, 10) === settings.numDecks);
  });
  const pct = Math.round(settings.penetration * 100);
  document.getElementById('penetrationSlider').value     = pct;
  document.getElementById('penetrationDisplay').textContent = pct + '%';
}

document.addEventListener('DOMContentLoaded', initApp);
