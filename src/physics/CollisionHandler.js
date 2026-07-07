// physics/CollisionHandler.js
// Ground contact physics — two regimes:
//   BOUNCING — rigid-sphere impulse model (normal restitution + coupled
//              linear/angular Coulomb friction at the contact point)
//   ROLLING  — Cross (2024)-style terrain-following roll with surface friction
//
// ── Bounce model, derived from first principles ─────────────────────────
// The ball is a solid sphere (I = (2/5) m R²) contacting a flat surface at
// the point r = (0, -R, 0) relative to its center. Two things happen at
// impact:
//   1. Normal direction (Y): velocity reverses and shrinks by the
//      speed-dependent restitution coefficient e (Penner 2002).
//   2. Tangential plane (X-Z): a friction impulse acts at the contact
//      point. That impulse simultaneously changes the ball's horizontal
//      velocity AND its spin — they are not independent. An earlier
//      version got this wrong: it computed a physically-derived Δv from
//      a Penner-style formula, then separately multiplied spin by an
//      arbitrary constant (0.6) unrelated to the friction impulse that
//      had just been applied — breaking conservation of angular momentum
//      at the contact point.
//
// Contact-point (slip) velocity, from v_contact = v_center + ω × r with
// r = (0, -R, 0):
//   slip_x = vx + R·wz
//   slip_z = vz - R·wx
// (wy — spin about the vertical/normal axis, i.e. hook/slice spin — has
//  zero moment arm at this contact point for a point-contact sphere, so
//  it is not coupled to the translational bounce kick in this model. Real
//  turf interaction isn't a true point contact, so a small empirical
//  decay is still applied to wy below, but we don't invent a
//  translational coupling that rigid-body contact mechanics doesn't
//  support.)
//
// Two friction regimes, exactly as in real ball bounces:
//   (a) Kinetic/sliding — the ball skids throughout contact. Friction
//       force = μ·N, opposing the slip vector.
//   (b) Static/rolling  — friction is strong enough (relative to μ·N) to
//       kill the slip entirely before separation, so the ball leaves the
//       ground rolling without slipping at the contact point.
// Which regime applies is decided by comparing the friction impulse that
// *would* be needed to zero the slip against the Coulomb limit μ·N.
//
// Both branches update vx, vz, wx, wz together from the same impulse, so
// spin and translation always change consistently with each other.
//
// ── Roll phase key fixes vs an earlier version ──────────────────────────
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

  // ── Bounce — coupled linear/angular impulse model ──────────────────
  _bounce(state) {
    const R = CONSTANTS.RADIUS;
    const absViy = Math.abs(state.vy);

    // 1. Normal restitution (Penner 2002, speed-dependent) — unchanged.
    let e = absViy <= 20
      ? CONSTANTS.RESTITUTION_A - CONSTANTS.RESTITUTION_B * absViy + CONSTANTS.RESTITUTION_C * (absViy ** 2)
      : CONSTANTS.RESTITUTION_MIN;
    e = Math.max(0, Math.min(1, e));
    state.vy = e * absViy;

    // 2. Slip velocity at the contact point (tangential plane).
    const slipX = state.vx + R * state.wz;
    const slipZ = state.vz - R * state.wx;
    const slipMag = Math.sqrt(slipX * slipX + slipZ * slipZ);

    // Normal impulse (per unit mass — mass cancels out of every
    // velocity/spin update below, so we work directly in impulse/mass).
    const Jn = absViy * (1 + e);
    const frictionLimit = CONSTANTS.MU_FRICTION * Jn;

    // Required tangential impulse/mass to bring slip to exactly zero
    // (derived from Δv = J/m, Δω = 5J/(2mR) for I = (2/5)mR², requiring
    // slip_x' = slip_z' = 0 at separation): |J_required|/m = (2/7)·|slip|
    const requiredImpulse = (2 / 7) * slipMag;

    if (requiredImpulse <= frictionLimit || slipMag < 1e-6) {
      // (a) ROLLING regime — static friction fully arrests the slip.
      state.vx = state.vx - (2 / 7) * slipX;
      state.vz = state.vz - (2 / 7) * slipZ;
      state.wz = state.wz - (5 / (7 * R)) * slipX;
      state.wx = state.wx + (5 / (7 * R)) * slipZ;
    } else {
      // (b) SLIDING regime — kinetic friction acts at the Coulomb limit,
      // opposing the slip direction, for the whole contact.
      const ux = slipX / slipMag;
      const uz = slipZ / slipMag;
      const Jx = -frictionLimit * ux;
      const Jz = -frictionLimit * uz;

      state.vx += Jx;
      state.vz += Jz;
      state.wz += (5 / (2 * R)) * Jx;
      state.wx -= (5 / (2 * R)) * Jz;
    }

    // 3. Vertical/hook-slice spin (wy) isn't coupled to translation at
    // this contact point (see header note) — apply only a mild empirical
    // decay for real turf contact-patch losses, instead of the flat 0.6
    // that used to be applied to all three axes indiscriminately.
    state.wy *= 0.85;

    const groundY = this.terrain ? this.terrain.getHeightAt(state.x, state.z) : 0;

    // 4. Regime transition: once vertical rebound speed drops below
    // threshold, treat subsequent contact as continuous rolling rather
    // than simulating a string of ever-smaller bounces.
    // state.y is the ball's ground-contact height (not its rendered
    // center) — BallMesh/TrailRenderer add the visual radius on top.
    if (state.vy < 0.5 || (state.y - groundY) < CONSTANTS.ROLL_THRESHOLD) {
      state.vy             = 0;
      state.y              = groundY;
      state.phase          = 'rolling';
      this._rollStartTime  = state.time;
    } else {
      state.y     = groundY;
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
