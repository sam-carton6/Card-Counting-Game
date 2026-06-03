'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   CARD COUNTER PRO — app.js
   ═══════════════════════════════════════════════════════════════════════════ */

// ── Constants ───────────────────────────────────────────────────────────────

const SUITS     = ['♠', '♥', '♦', '♣'];
const RANKS     = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const RED_SUITS = new Set(['♥', '♦']);
const SUIT_INIT = { '♠':'S', '♥':'H', '♦':'D', '♣':'C' };

const HI_LO = {
  'A':-1,'2':1,'3':1,'4':1,'5':1,'6':1,
  '7':0, '8':0,'9':0,
  '10':-1,'J':-1,'Q':-1,'K':-1,
};

// ── Audio Engine (Web Audio API, no files needed) ────────────────────────────

const Audio = (() => {
  let _ctx = null;

  function safe(fn) {
    try {
      if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
      // resume() is async — wait for it before scheduling any nodes
      if (_ctx.state === 'running') {
        fn(_ctx);
      } else {
        _ctx.resume().then(() => fn(_ctx)).catch(() => {});
      }
    } catch {}
  }

  function osc(c, type, freq, gainVal, dur, startT) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.connect(g); g.connect(c.destination);
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(gainVal, startT);
    g.gain.exponentialRampToValueAtTime(0.0001, startT + dur);
    o.start(startT); o.stop(startT + dur);
  }

  function noise(c, filterFreq, gainVal, dur) {
    const len = Math.ceil(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.5);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = filterFreq; f.Q.value = 1.2;
    const g = c.createGain(); g.gain.value = gainVal;
    src.connect(f); f.connect(g); g.connect(c.destination);
    src.start(c.currentTime);
  }

  return {
    click()    { safe(c => osc(c, 'sine', 1100, 0.07, 0.035, c.currentTime)); },

    cardFlip() { safe(c => noise(c, 2800, 0.35, 0.09)); },

    correct()  {
      safe(c => {
        [523.25, 659.25, 784].forEach((f, i) =>
          osc(c, 'sine', f, 0.12, 0.18, c.currentTime + i * 0.07));
      });
    },

    incorrect() {
      safe(c => {
        [[310, 220], [260, 190]].forEach(([f, f2], i) => {
          const t = c.currentTime + i * 0.11;
          const o = c.createOscillator(), g = c.createGain();
          o.connect(g); g.connect(c.destination);
          o.type = 'sawtooth';
          o.frequency.setValueAtTime(f, t);
          o.frequency.exponentialRampToValueAtTime(f2, t + 0.11);
          g.gain.setValueAtTime(0.09, t);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
          o.start(t); o.stop(t + 0.11);
        });
      });
    },

    chips() {
      safe(c => [1800, 2600, 2200].forEach((f, i) =>
        osc(c, 'triangle', f, 0.07, 0.07, c.currentTime + i * 0.022)));
    },

    win() {
      safe(c => [523.25, 659.25, 784, 1046.5].forEach((f, i) =>
        osc(c, 'sine', f, 0.13, 0.28, c.currentTime + i * 0.1)));
    },

    lose() {
      safe(c => [523.25, 440, 349.23, 261.63].forEach((f, i) =>
        osc(c, 'sine', f, 0.09, 0.22, c.currentTime + i * 0.1)));
    },

    timerWarn()  { safe(c => osc(c, 'sine', 880, 0.07, 0.1, c.currentTime)); },

    timeUp() {
      safe(c => {
        const o = c.createOscillator(), g = c.createGain();
        o.connect(g); g.connect(c.destination);
        o.type = 'square';
        o.frequency.setValueAtTime(440, c.currentTime);
        o.frequency.exponentialRampToValueAtTime(220, c.currentTime + 0.4);
        g.gain.setValueAtTime(0.1, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.4);
        o.start(); o.stop(c.currentTime + 0.4);
      });
    },

    reshuffle() { for (let i = 0; i < 6; i++) setTimeout(() => this.cardFlip(), i * 55); },
  };
})();

// ── Settings ────────────────────────────────────────────────────────────────

const SETTINGS_KEY = 'cc_settings';

let settings = {
  numDecks:      1,
  penetration:   0.75,
  timeLimit:     60,
  cardsPerGroup: 3,
};

function loadSettings() {
  try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); }
  catch {}
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// ── Deck Engine ─────────────────────────────────────────────────────────────

class Deck {
  constructor(numDecks, penetration) {
    this.numDecks    = numDecks;
    this.penetration = penetration;
    this._build();
  }

  _build() {
    this.cards = [];
    for (let d = 0; d < this.numDecks; d++)
      for (const suit of SUITS)
        for (const rank of RANKS)
          this.cards.push({ suit, rank, red: RED_SUITS.has(suit), value: HI_LO[rank] });
    this._shuffle();
    this.pos      = 0;
    this.cutCard  = Math.floor(this.cards.length * this.penetration);
  }

  _shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  deal() {
    if (this.pos >= this.cutCard) {
      this._build();
      return { card: this.cards[this.pos++], reshuffled: true };
    }
    return { card: this.cards[this.pos++], reshuffled: false };
  }

  get remaining() { return Math.max(0, this.cutCard - this.pos); }
  get total()     { return this.cutCard; }
  get progress()  { return this.pos / this.cutCard; }
}

// ── Blackjack hand helpers ───────────────────────────────────────────────────

function handTotal(cards, allCards = false) {
  let total = 0, aces = 0;
  for (const c of cards) {
    if (!allCards && c.faceDown) continue;
    if (c.rank === 'A')                       { aces++; total += 11; }
    else if (['J','Q','K'].includes(c.rank))  total += 10;
    else                                      total += parseInt(c.rank);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function isSoftTotal(cards) {
  let total = 0, aces = 0;
  for (const c of cards) {
    if (c.faceDown) continue;
    if (c.rank === 'A')                      { aces++; total += 11; }
    else if (['J','Q','K'].includes(c.rank)) total += 10;
    else                                     total += parseInt(c.rank);
  }
  let soft = aces;
  while (total > 21 && soft > 0) { total -= 10; soft--; }
  return soft > 0;
}

// ── Stats Manager ────────────────────────────────────────────────────────────

class StatsManager {
  constructor() { this._load(); }

  _load() {
    try {
      this.data = JSON.parse(localStorage.getItem('cc_stats') || 'null')
        || { sessions: [], allTime: { correct: 0, total: 0, bestStreak: 0 } };
    } catch { this.data = { sessions: [], allTime: { correct: 0, total: 0, bestStreak: 0 } }; }
  }

  _save() { localStorage.setItem('cc_stats', JSON.stringify(this.data)); }

  recordSession(session) {
    if (!session.total) return;
    this.data.sessions.unshift({ date: new Date().toISOString(), ...session });
    if (this.data.sessions.length > 100) this.data.sessions.length = 100;
    this.data.allTime.correct += session.correct;
    this.data.allTime.total   += session.total;
    if (session.bestStreak > this.data.allTime.bestStreak)
      this.data.allTime.bestStreak = session.bestStreak;
    this._save();
  }

  clear() {
    this.data = { sessions: [], allTime: { correct: 0, total: 0, bestStreak: 0 } };
    this._save();
  }
}

// ── Card Rendering ───────────────────────────────────────────────────────────

function renderCard(card, el, animate = false) {
  if (!card || card.faceDown) {
    el.className = 'playing-card face-down';
    el.innerHTML = '<div class="card-back"></div>';
    _tryAsset(el, 'assets/cards/back.png');
    if (animate) { Audio.cardFlip(); _animateCard(el); }
    return;
  }

  el.className = `playing-card ${card.red ? 'red' : 'black'}`;
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

  _tryAsset(el, `assets/cards/${card.rank}${SUIT_INIT[card.suit]}.png`);

  if (animate) { Audio.cardFlip(); _animateCard(el); }
}

function _animateCard(el) {
  el.classList.add('dealing');
  el.addEventListener('animationend', () => el.classList.remove('dealing'), { once: true });
}

function _tryAsset(el, src) {
  const img = document.createElement('img');
  img.className = 'card-asset';
  img.alt = '';
  img.src = src;
  img.onload = () => {
    img.style.display = 'block';
    el.querySelectorAll('.card-corner, .card-center-suit, .card-back')
      .forEach(e => (e.style.visibility = 'hidden'));
  };
  el.appendChild(img);
}

// ── Flashcard Drill ───────────────────────────────────────────────────────────

class FlashcardDrill {
  constructor() {
    this.deck = null; this.runningCount = 0;
    this.correct = 0; this.total = 0;
    this.streak = 0;  this.bestStreak = 0;
    this.currentCard = null; this.locked = false; this.active = false;
    this._cache(); this._bind();
    this._updateStats(); this._updateShoeBar(); renderCard(null, this._el.card);
  }

  _cache() {
    this._el = {
      card: document.getElementById('fc-card'), input: document.getElementById('fc-count-input'),
      feedback: document.getElementById('fc-feedback'), shoeInfo: document.getElementById('fc-shoe-info'),
      deckInfo: document.getElementById('fc-deck-info'), progress: document.getElementById('fc-shoe-progress'),
      correct: document.getElementById('fc-correct'), streak: document.getElementById('fc-streak'),
      accuracy: document.getElementById('fc-accuracy'), cards: document.getElementById('fc-cards'),
      startBtn: document.getElementById('fc-start'),
    };
  }

  _bind() {
    document.getElementById('fc-submit').addEventListener('click', () => this._submit());
    document.getElementById('fc-start').addEventListener('click', () => this.start());
    document.getElementById('fc-reset').addEventListener('click', () => this._endSession());
    document.getElementById('fc-minus').addEventListener('click', () => { this._el.input.value = (parseInt(this._el.input.value) || 0) - 1; this._el.input.focus(); });
    document.getElementById('fc-plus') .addEventListener('click', () => { this._el.input.value = (parseInt(this._el.input.value) || 0) + 1; this._el.input.focus(); });
    this._el.input.addEventListener('keydown', e => { if (e.key === 'Enter') this._submit(); });
  }

  start() {
    this.deck = new Deck(settings.numDecks, settings.penetration);
    this.runningCount = 0; this.correct = 0; this.total = 0;
    this.streak = 0; this.bestStreak = 0; this.active = true; this.locked = false;
    this._el.input.value = '0';
    this._clearFeedback();
    this._el.startBtn.textContent = 'New Shoe';
    this._updateStats(); this._updateShoeBar(); this._deal();
  }

  _deal() {
    if (!this.active) return;
    const { card, reshuffled } = this.deck.deal();
    if (reshuffled) { this.runningCount = 0; this._el.input.value = '0'; this._showFeedback('info', '🔀 Shoe reshuffled — count reset to 0'); Audio.reshuffle(); }
    this.currentCard = card; this.locked = false;
    renderCard(card, this._el.card, true);
    this._updateShoeBar();
    this._el.input.focus(); this._el.input.select();
  }

  _submit() {
    if (!this.active || !this.currentCard || this.locked) return;
    const userVal = parseInt(this._el.input.value, 10);
    if (isNaN(userVal)) return;
    this.locked = true;
    this.runningCount += this.currentCard.value;
    this.total++;
    const ok = userVal === this.runningCount;
    if (ok) { this.correct++; this.streak++; if (this.streak > this.bestStreak) this.bestStreak = this.streak; Audio.correct(); }
    else    { this.streak = 0; Audio.incorrect(); }
    this._el.input.value = String(this.runningCount);
    const s = n => (n >= 0 ? '+' : '') + n;
    this._showFeedback(ok ? 'correct' : 'incorrect',
      ok ? `✓  Correct! Count: ${s(this.runningCount)}`
         : `✗  You entered ${s(userVal)} — actual: ${s(this.runningCount)}`);
    this._updateStats();
    setTimeout(() => { this._clearFeedback(); this._deal(); }, 1300);
  }

  _endSession() {
    if (this.active && this.total > 0)
      statsManager.recordSession({ mode: 'Flashcard', correct: this.correct, total: this.total, bestStreak: this.bestStreak });
    this.active = false; this.currentCard = null; this.locked = false;
    this.runningCount = 0; this.correct = 0; this.total = 0; this.streak = 0; this.bestStreak = 0;
    this._el.input.value = '0'; this._el.startBtn.textContent = 'Start';
    this._clearFeedback(); renderCard(null, this._el.card);
    this._updateStats(); this._updateShoeBar();
  }

  _showFeedback(type, msg)  { this._el.feedback.textContent = msg; this._el.feedback.className = `feedback-bar ${type}`; }
  _clearFeedback()          { this._el.feedback.textContent = ''; this._el.feedback.className = 'feedback-bar'; }

  _updateShoeBar() {
    const { numDecks, penetration } = settings;
    this._el.deckInfo.textContent = `${numDecks} deck${numDecks > 1 ? 's' : ''} · ${Math.round(penetration * 100)}% penetration`;
    if (!this.deck || !this.active) { this._el.shoeInfo.textContent = 'Press Start to begin'; this._el.progress.style.width = '0%'; return; }
    this._el.shoeInfo.textContent  = `${this.deck.remaining} / ${this.deck.total} cards in shoe`;
    this._el.progress.style.width  = `${Math.min(100, this.deck.progress * 100).toFixed(1)}%`;
  }

  _updateStats() {
    this._el.correct.textContent  = this.correct;
    this._el.streak.textContent   = this.streak;
    this._el.accuracy.textContent = this.total ? `${Math.round(this.correct / this.total * 100)}%` : '—';
    this._el.cards.textContent    = this.total;
  }

  refreshShoeBar() { this._updateShoeBar(); }
}

// ── Speed Round ───────────────────────────────────────────────────────────────

class SpeedRound {
  constructor() {
    this.deck = null; this.runningCount = 0;
    this.correct = 0; this.total = 0;
    this.streak = 0;  this.bestStreak = 0;
    this.currentCard = null; this.locked = false; this.active = false;
    this.timeLeft = settings.timeLimit; this._timerInterval = null;
    this._cache(); this._bind();
    this._updateStats(); this._renderTimer(); renderCard(null, this._el.card);
  }

  _cache() {
    this._el = {
      card: document.getElementById('sr-card'), input: document.getElementById('sr-count-input'),
      feedback: document.getElementById('sr-feedback'), shoeInfo: document.getElementById('sr-shoe-info'),
      deckInfo: document.getElementById('sr-deck-info'), progress: document.getElementById('sr-shoe-progress'),
      timer: document.getElementById('sr-timer'), timerBar: document.getElementById('sr-timer-bar'),
      correct: document.getElementById('sr-correct'), streak: document.getElementById('sr-streak'),
      accuracy: document.getElementById('sr-accuracy'), cpm: document.getElementById('sr-cpm'),
      startBtn: document.getElementById('sr-start'),
    };
  }

  _bind() {
    document.getElementById('sr-submit').addEventListener('click', () => this._submit());
    document.getElementById('sr-start') .addEventListener('click', () => this.start());
    document.getElementById('sr-reset') .addEventListener('click', () => this._endSession(true));
    document.getElementById('sr-minus') .addEventListener('click', () => { this._el.input.value = (parseInt(this._el.input.value) || 0) - 1; this._el.input.focus(); });
    document.getElementById('sr-plus')  .addEventListener('click', () => { this._el.input.value = (parseInt(this._el.input.value) || 0) + 1; this._el.input.focus(); });
    this._el.input.addEventListener('keydown', e => { if (e.key === 'Enter') this._submit(); });
  }

  start() {
    this.deck = new Deck(settings.numDecks, settings.penetration);
    this.runningCount = 0; this.correct = 0; this.total = 0;
    this.streak = 0; this.bestStreak = 0; this.active = true; this.locked = false;
    this.timeLeft = settings.timeLimit;
    this._el.input.value = '0';
    this._clearFeedback();
    this._el.startBtn.textContent = 'Restart';
    this._renderTimer();
    this._startTimer();
    this._updateStats();
    this._deal();
  }

  _startTimer() {
    clearInterval(this._timerInterval);
    this._timerInterval = setInterval(() => {
      this.timeLeft--;
      this._renderTimer();
      if (this.timeLeft <= 10) Audio.timerWarn();
      if (this.timeLeft <= 0) { Audio.timeUp(); this._endSession(false); }
    }, 1000);
  }

  _renderTimer() {
    const pct = Math.max(0, (this.timeLeft / settings.timeLimit) * 100);
    this._el.timer.textContent   = Math.max(0, this.timeLeft);
    this._el.timerBar.style.width = `${pct}%`;
    const warn = this.timeLeft <= 10 && this.timeLeft > 0;
    this._el.timer.classList.toggle('warning', warn);
    this._el.timerBar.classList.toggle('warning', warn);
  }

  _deal() {
    if (!this.active) return;
    const { card, reshuffled } = this.deck.deal();
    if (reshuffled) { this.runningCount = 0; this._el.input.value = '0'; Audio.reshuffle(); this._showFeedback('info', '🔀 Reshuffled'); }
    this.currentCard = card; this.locked = false;
    renderCard(card, this._el.card, true);
    this._updateShoeBar();
    this._el.input.focus(); this._el.input.select();
  }

  _submit() {
    if (!this.active || !this.currentCard || this.locked) return;
    const userVal = parseInt(this._el.input.value, 10);
    if (isNaN(userVal)) return;
    this.locked = true;
    this.runningCount += this.currentCard.value;
    this.total++;
    const ok = userVal === this.runningCount;
    if (ok) { this.correct++; this.streak++; if (this.streak > this.bestStreak) this.bestStreak = this.streak; Audio.correct(); }
    else    { this.streak = 0; Audio.incorrect(); }
    this._el.input.value = String(this.runningCount);
    const s = n => (n >= 0 ? '+' : '') + n;
    this._showFeedback(ok ? 'correct' : 'incorrect',
      ok ? `✓  ${s(this.runningCount)}` : `✗  ${s(userVal)} → actual ${s(this.runningCount)}`);
    this._updateStats();
    setTimeout(() => { this._clearFeedback(); this._deal(); }, 700);
  }

  _endSession(manual = false) {
    clearInterval(this._timerInterval);
    if (this.active && this.total > 0)
      statsManager.recordSession({ mode: 'Speed', correct: this.correct, total: this.total, bestStreak: this.bestStreak });
    this.active = false; this.currentCard = null; this.locked = false;
    this.runningCount = 0; this.correct = 0; this.total = 0; this.streak = 0; this.bestStreak = 0;
    this.timeLeft = settings.timeLimit;
    this._el.input.value = '0'; this._el.startBtn.textContent = 'Start';
    this._clearFeedback(); renderCard(null, this._el.card);
    this._renderTimer(); this._updateStats(); this._updateShoeBar();
  }

  _showFeedback(type, msg)  { this._el.feedback.textContent = msg; this._el.feedback.className = `feedback-bar ${type}`; }
  _clearFeedback()          { this._el.feedback.textContent = ''; this._el.feedback.className = 'feedback-bar'; }

  _updateShoeBar() {
    const { numDecks, penetration } = settings;
    this._el.deckInfo.textContent = `${numDecks} deck${numDecks > 1 ? 's' : ''} · ${Math.round(penetration * 100)}% penetration`;
    if (!this.deck || !this.active) { this._el.shoeInfo.textContent = 'Press Start to begin'; this._el.progress.style.width = '0%'; return; }
    this._el.shoeInfo.textContent = `${this.deck.remaining} / ${this.deck.total} cards`;
    this._el.progress.style.width = `${Math.min(100, this.deck.progress * 100).toFixed(1)}%`;
  }

  _updateStats() {
    const elapsed = settings.timeLimit - Math.max(0, this.timeLeft);
    this._el.correct.textContent  = this.correct;
    this._el.streak.textContent   = this.bestStreak;
    this._el.accuracy.textContent = this.total ? `${Math.round(this.correct / this.total * 100)}%` : '—';
    this._el.cpm.textContent      = elapsed > 0 ? Math.round(this.total / elapsed * 60) : '—';
  }

  refreshShoeBar() { this._updateShoeBar(); }
}

// ── Multi-Card Drill ──────────────────────────────────────────────────────────

class MultiCardDrill {
  constructor() {
    this.deck = null; this.runningCount = 0;
    this.correct = 0; this.total = 0;
    this.streak = 0;  this.bestStreak = 0;
    this.currentGroup = []; this.locked = false; this.active = false;
    this._cache(); this._bind();
    this._updateStats(); this._updateShoeBar();
  }

  _cache() {
    this._el = {
      row: document.getElementById('mc-card-row'), input: document.getElementById('mc-count-input'),
      feedback: document.getElementById('mc-feedback'), shoeInfo: document.getElementById('mc-shoe-info'),
      deckInfo: document.getElementById('mc-deck-info'), progress: document.getElementById('mc-shoe-progress'),
      correct: document.getElementById('mc-correct'), streak: document.getElementById('mc-streak'),
      accuracy: document.getElementById('mc-accuracy'), groups: document.getElementById('mc-groups'),
      startBtn: document.getElementById('mc-start'),
    };
  }

  _bind() {
    document.getElementById('mc-submit').addEventListener('click', () => this._submit());
    document.getElementById('mc-start') .addEventListener('click', () => this.start());
    document.getElementById('mc-reset') .addEventListener('click', () => this._endSession());
    document.getElementById('mc-minus') .addEventListener('click', () => { this._el.input.value = (parseInt(this._el.input.value) || 0) - 1; this._el.input.focus(); });
    document.getElementById('mc-plus')  .addEventListener('click', () => { this._el.input.value = (parseInt(this._el.input.value) || 0) + 1; this._el.input.focus(); });
    this._el.input.addEventListener('keydown', e => { if (e.key === 'Enter') this._submit(); });
  }

  start() {
    this.deck = new Deck(settings.numDecks, settings.penetration);
    this.runningCount = 0; this.correct = 0; this.total = 0;
    this.streak = 0; this.bestStreak = 0; this.active = true; this.locked = false;
    this._el.input.value = '0';
    this._clearFeedback();
    this._el.startBtn.textContent = 'New Shoe';
    this._updateStats(); this._updateShoeBar(); this._dealGroup();
  }

  _dealGroup() {
    if (!this.active) return;
    const n = settings.cardsPerGroup;
    this.currentGroup = [];
    let reshuffled = false;
    for (let i = 0; i < n; i++) {
      const r = this.deck.deal();
      if (r.reshuffled && !reshuffled) { reshuffled = true; this.runningCount = 0; this._el.input.value = '0'; }
      this.currentGroup.push(r.card);
    }
    if (reshuffled) { Audio.reshuffle(); this._showFeedback('info', '🔀 Reshuffled — count reset to 0'); }
    this.locked = false;
    this._renderGroup();
    this._updateShoeBar();
    this._el.input.focus(); this._el.input.select();
  }

  _renderGroup() {
    this._el.row.innerHTML = '';
    this.currentGroup.forEach((card, i) => {
      const el = document.createElement('div');
      el.className = 'playing-card';
      this._el.row.appendChild(el);
      setTimeout(() => renderCard(card, el, true), i * 120);
    });
  }

  _submit() {
    if (!this.active || this.currentGroup.length === 0 || this.locked) return;
    const userVal = parseInt(this._el.input.value, 10);
    if (isNaN(userVal)) return;
    this.locked = true;
    this.currentGroup.forEach(c => { this.runningCount += c.value; });
    this.total++;
    const ok = userVal === this.runningCount;
    if (ok) { this.correct++; this.streak++; if (this.streak > this.bestStreak) this.bestStreak = this.streak; Audio.correct(); }
    else    { this.streak = 0; Audio.incorrect(); }
    this._el.input.value = String(this.runningCount);
    const s = n => (n >= 0 ? '+' : '') + n;
    this._showFeedback(ok ? 'correct' : 'incorrect',
      ok ? `✓  Correct! Count: ${s(this.runningCount)}`
         : `✗  You entered ${s(userVal)} — actual: ${s(this.runningCount)}`);
    this._updateStats();
    setTimeout(() => { this._clearFeedback(); this._dealGroup(); }, 1300);
  }

  _endSession() {
    if (this.active && this.total > 0)
      statsManager.recordSession({ mode: 'Multi-Card', correct: this.correct, total: this.total, bestStreak: this.bestStreak });
    this.active = false; this.currentGroup = []; this.locked = false;
    this.runningCount = 0; this.correct = 0; this.total = 0; this.streak = 0; this.bestStreak = 0;
    this._el.input.value = '0'; this._el.row.innerHTML = ''; this._el.startBtn.textContent = 'Start';
    this._clearFeedback(); this._updateStats(); this._updateShoeBar();
  }

  _showFeedback(type, msg)  { this._el.feedback.textContent = msg; this._el.feedback.className = `feedback-bar ${type}`; }
  _clearFeedback()          { this._el.feedback.textContent = ''; this._el.feedback.className = 'feedback-bar'; }

  _updateShoeBar() {
    const { numDecks, penetration } = settings;
    this._el.deckInfo.textContent = `${numDecks} deck${numDecks > 1 ? 's' : ''} · ${Math.round(penetration * 100)}% penetration`;
    if (!this.deck || !this.active) { this._el.shoeInfo.textContent = 'Press Start to begin'; this._el.progress.style.width = '0%'; return; }
    this._el.shoeInfo.textContent = `${this.deck.remaining} / ${this.deck.total} cards`;
    this._el.progress.style.width = `${Math.min(100, this.deck.progress * 100).toFixed(1)}%`;
  }

  _updateStats() {
    this._el.correct.textContent  = this.correct;
    this._el.streak.textContent   = this.streak;
    this._el.accuracy.textContent = this.total ? `${Math.round(this.correct / this.total * 100)}%` : '—';
    this._el.groups.textContent   = this.total;
  }

  refreshShoeBar() { this._updateShoeBar(); }
}

// ── Blackjack Game ────────────────────────────────────────────────────────────

class BlackjackGame {
  constructor() {
    this.deck = null;
    this.playerHand = []; this.dealerHand = [];
    this.phase = 'bet';   // 'bet' | 'player' | 'dealer' | 'result'
    this.chips = 100;     this.bet = 0;
    this.wins = 0;        this.losses = 0; this.pushes = 0;
    this._actualCount = 0;
    this.countChecks = { correct: 0, total: 0 };
    this._cache(); this._bind();
    this._showPhase('bet');
    this._updateChipsDisplay();
    this._updateStats();
  }

  _cache() {
    this._el = {
      dealerHand: document.getElementById('bj-dealer-hand'),
      playerHand: document.getElementById('bj-player-hand'),
      dealerVal:  document.getElementById('bj-dealer-val'),
      playerVal:  document.getElementById('bj-player-val'),
      resultBanner: document.getElementById('bj-result-banner'),
      shoeInfo:   document.getElementById('bj-shoe-info'),
      deckInfo:   document.getElementById('bj-deck-info'),
      progress:   document.getElementById('bj-shoe-progress'),
      chips:      document.getElementById('bj-chips'),
      betDisplay: document.getElementById('bj-bet-display'),
      dealBtn:    document.getElementById('bj-deal-btn'),
      countInput: document.getElementById('bj-count-input'),
      countGrade: document.getElementById('bj-count-grade'),
      countCheck: document.getElementById('bj-count-check'),
      hitBtn:     document.getElementById('bj-hit'),
      doubleBtn:  document.getElementById('bj-double'),
      statWins:   document.getElementById('bj-stat-wins'),
      statLosses: document.getElementById('bj-stat-losses'),
      statChips:  document.getElementById('bj-stat-chips'),
      statCount:  document.getElementById('bj-stat-count'),
    };
  }

  _bind() {
    document.querySelectorAll('.chip-btn[data-amount]').forEach(btn => {
      btn.addEventListener('click', () => { this._addBet(parseInt(btn.dataset.amount)); Audio.chips(); });
    });
    document.getElementById('bj-clear-bet') .addEventListener('click', () => this._clearBet());
    document.getElementById('bj-deal-btn')  .addEventListener('click', () => this._startHand());
    document.getElementById('bj-hit')       .addEventListener('click', () => this._hit());
    document.getElementById('bj-stand')     .addEventListener('click', () => this._stand());
    document.getElementById('bj-double')    .addEventListener('click', () => this._double());
    document.getElementById('bj-next-hand') .addEventListener('click', () => this._nextHand());
    document.getElementById('bj-count-minus').addEventListener('click', () => { this._el.countInput.value = (parseInt(this._el.countInput.value) || 0) - 1; });
    document.getElementById('bj-count-plus') .addEventListener('click', () => { this._el.countInput.value = (parseInt(this._el.countInput.value) || 0) + 1; });
  }

  _addBet(amount) {
    if (this.phase !== 'bet') return;
    const max = this.chips;
    this.bet = Math.min(this.bet + amount, max);
    this._el.betDisplay.textContent = `$${this.bet}`;
    this._el.dealBtn.disabled = this.bet === 0;
  }

  _clearBet() {
    this.bet = 0;
    this._el.betDisplay.textContent = '$0';
    this._el.dealBtn.disabled = true;
  }

  _startHand() {
    if (!this.deck) this.deck = new Deck(settings.numDecks, settings.penetration);
    if (this.bet === 0) return;
    this.chips -= this.bet;
    this._updateChipsDisplay();
    this.playerHand = []; this.dealerHand = [];
    this._el.resultBanner.className = 'bj-result-banner hidden';
    this._showPhase('none');

    // Deal sequence with delays
    const steps = [
      () => this._dealTo(this.playerHand, false),
      () => this._dealTo(this.dealerHand, false),
      () => this._dealTo(this.playerHand, false),
      () => this._dealTo(this.dealerHand, true),
      () => this._afterDeal(),
    ];
    steps.forEach((fn, i) => setTimeout(fn, i * 320));
  }

  _dealTo(hand, faceDown) {
    const { card, reshuffled } = this.deck.deal();
    if (reshuffled) {
      this._actualCount = 0;
      this._el.countInput.value = '0';
      Audio.reshuffle();
    }
    if (!faceDown) this._actualCount += card.value;
    hand.push({ ...card, faceDown });
    this._renderHands();
    this._updateShoeBar();
  }

  _afterDeal() {
    this._updateValues();
    const pt = handTotal(this.playerHand, true);
    const dt = handTotal(this.dealerHand, true);

    if (pt === 21) {
      // Player natural — reveal dealer, then pause so player can update count
      this.dealerHand.forEach(c => { if (c.faceDown) { this._actualCount += c.value; delete c.faceDown; } });
      this._renderHands(); this._updateValues();
      this._promptCountUpdate(() => this._endRound(dt === 21 ? 'push' : 'blackjack'));
    } else {
      this.phase = 'player';
      this._showPhase('play');
      this._el.doubleBtn.disabled = this.chips < this.bet;
    }
  }

  _hit() {
    if (this.phase !== 'player') return;
    this._dealTo(this.playerHand, false);
    this._updateValues();
    if (handTotal(this.playerHand) > 21) {
      this._revealDealer();
      this._promptCountUpdate(() => this._endRound('bust'));
    }
    this._el.doubleBtn.disabled = true; // can't double after hit
  }

  _stand() {
    if (this.phase !== 'player') return;
    this.phase = 'dealer';
    this._showPhase('none');
    this._revealDealer();
    setTimeout(() => this._runDealer(), 400);
  }

  _double() {
    if (this.phase !== 'player' || this.chips < this.bet) return;
    this.chips -= this.bet;
    this.bet   *= 2;
    this._updateChipsDisplay();
    this._dealTo(this.playerHand, false);
    this._updateValues();
    if (handTotal(this.playerHand) > 21) {
      this._revealDealer();
      this._promptCountUpdate(() => this._endRound('bust'));
    } else {
      this.phase = 'dealer';
      this._showPhase('none');
      this._revealDealer();
      setTimeout(() => this._runDealer(), 400);
    }
  }

  _revealDealer() {
    this.dealerHand.forEach(c => {
      if (c.faceDown) { this._actualCount += c.value; delete c.faceDown; }
    });
    this._renderHands();
    this._updateValues();
  }

  _runDealer() {
    const total = handTotal(this.dealerHand);
    const shouldHit = total < 17 || (total === 17 && isSoftTotal(this.dealerHand));
    if (shouldHit) {
      this._dealTo(this.dealerHand, false);
      this._updateValues();
      setTimeout(() => this._runDealer(), 550);
    } else {
      // Dealer is done — give player a moment to update their count, then resolve
      this._promptCountUpdate(() => this._resolveRound());
    }
  }

  _resolveRound() {
    const p = handTotal(this.playerHand);
    const d = handTotal(this.dealerHand);
    if      (d > 21)  this._endRound('dealer-bust');
    else if (p > d)   this._endRound('win');
    else if (d > p)   this._endRound('lose');
    else              this._endRound('push');
  }

  _endRound(outcome) {
    // Check count accuracy
    const userCount   = parseInt(this._el.countInput.value, 10) || 0;
    const actualCount = this._actualCount;
    this.countChecks.total++;
    const countOk = userCount === actualCount;
    if (countOk) this.countChecks.correct++;

    const s = n => (n >= 0 ? '+' : '') + n;
    this._el.countCheck.innerHTML =
      `My count: <span class="ck-${countOk ? 'correct' : 'wrong'}">${s(userCount)}</span>` +
      ` · Actual: <span class="ck-correct">${s(actualCount)}</span>` +
      (countOk ? ' ✓' : ` · Off by ${Math.abs(userCount - actualCount)}`);

    const acc = this.countChecks.total
      ? `${Math.round(this.countChecks.correct / this.countChecks.total * 100)}%` : '—';
    this._el.countGrade.textContent = acc;
    this._el.countGrade.className   = `bj-count-grade ${countOk ? 'good' : 'bad'}`;

    let payout = 0, bannerText = '', bannerClass = '';
    switch (outcome) {
      case 'blackjack':    payout = Math.floor(this.bet * 2.5); bannerText = '♠ Blackjack! 3:2'; bannerClass = 'blackjack'; this.wins++;   Audio.win();   break;
      case 'bust':         payout = 0;                          bannerText = 'Bust';              bannerClass = 'lose';      this.losses++; Audio.lose();  break;
      case 'dealer-bust':  payout = this.bet * 2;               bannerText = 'Dealer Bust — Win'; bannerClass = 'win';       this.wins++;   Audio.win();   break;
      case 'win':          payout = this.bet * 2;               bannerText = 'You Win!';          bannerClass = 'win';       this.wins++;   Audio.win();   break;
      case 'lose':         payout = 0;                          bannerText = 'Dealer Wins';       bannerClass = 'lose';      this.losses++; Audio.lose();  break;
      case 'push':         payout = this.bet;                   bannerText = 'Push';              bannerClass = 'push';      this.pushes++; Audio.chips(); break;
    }

    this.chips += payout;
    this._updateChipsDisplay();
    this._showResultBanner(bannerText, bannerClass);
    this._showPhase('result');
    this._updateStats();
  }

  // Show "update your count" hint for 1.8s then call callback.
  // Count input stays fully editable throughout.
  _promptCountUpdate(callback) {
    this._el.countGrade.textContent = '← update now';
    this._el.countGrade.className   = 'bj-count-grade';
    this._el.countInput.focus();
    setTimeout(() => {
      this._el.countGrade.textContent = '';
      callback();
    }, 1800);
  }

  _nextHand() {
    if (this.chips <= 0) {
      this.chips = 100; // rebuy
    }
    this.bet = 0;
    this._el.betDisplay.textContent = '$0';
    this._el.dealBtn.disabled = true;
    this._el.countGrade.textContent = '';
    this._el.resultBanner.className = 'bj-result-banner hidden';
    this.playerHand = []; this.dealerHand = [];
    this._renderHands(); this._updateValues();
    this._updateChipsDisplay();

    // Carry the correct running count forward into the next hand
    // so the player starts from an accurate baseline
    this._el.countInput.value = String(this._actualCount);

    this.phase = 'bet';
    this._showPhase('bet');
  }

  _showPhase(name) {
    ['bet','play','result'].forEach(p => {
      document.getElementById(`bj-phase-${p}`).classList.toggle('hidden', p !== name);
    });
  }

  _showResultBanner(text, cls) {
    const el = this._el.resultBanner;
    el.textContent = text;
    el.className   = `bj-result-banner ${cls}`;
  }

  _renderHands() {
    const render = (hand, container) => {
      // Only re-render if hand changed (avoid redundant work)
      const existing = container.querySelectorAll('.playing-card');
      hand.forEach((card, i) => {
        if (i < existing.length) {
          // Update existing card if faceDown state changed
          const el = existing[i];
          const wasFaceDown = el.classList.contains('face-down');
          if (wasFaceDown !== !!card.faceDown) renderCard(card, el, true);
        } else {
          const el = document.createElement('div');
          el.className = 'playing-card';
          container.appendChild(el);
          renderCard(card, el, true);
        }
      });
      // Remove extra cards
      while (container.children.length > hand.length) container.removeChild(container.lastChild);
    };
    render(this.dealerHand, this._el.dealerHand);
    render(this.playerHand, this._el.playerHand);
  }

  _updateValues() {
    const pv = handTotal(this.playerHand);
    const dv = handTotal(this.dealerHand);
    this._el.playerVal.textContent = this.playerHand.length ? pv : '';
    this._el.dealerVal.textContent = this.dealerHand.length ? (dv || '?') : '';
  }

  _updateChipsDisplay() {
    this._el.chips.textContent = `$${this.chips}`;
  }

  _updateShoeBar() {
    const { numDecks, penetration } = settings;
    this._el.deckInfo.textContent = `${numDecks} deck${numDecks > 1 ? 's' : ''} · ${Math.round(penetration * 100)}% penetration`;
    if (!this.deck) { this._el.shoeInfo.textContent = 'Place a bet to begin'; this._el.progress.style.width = '0%'; return; }
    this._el.shoeInfo.textContent = `${this.deck.remaining} / ${this.deck.total} cards`;
    this._el.progress.style.width = `${Math.min(100, this.deck.progress * 100).toFixed(1)}%`;
  }

  _updateStats() {
    this._el.statWins.textContent   = this.wins;
    this._el.statLosses.textContent = this.losses;
    this._el.statChips.textContent  = `$${this.chips}`;
    this._el.statCount.textContent  = this.countChecks.total
      ? `${Math.round(this.countChecks.correct / this.countChecks.total * 100)}%` : '—';
  }

  refreshShoeBar() { this._updateShoeBar(); }
}

// ── Learn Content ────────────────────────────────────────────────────────────

function buildLearnContent() {
  const mini = (ranks, cls) => ranks.map(r => `<span class="mini-card ${cls}">${r}</span>`).join('');
  return `<div class="learn-page">
    <h2>Hi-Lo Card Counting</h2>
    <p class="lead">Card counting tracks the shoe composition to determine when you have a statistical edge. Hi-Lo is the most widely-used system — balanced, powerful, and practical.</p>
    <section class="learn-section">
      <h3>Card Values</h3>
      <div class="hilo-table">
        <div class="hilo-row positive">
          <div class="hilo-value">+1</div>
          <div class="hilo-cards">${mini(['2','3','4','5','6'],'black')}</div>
          <div class="hilo-desc">Low cards — unfavorable for player</div>
        </div>
        <div class="hilo-row neutral">
          <div class="hilo-value">0</div>
          <div class="hilo-cards">${mini(['7','8','9'],'black')}</div>
          <div class="hilo-desc">Neutral — ignore these</div>
        </div>
        <div class="hilo-row negative">
          <div class="hilo-value">−1</div>
          <div class="hilo-cards">${mini(['10','J','Q','K'],'black')}${mini(['A'],'red')}</div>
          <div class="hilo-desc">High cards — favorable for player</div>
        </div>
      </div>
    </section>
    <section class="learn-section">
      <h3>Running Count</h3>
      <p>Start at <strong>0</strong> when the shoe is shuffled. Add or subtract each card's Hi-Lo value as it is dealt.</p>
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
      <p>The true count normalizes the running count for deck depth:</p>
      <div class="formula-block">True Count = Running Count ÷ Decks Remaining</div>
      <p><strong>Example:</strong> Running +6 with 2 decks left → True Count = <strong>+3</strong></p>
    </section>
    <section class="learn-section">
      <h3>Why It Works</h3>
      <p>High cards favor the player because:</p>
      <ul>
        <li><strong>Natural blackjacks</strong> pay 3:2 to you, even money to the dealer.</li>
        <li><strong>Dealer bust rate rises</strong> — the dealer must hit to 17 and busts more with tens.</li>
        <li><strong>Doubles and splits pay more</strong> when tens are likely to follow.</li>
      </ul>
    </section>
    <section class="learn-section">
      <h3>Betting Ramp (True Count)</h3>
      <div class="bet-table">
        <div class="bt-row header"><span>True Count</span><span>Edge</span><span>Bet</span></div>
        <div class="bt-row negative-bg"><span>≤ 0</span><span>House ~0.5%</span><span>Minimum</span></div>
        <div class="bt-row neutral-bg"><span>+1</span><span>Break-even</span><span>1× base</span></div>
        <div class="bt-row low-positive-bg"><span>+2</span><span>Player +0.5%</span><span>2× base</span></div>
        <div class="bt-row medium-positive-bg"><span>+3–4</span><span>Player +1–1.5%</span><span>4× base</span></div>
        <div class="bt-row high-positive-bg"><span>+5+</span><span>Player +2%+</span><span>Max bet</span></div>
      </div>
    </section>
  </div>`;
}

// ── Stats View ───────────────────────────────────────────────────────────────

function renderStatsView() {
  const { allTime, sessions } = statsManager.data;
  const acc = allTime.total ? `${Math.round(allTime.correct / allTime.total * 100)}%` : '—';
  const el  = document.getElementById('stats-content');
  el.innerHTML = `
    <h2>Your Statistics</h2>
    <div class="stats-overview">
      <div class="stat-card"><div class="stat-big">${acc}</div><div class="stat-desc">All-Time Accuracy</div></div>
      <div class="stat-card"><div class="stat-big">${allTime.total.toLocaleString()}</div><div class="stat-desc">Cards Tracked</div></div>
      <div class="stat-card"><div class="stat-big">${allTime.bestStreak}</div><div class="stat-desc">Best Streak</div></div>
      <div class="stat-card"><div class="stat-big">${sessions.length}</div><div class="stat-desc">Sessions</div></div>
    </div>
    <div class="sessions-section">
      <h3>Recent Sessions</h3>
      ${sessions.length === 0
        ? '<p class="muted">No sessions yet — start practicing!</p>'
        : `<div class="sessions-list">
            <div class="session-row header"><span>Mode</span><span>Date</span><span>Accuracy</span><span>Cards</span><span>Best Streak</span></div>
            ${sessions.slice(0, 30).map(s => {
              const a    = s.total ? `${Math.round(s.correct / s.total * 100)}%` : '—';
              const good = s.total && s.correct / s.total >= 0.9;
              const d    = new Date(s.date).toLocaleDateString(undefined, { month:'short', day:'numeric' });
              return `<div class="session-row"><span class="mode-badge">${s.mode}</span><span>${d}</span><span class="acc-val${good?' good':''}">${a}</span><span>${s.total}</span><span>${s.bestStreak}</span></div>`;
            }).join('')}
          </div>`}
    </div>
    ${sessions.length ? '<button class="danger-btn" id="clearStatsBtn">Clear All Statistics</button>' : ''}`;
  document.getElementById('clearStatsBtn')?.addEventListener('click', () => {
    if (confirm('Clear all statistics? This cannot be undone.')) { statsManager.clear(); renderStatsView(); }
  });
}

// ── How-to-Play ──────────────────────────────────────────────────────────────

const HOW_TO_PLAY = {
  flashcard: {
    title: 'Flashcard Drill',
    html: `<p>Cards are dealt one at a time. Your job is to keep an accurate <strong>running count</strong> using Hi-Lo.</p>
      <ol>
        <li>Click <strong>Start</strong> to shuffle a fresh shoe.</li>
        <li>A card appears. Mentally update your running count:
          <div class="hilo-quick">
            <div class="hilo-quick-row"><span class="hilo-val pos">+1</span><span class="hilo-ranks">2 · 3 · 4 · 5 · 6</span></div>
            <div class="hilo-quick-row"><span class="hilo-val neu">0</span><span class="hilo-ranks">7 · 8 · 9</span></div>
            <div class="hilo-quick-row"><span class="hilo-val neg">−1</span><span class="hilo-ranks">10 · J · Q · K · A</span></div>
          </div>
        </li>
        <li>Enter your total running count and press <strong>Submit</strong> or <kbd>Enter</kbd>.</li>
        <li>When the shoe hits the cut card it reshuffles and resets to 0.</li>
      </ol>`,
  },
  speed: {
    title: 'Speed Round',
    html: `<p>Same as Flashcard Drill but against a countdown timer. The goal is maximum <strong>accuracy at speed</strong>.</p>
      <ol>
        <li>Set your time limit in <strong>Settings</strong> (30 s – 2 min).</li>
        <li>Click <strong>Start</strong> — the timer begins immediately.</li>
        <li>Answer as many cards as possible before time runs out.</li>
        <li>Your <strong>Cards/min</strong> rate is shown as you play.</li>
      </ol>
      <p>The timer turns red in the last 10 seconds. When it hits zero the session ends automatically.</p>`,
  },
  multi: {
    title: 'Multi-Card',
    html: `<p>Multiple cards are revealed at once. You must track the net running count across the whole group.</p>
      <ol>
        <li>Set <strong>Cards per Group</strong> (3–5) in Settings.</li>
        <li>Click <strong>Start</strong>. A group of cards appears simultaneously.</li>
        <li>Add up the Hi-Lo values of all cards in the group and enter the new <strong>running count</strong>.</li>
        <li>Submit to confirm and see the next group.</li>
      </ol>
      <p>This mode trains the real-table skill of counting multiple cards at a glance rather than one at a time.</p>`,
  },
  blackjack: {
    title: 'Blackjack Practice',
    html: `<p>A full game of blackjack with a hidden count tracker. Play normally and try to keep an accurate running count throughout.</p>
      <ol>
        <li>Click chip buttons to place your bet, then hit <strong>Deal</strong>.</li>
        <li>Play the hand using <strong>Hit</strong>, <strong>Stand</strong>, or <strong>Double</strong>.</li>
        <li>Update the <em>My count</em> field as each card is dealt.</li>
        <li>At the end of each hand the app reveals the actual running count and grades your accuracy.</li>
      </ol>
      <p><strong>Rules:</strong> Dealer hits soft 17 · Blackjack pays 3:2 · Double down on any two cards.</p>`,
  },
};

let _modalMode = null;

function showHowToPlay(mode) {
  const c = HOW_TO_PLAY[mode];
  if (!c) return;
  _modalMode = mode;
  document.getElementById('modal-title').textContent = c.title;
  document.getElementById('modal-body').innerHTML    = c.html;
  const ov = document.getElementById('modal-overlay');
  ov.classList.add('active'); ov.removeAttribute('aria-hidden');
  document.getElementById('closeModal').focus();
}

function closeModal() {
  const ov = document.getElementById('modal-overlay');
  ov.classList.remove('active'); ov.setAttribute('aria-hidden', 'true');
  _modalMode = null;
}

// ── App Bootstrap ────────────────────────────────────────────────────────────

let statsManager, flashcardDrill, speedRound, multiCardDrill, blackjackGame;
let currentMode = 'flashcard';

function initApp() {
  loadSettings();
  statsManager   = new StatsManager();
  flashcardDrill = new FlashcardDrill();
  speedRound     = new SpeedRound();
  multiCardDrill = new MultiCardDrill();
  blackjackGame  = new BlackjackGame();

  document.getElementById('learn-content').innerHTML = buildLearnContent();

  // ── Global button-click sound ────────────────────────────────────────────
  document.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    // chip-btn and count-adj play their own sounds or are too frequent
    if (btn.classList.contains('chip-btn'))      return;
    if (btn.classList.contains('count-adj-btn')) return;
    Audio.click();
  }, true);

  // ── Navigation ───────────────────────────────────────────────────────────
  document.querySelectorAll('.nav-btn').forEach(btn =>
    btn.addEventListener('click', () => switchMode(btn.dataset.mode)));

  // ── Settings Panel ───────────────────────────────────────────────────────
  const panel   = document.getElementById('settingsPanel');
  const overlay = document.getElementById('overlay');

  document.getElementById('settingsBtn').addEventListener('click', () => {
    panel.classList.add('open'); panel.removeAttribute('aria-hidden');
    overlay.classList.add('active');
  });

  function closeSettings() {
    panel.classList.remove('open'); panel.setAttribute('aria-hidden','true');
    overlay.classList.remove('active');
  }
  document.getElementById('closeSettings').addEventListener('click', closeSettings);
  overlay.addEventListener('click', closeSettings);

  // Deck count
  document.querySelectorAll('#deckCountGroup .opt-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      document.querySelectorAll('#deckCountGroup .opt-btn').forEach(b => b.classList.toggle('active', b === btn));
      settings.numDecks = parseInt(btn.dataset.value);
      saveSettings();
      [flashcardDrill, speedRound, multiCardDrill, blackjackGame].forEach(m => m.refreshShoeBar());
    }));

  // Penetration
  const slider = document.getElementById('penetrationSlider');
  const pctEl  = document.getElementById('penetrationDisplay');
  slider.value = Math.round(settings.penetration * 100);
  pctEl.textContent = slider.value + '%';
  slider.addEventListener('input', () => {
    settings.penetration = parseInt(slider.value) / 100;
    pctEl.textContent = slider.value + '%';
    saveSettings();
    [flashcardDrill, speedRound, multiCardDrill, blackjackGame].forEach(m => m.refreshShoeBar());
  });

  // Time limit
  document.querySelectorAll('#timeLimitGroup .opt-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      document.querySelectorAll('#timeLimitGroup .opt-btn').forEach(b => b.classList.toggle('active', b === btn));
      settings.timeLimit = parseInt(btn.dataset.value);
      saveSettings();
    }));

  // Cards per group
  document.querySelectorAll('#cardsPerGroupGroup .opt-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      document.querySelectorAll('#cardsPerGroupGroup .opt-btn').forEach(b => b.classList.toggle('active', b === btn));
      settings.cardsPerGroup = parseInt(btn.dataset.value);
      saveSettings();
    }));

  // ── Dark mode ────────────────────────────────────────────────────────────
  const darkBtn = document.getElementById('darkModeBtn');
  if (localStorage.getItem('cc_darkmode') === 'false') {
    document.body.classList.add('light-mode'); darkBtn.textContent = '🌙';
  }
  darkBtn.addEventListener('click', () => {
    const light = document.body.classList.toggle('light-mode');
    darkBtn.textContent = light ? '🌙' : '☀';
    localStorage.setItem('cc_darkmode', String(!light));
  });

  // ── Modal ────────────────────────────────────────────────────────────────
  document.getElementById('closeModal')   .addEventListener('click', closeModal);
  document.getElementById('modal-dismiss').addEventListener('click', closeModal);
  document.getElementById('modal-start')  .addEventListener('click', () => {
    closeModal();
    const map = { flashcard: flashcardDrill, speed: speedRound, multi: multiCardDrill };
    map[_modalMode]?.start();
  });
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target.id === 'modal-overlay') closeModal();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  document.querySelectorAll('.help-btn').forEach(btn =>
    btn.addEventListener('click', () => showHowToPlay(btn.dataset.mode)));

  syncSettingsUI();
}

function switchMode(mode) {
  if (mode === currentMode) return;
  currentMode = mode;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  document.querySelectorAll('.mode-section').forEach(s => s.classList.remove('active'));
  document.getElementById(`${mode}-mode`)?.classList.add('active');
  if (mode === 'stats') renderStatsView();
}

function syncSettingsUI() {
  document.querySelectorAll('#deckCountGroup    .opt-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.value) === settings.numDecks));
  document.querySelectorAll('#timeLimitGroup    .opt-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.value) === settings.timeLimit));
  document.querySelectorAll('#cardsPerGroupGroup .opt-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.value) === settings.cardsPerGroup));
  const pct = Math.round(settings.penetration * 100);
  document.getElementById('penetrationSlider').value = pct;
  document.getElementById('penetrationDisplay').textContent = pct + '%';
}

document.addEventListener('DOMContentLoaded', initApp);
