// ============================================================================
// System 12 — UI screens: loading, menu, countdown, HUD, death, pause, reward.
// Pure DOM over the Three.js canvas. The orchestrator drives state; this module
// just shows/hides and formats.
// ============================================================================

import { LINKS, HIGH_SCORE_KEY } from '../core/config.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.floor(n).toLocaleString('en-US');

export class UI {
  constructor() {
    this.overlays = {
      loading: $('loading'), menu: $('menu'), death: $('death'),
      pause: $('pause'), reward: $('reward'),
    };
    this.countdownEl = $('countdown');
    this.hud = $('hud');
    this.pauseBtn = $('pause-btn');
    this._lastHud = -1;
  }

  bind(h) {
    $('launch-btn').onclick = h.onLaunch;
    $('reenter-btn').onclick = h.onReenter;
    $('resume-btn').onclick = h.onResume;
    $('quit-btn').onclick = h.onQuit;
    $('playagain-btn').onclick = h.onPlayAgain;
    $('download-btn').onclick = () => window.open(LINKS.album, '_blank');
    $('share-btn').onclick = h.onShare;
    this.pauseBtn.onclick = h.onPause;
  }

  _hideAll() {
    Object.values(this.overlays).forEach((o) => o.classList.add('hidden'));
  }

  // ---- loading ----
  setLoading(pct) {
    const p = Math.round(pct * 100);
    $('loading-pct').textContent = `${p}%`;
    $('loading-bar-fill').style.width = `${p}%`;
  }

  showMenu() { this._hideAll(); this.overlays.menu.classList.remove('hidden'); this.hud.classList.remove('show'); this.pauseBtn.classList.remove('show'); }

  // ---- countdown ----
  showCountdown() { this._hideAll(); }
  setCountdown(text) {
    const el = this.countdownEl;
    el.textContent = text;
    el.style.opacity = text ? '1' : '0';
    // retrigger shrink-in animation
    el.classList.remove('countdown-anim');
    void el.offsetWidth;
    if (text) el.classList.add('countdown-anim');
  }

  // ---- gameplay ----
  showHud() {
    this._hideAll();
    this.setCountdown('');
    this.hud.classList.add('show');
    this.pauseBtn.classList.add('show');
  }

  updateHud(score, kills, streak) {
    $('hud-score-value').textContent = fmt(score);
    $('hud-kills-value').textContent = fmt(kills);
    const s = $('hud-streak');
    if (streak > 1.0001) {
      s.textContent = `×${streak.toFixed(1)}`;
      s.style.opacity = '1';
    } else {
      s.style.opacity = '0';
    }
  }

  flashHud() {
    const f = $('hud-flash');
    f.style.transition = 'none';
    f.style.opacity = '0.35';
    requestAnimationFrame(() => {
      f.style.transition = 'opacity 0.4s ease';
      f.style.opacity = '0';
    });
  }

  // ---- death ----
  showDeath() {
    this.overlays.death.classList.remove('hidden', 'dim');
    $('death-text').style.opacity = '0';
    $('reenter-btn').style.opacity = '0';
    $('reenter-btn').style.pointerEvents = 'none';
    this.pauseBtn.classList.remove('show');
  }
  showDeathText() { $('death-text').style.opacity = '0.7'; }
  showReenter() { $('reenter-btn').style.opacity = '1'; $('reenter-btn').style.pointerEvents = 'auto'; }

  // ---- pause ----
  showPause() { this.overlays.pause.classList.remove('hidden'); }
  hidePause() { this.overlays.pause.classList.add('hidden'); }

  // ---- reward ----
  showReward(stats) {
    this._hideAll();
    this.hud.classList.remove('show');
    this.pauseBtn.classList.remove('show');
    this.overlays.reward.classList.remove('hidden');
    $('reward-song').textContent = LINKS.songTitle;
    $('reward-score').textContent = fmt(stats.score);
    $('reward-newhigh').style.display = stats.isHighScore ? 'block' : 'none';
    $('reward-stats').innerHTML =
      `${stats.kills} DESTROYED<br>${stats.nearMisses} NEAR MISSES<br>BEST STREAK: ×${stats.bestStreak.toFixed(1)}`;
    this._shareScore = stats.score;
  }

  copyShare(score) {
    const text = `I scored ${fmt(score)} flying through ${LINKS.songTitle} in ENTRAINMENT 🚀 ${LINKS.shareUrl}`;
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).catch(() => {});
    const btn = $('share-btn');
    const orig = btn.textContent;
    btn.textContent = 'COPIED!';
    setTimeout(() => { btn.textContent = orig; }, 1400);
  }
}

// ---- high score persistence (System 12E) ----
export function loadHighScore() {
  try { return JSON.parse(localStorage.getItem(HIGH_SCORE_KEY)) || { score: 0, kills: 0 }; }
  catch (e) { return { score: 0, kills: 0 }; }
}
export function saveHighScore(score, kills) {
  try { localStorage.setItem(HIGH_SCORE_KEY, JSON.stringify({ score, kills, timestamp: new Date().toISOString() })); }
  catch (e) { /* ignore */ }
}
