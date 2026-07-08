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
//      velocity AND its spin — they are not independent. The previous
//      version got this wrong: it computed a physically-derived Δv from
//      a Penner-style formula, then separately multiplied spin by an
//      arbitrary constant (0.4) unrelated to the friction impulse that
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
// *would* be needed to zero the slip against the Coulomb limit μ·N — not
// by an ad hoc "mu_c" scalar built from mismatched signed/unsigned terms.
//
// Both branches update vx, vz, wx, wz together from the same impulse, so
// spin and translation always change consistently with each other.

import CONSTANTS from '../constants.js';

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
    // decay for real turf contact-patch losses, instead of the flat 0.4
    // that used to be applied to all three axes indiscriminately.
    state.wy *= 0.85;

    const groundY = this.terrain ? this.terrain.getHeightAt(state.x, state.z) : 0;

    // 4. Regime transition: once vertical rebound speed drops below
    // threshold, treat subsequent contact as continuous rolling rather
    // than simulating a string of ever-smaller bounces.
    if (state.vy < 1.2) {
      state.vy = 0;
      state.y  = groundY; // ground-reference height; BallMesh adds RADIUS for rendering
      state.phase = 'rolling';
      this._rollStartTime = state.time;
    } else {
      state.y = groundY;
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
  _roll(state) {
    const dt = CONSTANTS.FIXED_DT;
    const R  = CONSTANTS.RADIUS;

    // ── Safety stop — catches any terrain edge case ─────────────────
    if (state.time - this._rollStartTime > 25.0) {
      state.vx = 0; state.vz = 0; state.wx = 0; state.wz = 0;
      const h = this.terrain ? this.terrain.getHeightAt(state.x, state.z) : 0;
      state.y = h;
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

    if (speed < 0.5) {
      state.vx = 0; state.vz = 0; state.vy = 0; state.wx = 0; state.wz = 0;
      const h = this.terrain ? this.terrain.getHeightAt(state.x, state.z) : 0;
      state.y = h;
      state.phase = 'stopped';
      return;
    }

    const ux = state.vx / speed;
    const uz = state.vz / speed;

    // ── Slope-corrected force components ─────────────────────────────
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
    // NOTE: this remains a stopgap. The real fix is to verify
    // MU_ROLL_ROUGH / MU_ROLL_SAND against the steepest slopes the
    // terrain generator can produce, so friction alone prevents runaway
    // without needing a hard velocity cap. Left in place for now so
    // steep-slope edge cases don't regress while that tuning happens.
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

    // ── Snap Y to terrain at NEW position (ground-reference height —
    // BallMesh adds RADIUS on top of this for the rendered sphere). ──
    state.y  = this.terrain
      ? this.terrain.getHeightAt(state.x, state.z)
      : 0;
    state.vy = 0;

    // ── Enforce rolling-without-slip ─────────────────────────────────
    // A rolling ball's spin isn't independent of its ground speed — the
    // no-slip condition (slip_x = vx + R·wz = 0, slip_z = vz - R·wx = 0)
    // must hold at every instant, not just at the moment contact begins.
    // The previous version decayed wz by an arbitrary 0.98/step,
    // completely decoupled from how vx was actually changing due to
    // friction/slope — so spin and translation drifted out of sync the
    // longer the ball rolled. Re-deriving wz/wx from the current
    // velocity every step keeps them locked together, which is also
    // what makes the ball's visible spin (and the force/kinematics
    // readout) correct while it's rolling out.
    state.wz = -state.vx / R;
    state.wx =  state.vz / R;

    // wy (spin about the vertical/normal axis — hook/slice) has no
    // rolling constraint; it just bleeds off slowly from grass drag.
    state.wy *= 0.99;
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
