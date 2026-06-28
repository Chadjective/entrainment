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
import { Post } from './game/post.js';
import { checkShip } from './game/collision.js';
import { Stillness, isStill } from './game/stillness.js';
import { AudioEngine } from './audio/engine.js';
import { UI, loadHighScore, saveHighScore } from './ui/ui.js';
import { Input } from './input/input.js';
import { sectionAt } from './data/loader.js';
import { SPEED, SCORE, MIX, SCENE, BLOOM, SHIELD, GRAZE, SHIP, ACCEL, GATE, STILLNESS } from './core/config.js';

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
    this.stillness = new Stillness(); // B2 — held-breath cover meter
    this.post = new Post(renderer, scene, camera);
    this.effects = new Effects({ scene, grid: this.grid, ship: this.ship, lights, post: this.post });
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
    this.stats = { score: 0, kills: 0, streak: 1.0, bestStreak: 1.0, nearMisses: 0, grazes: 0, bestChain: 0 };
    this.gateChain = 0; // Phase 3 — consecutive gates passed
    this.survivalTime = 0;
    this.killGain = 0;
    this.survivalApplied = -1;
    this.prevSection = null;
    this.cursor = 0;
    this.beatCursor = 0; // gameplay beat tracker (drone fire — Gameplay #3)
    this.hudTimer = 0;
    this.deathTimer = 0;
    this.deathTextShown = false;
    this.reenterShown = false;
    this.deathEndDelay = 0;
    // Gameplay #1 — shield
    this.shieldCharges = SHIELD.max;
    this.shieldRegen = 0;
    // Phase 2 — accel/brake speed channel (gates add into this.boost later)
    this.speedAmount = 0;
    this.boost = 0;
    // B2 — held-breath cover meter + budget
    this.stillness.reset();
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
    this.ship.setShield(this.shieldCharges);
    this.camera.position.set(...SCENE.camPos);
    this.ui.showCountdown();
  }

  async startPlaying() {
    this.state = STATE.PLAYING;
    this.ui.showHud();
    this.ui.setShield(this.shieldCharges, SHIELD.max);
    this.ui.setGraze(0);
    this.ui.setSpeed(1);
    this.ui.setGateChain(0);
    this.ui.setStillness(false, 0, false);
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
    this.ui.setGraze(0);
    this.stillness.reset(); this.ui.setStillness(false, 0, false); // B2 — drop cover + hide the breath HUD
    this.gateChain = 0; this.ui.setGateChain(0);
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
    this.lights.point.color.setHex(SCENE.pointColor);
    this.lights.point.intensity = SCENE.pointIntensity;
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
    if (this.paused) { await this.audio.pause(); this.ui.showPause(); this.ui.setStillness(false, 0, false); }
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
    this.post.render();
  }

  updateMenu(delta) {
    this.grid.update(delta, SPEED.base * 0.4);
    this.camera.position.x = Math.sin(this.time * 0.2) * 1.5;
    this.camera.position.y = 3.5 + Math.sin(this.time * 0.15) * 0.4;
    this.camera.lookAt(0, 1.0, -20);
    this.post.setStrength(BLOOM.strength);
  }

  updateCountdown(delta) {
    this.grid.update(delta, SPEED.base * 0.5);
    this.ship.update(delta, 0, 0, 0, this.time);
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

    // accel/brake (Shift/Z) — modulates ONLY the world-scroll speed. The spawn
    // cursor + song clock below stay on songTime (R1 invariant: speedAmount must
    // never reach spawn/song/beat). Gate boost (this.boost) is additive.
    const throttle = this.input.getThrottle();
    const rate = throttle !== 0 ? ACCEL.smoothIn : ACCEL.decay;
    this.speedAmount += (throttle - this.speedAmount) * rate * delta;
    this.speedAmount = Math.max(-1, Math.min(1, this.speedAmount));
    const gain = this.speedAmount >= 0 ? ACCEL.accelGain : ACCEL.brakeGain;
    const speedScale = Math.max(ACCEL.clampLo, Math.min(ACCEL.clampHi, 1 + this.speedAmount * gain + this.boost));
    const gameSpeed = SPEED.base * sect.speed * speedScale;
    // accel lunges the craft forward on screen (−Z), brake pulls it back; the
    // ship's real Z drives collision + gate passes, so accel = meet things sooner.
    this.ship.targetZ = this.speedAmount >= 0 ? -this.speedAmount * ACCEL.lungeFwd : -this.speedAmount * ACCEL.lungeBack;

    // input + ship (firing throws light — Phase A "play by the light you make")
    this.ship.update(delta, this.input.getSteer(), this.input.getVertical(), this.input.getRoll(), this.time);
    if (this.input.isFiring() && this.bullets.fire(this.time, this.ship.position)) this.effects.fireLevel = 1;

    // B2 — Stillness Is Cover. Calm section + neutral input + gone dark fills the
    // meter; past the latched threshold the player is UNSEEN. "Dark" leans on the
    // existing light economy (graze/fire/gate must decay to their floor). Computed
    // here so ctx.unseen can gate drone targeting in entities.update below; graze
    // is read one frame stale (effects.grazeLevel), negligible for a slow meter.
    const calm = sect.speed <= STILLNESS.calmSpeedMax;
    const still = isStill(calm, {
      firing: this.input.isFiring(),
      steer: this.input.getSteer(), vertical: this.input.getVertical(), roll: this.input.getRoll(),
      throttle: this.input.getThrottle(), invuln: this.ship.invuln,
      grazeLevel: this.effects.grazeLevel, fireLevel: this.effects.fireLevel, gateLevel: this.effects.gateLevel,
    });
    this.stillness.step(calm, still, delta);
    if (this.stillness.unseen) this.stats.score += this.stillness.scoreRate() * delta; // flat calm trickle

    // spawn from event map (advance cursor)
    const ev = this.map.events;
    while (this.cursor < ev.length && ev[this.cursor].time <= songTime) {
      const e = ev[this.cursor++];
      if (e.type === 'obstacle' || e.type === 'enemy' || e.type === 'entity') this.entities.spawn(e);
      else if (e.type === 'effect') this.effects.trigger(e);
    }

    // beat detection for gameplay (drone fire — Gameplay #3)
    let onBeat = false;
    const beats = this.map.beats;
    while (this.beatCursor < beats.length && beats[this.beatCursor] <= songTime) { onBeat = true; this.beatCursor++; }

    // move world
    this.entities.update(delta, gameSpeed, this.time, this.ship.x, { onBeat, shipInvuln: this.ship.invuln, playerY: this.ship.position.y, waterY: this.grid.water.position.y, unseen: this.stillness.unseen });
    this.bullets.update(delta, this.entities, (enemy) => this.onKill(enemy));

    // collisions + grazing (Gameplay #2)
    const { hit, nearMiss, grazeCount, grazeClose } = checkShip(this.ship.hitbox(), this.entities.entities);
    for (let i = 0; i < nearMiss; i++) this.onNearMiss();
    if (grazeCount > 0 && this.ship.invuln <= 0) { this.onGraze(grazeClose, delta); this.effects.grazeLevel = grazeClose; }
    else { this.ui.setGraze(0); this.effects.grazeLevel = 0; }

    // hit handling with shield + i-frames (Gameplay #1) — collision OR drone beam
    if (this.ship.invuln <= 0) {
      if (hit) {
        if (this.shieldCharges > 0) this.absorbHit(hit);
        else { this.die(hit); return; }
      } else if (this.entities.laserHit) {
        this.entities.laserHit = false;
        if (this.shieldCharges > 0) { this.absorbHit(null); this.effects.shakeAmp = 0.25; }
        else { this.die(null); return; }
      }
    }

    // gates (Phase 3) — fly-through passes + sequence chain; boost decays
    const gateRes = this.entities.checkGates(this.ship.x, this.ship.position.y, this.ship.position.z);
    for (let i = 0; i < gateRes.passed; i++) this.onGatePass();
    for (let i = 0; i < gateRes.missed; i++) this.onGateMiss();
    this.boost = Math.max(0, this.boost - GATE.boostDecay * delta);

    // shield regen after surviving a stretch without a hit (B2: unseen accelerates it)
    this.shieldRegen += delta * this.stillness.regenRate();
    if (this.shieldCharges < SHIELD.max && this.shieldRegen >= SHIELD.regenSec) {
      this.shieldRegen = 0;
      this.shieldCharges++;
      this.ship.setShield(this.shieldCharges);
      this.ui.setShield(this.shieldCharges, SHIELD.max);
    }

    // music-reactive visuals + reward mix
    this.effects.update(delta, songTime);
    this.updateRewardMix(delta);

    // camera follow (System 4) — laterally and gently vertically
    const shipY = this.ship.position.y;
    this.camera.position.x += (this.ship.x * 0.3 - this.camera.position.x) * 3 * delta;
    const camTargetY = SCENE.camPos[1] + (shipY - SHIP.startPos[1]) * 0.35;
    this.camera.position.y += (camTargetY - this.camera.position.y) * 3 * delta;
    this.camera.lookAt(this.ship.x * 0.5, shipY * 0.5 + 0.5, -20);
    this.lights.point.position.set(this.ship.x, Math.min(shipY + 1, 3.0), 1); // follow height, capped so flying up doesn't lift the light off ground hazards
    this.effects.applyShake(this.camera);

    // grid
    this.grid.update(delta, gameSpeed);

    // hud (throttled ~120ms)
    this.hudTimer += delta;
    if (this.hudTimer >= 0.12) {
      this.hudTimer = 0;
      this.ui.updateHud(this.stats.score, this.stats.kills, this.stats.streak);
      this.ui.setSpeed(speedScale);
      this.ui.setStillness(calm, this.stillness.meter, this.stillness.unseen);
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

  // accelerating amplifies score (risk reward); braking just forgoes the bonus
  _speedScore() { return 1 + Math.max(0, this.speedAmount) * ACCEL.scoreBonusAtMax; }

  onKill(enemy) {
    this.stats.kills++;
    this.stats.streak = Math.min(GRAZE.maxStreak, this.stats.streak + 0.2);
    this.stats.bestStreak = Math.max(this.stats.bestStreak, this.stats.streak);
    this.stats.score += Math.round(SCORE.kill * this.stats.streak * this._speedScore());
    // kill reward stem (System 15.2)
    this.killGain = Math.min(1, this.killGain + MIX.killGainPerKill);
    this.audio.setKillGain(this.killGain);
  }

  onNearMiss() {
    this.stats.nearMisses++;
    this.stats.streak = Math.min(GRAZE.maxStreak, this.stats.streak + 0.1);
    this.stats.bestStreak = Math.max(this.stats.bestStreak, this.stats.streak);
    this.stats.score += Math.round(SCORE.nearMiss * this.stats.streak);
    this.ui.flashHud();
  }

  // Phase 3 — gate chain (independent of the combat streak, R6)
  onGatePass() {
    this.gateChain++;
    this.stats.bestChain = Math.max(this.stats.bestChain, this.gateChain);
    this.stats.score += Math.round(GATE.points * this.gateChain * this._speedScore());
    this.boost = Math.min(GATE.boostMax, this.boost + GATE.boost); // into the shared speed channel
    this.effects.gateLevel = 1;
    this.ui.setGateChain(this.gateChain);
  }

  onGateMiss() {
    this.gateChain = 0;
    this.ui.setGateChain(0);
  }

  // Gameplay #2 — continuous grazing: closeness ramps the multiplier + score
  onGraze(close, delta) {
    this.stats.grazes++;
    this.stats.score += close * GRAZE.pointsPerSec * delta * this.stats.streak * this._speedScore();
    this.stats.streak = Math.min(GRAZE.maxStreak, this.stats.streak + close * GRAZE.streakPerSec * delta);
    this.stats.bestStreak = Math.max(this.stats.bestStreak, this.stats.streak);
    this.ui.setGraze(close);
  }

  // Gameplay #1 — shield absorbs a hit: spend a charge, i-frames, lose combo
  absorbHit(entity) {
    this.shieldCharges--;
    this.shieldRegen = 0;
    this.ship.setShield(this.shieldCharges);
    this.ship.flashShield();
    this.ship.startInvuln();
    this.ui.setShield(this.shieldCharges, SHIELD.max);
    this.ui.flashHud();
    this.stats.streak = 1.0; // taking a hit breaks the streak
    this.gateChain = 0; this.ui.setGateChain(0); // and the gate chain (R6)
    this.stillness.reset(); this.ui.setStillness(false, 0, false); // a hit blows your cover (B2)
    if (entity && entity.shootable) this.entities.destroy(entity); // clear it off the ship
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
