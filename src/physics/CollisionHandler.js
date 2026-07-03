// physics/CollisionHandler.js
// Ground contact physics — two regimes:
//   BOUNCING — Penner (2002) impact model
//   ROLLING  — Cross (2024) extended with terrain-following + surface friction
//
// Key fixes vs previous version:
//   1. groundY sampled AFTER position update (no one-step lag)
//   2. Correct slope physics: friction = mu * g * cos(θ), not mu * g
//   3. Speed clamped in rough/sand — prevents downhill runaway
//   4. Safety stop after 25 s of rolling (catches any edge cases)
//   5. _rollStartTime tracked from first entry into rolling phase

import CONSTANTS from '../constants.js';

// Surface type aliases for readability
const S = CONSTANTS;

class CollisionHandler {

  constructor() {
    this.slopeAngleDeg  = 0;
    this.terrain        = null;
    this._rollStartTime = 0;   // simulation time when rolling began
  }

  setSlope(angleDeg)    { this.slopeAngleDeg = angleDeg; }
  setTerrain(sampler)   { this.terrain = sampler; }

  handle(state) {
    if      (state.phase === 'bouncing') this._bounce(state);
    else if (state.phase === 'rolling')  this._roll(state);
  }

  // ── Bounce — Penner (2002) ─────────────────────────────────────────
  _bounce(state) {
    const viy    = state.vy;
    const vix    = state.vx;
    const absViy = Math.abs(viy);

    // Variable restitution (Penner p.933)
    let e = absViy <= 20
      ? CONSTANTS.RESTITUTION_A - CONSTANTS.RESTITUTION_B * absViy + CONSTANTS.RESTITUTION_C * absViy ** 2
      : CONSTANTS.RESTITUTION_MIN;
    e = Math.max(0, Math.min(1, e));

    const vry = e * absViy;

    // Sliding / rolling transition at impact (Penner p.933)
    const mu_c = (2 / 7) * (vix + CONSTANTS.RADIUS * state.wz) / (absViy * (1 + e));
    let vrx;
    if (Math.abs(mu_c) > CONSTANTS.MU_FRICTION) {
      vrx = vix - Math.sign(vix) * CONSTANTS.MU_FRICTION * absViy * (1 + e);
    } else {
      vrx = (5 / 7) * vix - (2 / 7) * CONSTANTS.RADIUS * state.wz;
    }

    state.vx  = vrx;
    state.vy  = vry;
    state.vz *= (1 - CONSTANTS.MU_FRICTION);
    state.wz *= 0.6;
    state.wy *= 0.6;

    const groundY = this.terrain ? this.terrain.getHeightAt(state.x, state.z) : 0;

    if (vry < 0.5 || (state.y - groundY) < CONSTANTS.ROLL_THRESHOLD) {
      state.vy            = 0;
      state.y             = groundY;
      state.phase         = 'rolling';
      this._rollStartTime = state.time;   // record when rolling begins
    } else {
      state.phase = 'flying';
    }
  }

  // ── Roll — Cross (2024) + terrain + surface friction ──────────────
  //
  // Physics on a slope (per unit mass):
  //   Let n = terrain normal = (-dh/dx, 1, -dh/dz), |n| = sqrt(1 + dhdx² + dhdz²)
  //   Normal force   = g / |n|           (gravity component ⊥ to surface)
  //   Friction force = mu * g / |n|      (opposes velocity in X-Z plane)
  //   Slope force X  = -g * dhdx / |n|²  (gravity component along surface, X)
  //   Slope force Z  = -g * dhdz / |n|²  (gravity component along surface, Z)
  //
  // For gentle slopes |n| ≈ 1, which recovers the original flat formula.
  // For the slopes produced by our terrain (max ~0.18 after amplitude fix),
  // the difference is <2% — but the formula also correctly prevents runaway
  // because friction now scales with cos(θ) just as slope force does.
  _roll(state) {
    const dt = CONSTANTS.FIXED_DT;

    // ── Safety stop — catches any terrain edge case ─────────────────
    // 25 s is far longer than any realistic shot roll (typical: 3–8 s)
    if (state.time - this._rollStartTime > 25.0) {
      state.vx = 0; state.vz = 0;
      state.y  = this.terrain ? this.terrain.getHeightAt(state.x, state.z) : 0;
      state.phase = 'stopped';
      return;
    }

    // ── Sample surface + gradient at CURRENT position ────────────────
    const surface = this.terrain
      ? this.terrain.getSurfaceAt(state.x, state.z)
      : S.SURFACE_ROUGH;

    const mu = this._frictionForSurface(surface);

    let dhdx = 0, dhdz = 0;
    if (this.terrain) {
      const D  = 1.5;                                         // sample step (m)
      dhdx = (this.terrain.getHeightAt(state.x + D, state.z) -
               this.terrain.getHeightAt(state.x - D, state.z)) / (2 * D);
      dhdz = (this.terrain.getHeightAt(state.x, state.z + D) -
               this.terrain.getHeightAt(state.x, state.z - D)) / (2 * D);
    } else {
      dhdx = Math.tan((this.slopeAngleDeg * Math.PI) / 180);
    }

    // ── Speed in rolling plane ────────────────────────────────────────
    const speed = Math.sqrt(state.vx ** 2 + state.vz ** 2);

    if (speed < CONSTANTS.MIN_SPEED) {
      state.vx = 0; state.vz = 0; state.vy = 0;
      state.y  = this.terrain ? this.terrain.getHeightAt(state.x, state.z) : 0;
      state.phase = 'stopped';
      return;
    }

    const ux = state.vx / speed;
    const uz = state.vz / speed;

    // ── Slope-corrected force components ─────────────────────────────
    // |n|² = 1 + dhdx² + dhdz²
    const lenSq     = 1.0 + dhdx * dhdx + dhdz * dhdz;
    const lenN      = Math.sqrt(lenSq);           // |n|

    const frictionAcc = mu * CONSTANTS.GRAVITY / lenN;          // mu*g*cos(θ)
    const slopeAx     = -CONSTANTS.GRAVITY * dhdx / lenSq;      // gravity X along surface
    const slopeAz     = -CONSTANTS.GRAVITY * dhdz / lenSq;      // gravity Z along surface

    const ax = -frictionAcc * ux + slopeAx;
    const az = -frictionAcc * uz + slopeAz;

    // ── Integrate velocity ────────────────────────────────────────────
    state.vx += ax * dt;
    state.vz += az * dt;

    // ── Speed clamp in rough/sand/water ──────────────────────────────
    // Real rough and sand physically grip the ball and prevent downhill
    // acceleration even on steep slopes. If the ball would be going faster
    // after this step, cap it to its entry speed.
    if (surface === S.SURFACE_ROUGH ||
        surface === S.SURFACE_SAND  ||
        surface === S.SURFACE_WATER) {
      const newSpeed = Math.sqrt(state.vx ** 2 + state.vz ** 2);
      if (newSpeed > speed) {
        const ratio = speed / newSpeed;
        state.vx *= ratio;
        state.vz *= ratio;
      }
    }

    // ── Integrate position ────────────────────────────────────────────
    state.x += state.vx * dt;
    state.z += state.vz * dt;

    // ── Snap Y to terrain at NEW position ────────────────────────────
    // Sampled AFTER position update — no one-step lag.
    state.y  = this.terrain ? this.terrain.getHeightAt(state.x, state.z) : 0;
    state.vy = 0;

    // Spin decays during rolling
    state.wz *= 0.98;
    state.wy *= 0.98;

    state.time += dt;
  }

  // ── Surface friction lookup ────────────────────────────────────────
  _frictionForSurface(surface) {
    switch (surface) {
      case S.SURFACE_GREEN:   return S.MU_ROLL_GREEN;
      case S.SURFACE_FRINGE:  return S.MU_ROLL_FRINGE;
      case S.SURFACE_FAIRWAY: return S.MU_ROLL_FAIRWAY;
      case S.SURFACE_TEE:     return S.MU_ROLL_TEE;
      case S.SURFACE_ROUGH:   return S.MU_ROLL_ROUGH;
      case S.SURFACE_SAND:    return S.MU_ROLL_SAND;
      case S.SURFACE_WATER:   return S.MU_ROLL_WATER;
      default:                return S.MU_ROLL;
    }
  }

}

export default CollisionHandler;
