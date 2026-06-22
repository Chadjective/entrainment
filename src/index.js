// ============================================================================
// ENTRAINMENT — entry point / orchestrator.
// Owns the game-state machine (System 14), the death sequence (System 11),
// camera follow (System 4), scoring, and the performance-reactive mix
// (System 15). All subsystems are driven from the single animate() loop.
// ============================================================================

import * as THREE from 'three';
import { createScene } from './game/scene.js';
import { Grid } from './game/grid.js';
import { Ship } from './game/ship.js';
import { EntityManager } from './game/entities.js';
import { BulletManager } from './game/bullets.js';
import { Effects } from './game/effects.js';
import { checkShip } from './game/collision.js';
import { AudioEngine } from './audio/engine.js';
import { UI, loadHighScore, saveHighScore } from './ui/ui.js';
import { Input } from './input/input.js';
import { sectionAt } from './data/loader.js';
import { SPEED, SCORE, MIX, SCENE } from './core/config.js';

const STATE = { LOADING: 'LOADING', MENU: 'MENU', COUNTDOWN: 'COUNTDOWN', PLAYING: 'PLAYING', DEAD: 'DEAD', REWARD: 'REWARD' };

class Game {
  constructor() {
    const container = document.getElementById('app');
    const { scene, camera, renderer, lights } = createScene(container);
    this.scene = scene; this.camera = camera; this.renderer = renderer; this.lights = lights;

    this.grid = new Grid(scene);
    this.ship = new Ship(scene);
    this.entities = new EntityManager(scene);
    this.bullets = new BulletManager(scene);
    this.effects = new Effects({ scene, grid: this.grid, ship: this.ship, lights });
    this.audio = new AudioEngine();
    this.ui = new UI();
    this.input = new Input(renderer.domElement, { onPause: () => this.togglePause() });

    this.clock = new THREE.Clock();
    this.state = STATE.LOADING;
    this.paused = false;
    this.time = 0; // wall-clock seconds for animation phases
    this.highScore = loadHighScore();

    this._resetStats();
    this.ui.bind({
      onLaunch: () => this.onLaunch(),
      onReenter: () => this.reset(true),
      onResume: () => this.togglePause(),
      onQuit: () => this.quitToMenu(),
      onPlayAgain: () => this.reset(false),
      onShare: () => this.ui.copyShare(this.stats.score),
      onPause: () => this.togglePause(),
    });
  }

  _resetStats() {
    this.stats = { score: 0, kills: 0, streak: 1.0, bestStreak: 1.0, nearMisses: 0 };
    this.survivalTime = 0;
    this.killGain = 0;
    this.survivalApplied = -1;
    this.prevSection = null;
    this.cursor = 0;
    this.hudTimer = 0;
    this.deathTimer = 0;
    this.deathTextShown = false;
    this.reenterShown = false;
    this.deathEndDelay = 0;
  }

  async init() {
    this.ui.setLoading(0);
    this.map = await this.audio.load((p) => this.ui.setLoading(p));
    this.effects.setMap(this.map);
    this.grid.tempo = this.map.tempo || 110;
    this.state = STATE.MENU;
    this.ship.setVisible(false);
    this.ui.showMenu();
    this.clock.start();
    this.animate();
  }

  // ---- transitions -------------------------------------------------------
  onLaunch() {
    // resume the context inside this gesture, but never await it — a blocked
    // resume must not stall the countdown.
    this.audio.unlock();
    this.startCountdown();
  }

  startCountdown() {
    this.state = STATE.COUNTDOWN;
    this.countdownT = 0;
    this.countdownStep = -1;
    this.ship.setVisible(true);
    this.ship.reset();
    this.camera.position.set(...SCENE.camPos);
    this.ui.showCountdown();
  }

  async startPlaying() {
    this.state = STATE.PLAYING;
    this.ui.showHud();
    await this.audio.start();
  }

  die(entity) {
    this.state = STATE.DEAD;
    this.ship.setVisible(false);
    this.entities.deathBurst(this.ship.position);
    this.audio.triggerDeath();
    this.deathTimer = 0;
    this.deathTextShown = false;
    this.reenterShown = false;
    this.deathEndDelay = 0;
    this.deathCamStart = this.camera.position.clone();
    this.ui.showDeath();
    // commit best streak
    this.stats.streak = 1.0;
    this.ui.updateHud(this.stats.score, this.stats.kills, this.stats.streak);
  }

  gotoReward() {
    this.state = STATE.REWARD;
    const isHigh = this.stats.score > (this.highScore.score || 0);
    if (isHigh) { this.highScore = { score: this.stats.score, kills: this.stats.kills }; saveHighScore(this.stats.score, this.stats.kills); }
    this.ui.showReward({ ...this.stats, isHighScore: isHigh });
  }

  async reset(fromDeath) {
    // full reset (System 14 reset procedure)
    this.entities.reset();
    this.bullets.reset();
    this.grid.reset();
    this.effects.reset();
    this.ship.reset();
    this.ship.setVisible(true);
    this.camera.position.set(...SCENE.camPos);
    this.lights.point.position.set(0, 3, 1);
    await this.audio.reset();
    this._resetStats();
    this.startCountdown();
  }

  quitToMenu() {
    this.paused = false;
    this.ui.hidePause();
    this.audio.reset();
    this.entities.reset();
    this.bullets.reset();
    this.grid.reset();
    this.effects.reset();
    this._resetStats();
    this.state = STATE.MENU;
    this.ship.setVisible(false);
    this.ui.showMenu();
  }

  async togglePause() {
    if (this.state !== STATE.PLAYING) return;
    this.paused = !this.paused;
    if (this.paused) { await this.audio.pause(); this.ui.showPause(); }
    else { await this.audio.resume(); this.ui.hidePause(); }
  }

  // ---- main loop ---------------------------------------------------------
  animate() {
    requestAnimationFrame(() => this.animate());
    const delta = Math.min(this.clock.getDelta(), 0.05);
    this.time += delta;

    switch (this.state) {
      case STATE.MENU: this.updateMenu(delta); break;
      case STATE.COUNTDOWN: this.updateCountdown(delta); break;
      case STATE.PLAYING: if (!this.paused) this.updatePlaying(delta); break;
      case STATE.DEAD: this.updateDeath(delta); break;
      default: break;
    }
    this.renderer.render(this.scene, this.camera);
  }

  updateMenu(delta) {
    this.grid.update(delta, SPEED.base * 0.4);
    this.camera.position.x = Math.sin(this.time * 0.2) * 1.5;
    this.camera.position.y = 3.5 + Math.sin(this.time * 0.15) * 0.4;
    this.camera.lookAt(0, 1.0, -20);
  }

  updateCountdown(delta) {
    this.grid.update(delta, SPEED.base * 0.5);
    this.ship.update(delta, 0, this.time);
    this.camera.position.x += (0 - this.camera.position.x) * 3 * delta;
    this.camera.lookAt(0, 1.0, -20);

    const steps = ['3', '2', '1', 'GO'];
    const durations = [0.8, 0.8, 0.8, 0.4];
    let acc = 0; let idx = steps.length;
    for (let i = 0; i < steps.length; i++) { if (this.countdownT < acc + durations[i]) { idx = i; break; } acc += durations[i]; }
    this.countdownT += delta;
    if (idx !== this.countdownStep && idx < steps.length) {
      this.countdownStep = idx;
      this.ui.setCountdown(steps[idx]);
      if (steps[idx] === 'GO') this.startPlaying();
    } else if (idx >= steps.length) {
      this.ui.setCountdown('');
    }
  }

  updatePlaying(delta) {
    const songTime = this.audio.songTime;

    // section / speed (System 15.3 kill-gain reset at boundaries)
    const sect = sectionAt(this.map.sections, songTime);
    if (this.prevSection && sect.name !== this.prevSection) {
      this.killGain = 0;
      this.audio.setKillGain(0);
    }
    this.prevSection = sect.name;
    const gameSpeed = SPEED.base * sect.speed;

    // input + ship
    this.ship.update(delta, this.input.getSteer(), this.time);
    if (this.input.isFiring()) this.bullets.fire(this.time, this.ship.position);

    // spawn from event map (advance cursor)
    const ev = this.map.events;
    while (this.cursor < ev.length && ev[this.cursor].time <= songTime) {
      const e = ev[this.cursor++];
      if (e.type === 'obstacle' || e.type === 'enemy') this.entities.spawn(e);
      else if (e.type === 'effect') this.effects.trigger(e);
    }

    // move world
    this.entities.update(delta, gameSpeed, this.time, this.ship.x);
    this.bullets.update(delta, this.entities, (enemy) => this.onKill(enemy));

    // collisions
    const { hit, nearMiss } = checkShip(this.ship.hitbox(), this.entities.entities);
    if (nearMiss > 0) {
      for (let i = 0; i < nearMiss; i++) this.onNearMiss();
    }
    if (hit) { this.die(hit); return; }

    // music-reactive visuals + reward mix
    this.effects.update(delta, songTime);
    this.updateRewardMix(delta);

    // camera follow (System 4)
    this.camera.position.x += (this.ship.x * 0.3 - this.camera.position.x) * 3 * delta;
    this.camera.lookAt(this.ship.x * 0.5, 1.0, -20);
    this.lights.point.position.set(this.ship.x, 3, 1);
    this.effects.applyShake(this.camera);

    // grid
    this.grid.update(delta, gameSpeed);

    // hud (throttled ~120ms)
    this.hudTimer += delta;
    if (this.hudTimer >= 0.12) {
      this.hudTimer = 0;
      this.ui.updateHud(this.stats.score, this.stats.kills, this.stats.streak);
    }

    // end of song while alive
    if (this.audio.isEnded()) this.gotoReward();
  }

  updateRewardMix(delta) {
    // survival stem climbs continuously
    this.survivalTime += delta;
    const survival = Math.min(1, this.survivalTime * MIX.survivalGainPerSec);
    if (Math.abs(survival - this.survivalApplied) > 0.02) {
      this.survivalApplied = survival;
      this.audio.setSurvivalGain(survival);
    }
  }

  onKill(enemy) {
    this.stats.kills++;
    this.stats.streak = Math.min(8, this.stats.streak + 0.2);
    this.stats.bestStreak = Math.max(this.stats.bestStreak, this.stats.streak);
    this.stats.score += Math.round(SCORE.kill * this.stats.streak);
    // kill reward stem (System 15.2)
    this.killGain = Math.min(1, this.killGain + MIX.killGainPerKill);
    this.audio.setKillGain(this.killGain);
  }

  onNearMiss() {
    this.stats.nearMisses++;
    this.stats.streak = Math.min(8, this.stats.streak + 0.1);
    this.stats.bestStreak = Math.max(this.stats.bestStreak, this.stats.streak);
    this.stats.score += Math.round(SCORE.nearMiss * this.stats.streak);
    this.ui.flashHud();
  }

  // System 11 — death sequence
  updateDeath(delta) {
    this.deathTimer += delta;

    // camera lifts + drifts
    this.camera.position.y += 1.5 * delta;
    this.camera.position.z -= 0.3 * delta;
    this.camera.lookAt(this.ship.x * 0.3, this.camera.position.y - 3, this.camera.position.z - 30);

    // world keeps drifting, no new spawns
    this.grid.update(delta, 0.05);
    this.entities.drift(delta, 0.03);

    if (!this.deathTextShown && this.deathTimer >= 1.0) { this.ui.showDeathText(); this.deathTextShown = true; }

    const songEnded = this.audio.isEnded();
    if (songEnded) {
      this.deathEndDelay += delta;
      if (this.deathEndDelay >= 2.0) { this.gotoReward(); return; }
    }
    if (!this.reenterShown && this.deathTimer >= 20.0) { this.ui.showReenter(); this.reenterShown = true; }
  }
}

// ---- boot ----
const game = new Game();
game.init();
window.__ENTRAINMENT__ = game; // debug handle
