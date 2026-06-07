// physics/CollisionHandler.js
// Handles all ground contact physics.
// Two distinct physical regimes, applied in sequence:
//
//   1. BOUNCING — Penner (2002) impact model
//      "The run of a golf ball", Canadian Journal of Physics, 80(9), 931–940
//      Equations: 2a, 3a, 5a (PDF section 6)
//
//   2. ROLLING  — Cross (2024) slope model
//      "Trajectory of a golf ball on a sloping green"
//      European Journal of Physics, 45, 035002
//      Equations: 11, 12, 15 (PDF section 7)

import CONSTANTS from '../constants.js';

class CollisionHandler {

  constructor() {
    this.slopeAngleDeg = 0;   // set by ControlPanel via main.js
  }

  // ------------------------------------------------------------------
  // setSlope()
  // Called by main.js when the user changes the slope slider.
  // ------------------------------------------------------------------
  setSlope(angleDeg) {
    this.slopeAngleDeg = angleDeg;
  }

  // ------------------------------------------------------------------
  // handle()
  // Main entry point — called by main.js every frame when
  // state.phase === 'bouncing' or state.phase === 'rolling'.
  // ------------------------------------------------------------------
  handle(state) {
    if (state.phase === 'bouncing') {
      this._bounce(state);
    } else if (state.phase === 'rolling') {
      this._roll(state);
    }
  }

  // ------------------------------------------------------------------
  // _bounce()
  // PDF section 6 — Penner (2002) impact model.
  //
  // Decomposes velocity into normal (Y) and tangential (X) components,
  // applies variable restitution coefficient, then branches into
  // sliding or pure rolling depending on friction (PDF section 6.3).
  // ------------------------------------------------------------------
  _bounce(state) {

    // Impact velocity components
    // viy' = normal (vertical) impact speed — always negative on entry
    // vix' = tangential (horizontal) impact speed
    const viy = state.vy;   // normal component (negative = downward)
    const vix = state.vx;   // tangential component

    const absViy = Math.abs(viy);

    // --- 6.1: Variable restitution coefficient (Penner p.933) ---
    // e = 0.510 − 0.0375·|viy'| + 0.000903·|viy'|²  for |viy'| ≤ 20 m/s
    // e = 0.120                                        for |viy'| > 20 m/s
    let e;
    if (absViy <= 20) {
      e = CONSTANTS.RESTITUTION_A
        - CONSTANTS.RESTITUTION_B * absViy
        + CONSTANTS.RESTITUTION_C * absViy ** 2;
    } else {
      e = CONSTANTS.RESTITUTION_MIN;
    }

    // Clamp e to physically valid range [0, 1]
    e = Math.max(0, Math.min(1, e));

    // --- 6.2: Normal force component — vertical bounce ---
    // vry' = e · |viy'|  (rebound speed, upward)
    const vry = e * absViy;   // positive = upward

    // --- 6.3: Determine sliding vs pure rolling (Penner p.933) ---
    // Critical friction determines which regime applies.
    // μc = (2/7) · (vix + r·ωz) / (|viy'| · (1 + e))
    const mu_c = (2 / 7) *
      (vix + CONSTANTS.RADIUS * state.wz) /
      (absViy * (1 + e));

    let vrx;  // post-bounce horizontal velocity

    if (Math.abs(mu_c) > CONSTANTS.MU_FRICTION) {

      // --- Sliding case (PDF section 6.3 — equation 2a) ---
      // Ball slides on grass during bounce.
      // vrx' = vix' − μ · |viy'| · (1 + e)
      const sign = vix >= 0 ? 1 : -1;
      vrx = vix - sign * CONSTANTS.MU_FRICTION * absViy * (1 + e);

    } else {

      // --- Pure rolling case (PDF section 6.3 — equation 3a) ---
      // Friction is sufficient to stop sliding immediately.
      // vrx' = (5/7)·vix' − (2/7)·r·ωz
      // This equation shows how backspin converts to reverse linear motion.
      vrx = (5 / 7) * vix - (2 / 7) * CONSTANTS.RADIUS * state.wz;

    }

    // --- Apply post-bounce velocities ---
    state.vx = vrx;
    state.vy = vry;
    state.vz = state.vz * (1 - CONSTANTS.MU_FRICTION);  // lateral damping

    // --- Spin decay on bounce ---
    // Each bounce loses some spin due to surface contact.
    state.wz *= 0.6;
    state.wy *= 0.6;

    // --- 6.4: Transition condition (Penner p.935) ---
    // If rebound speed is too low, stop bouncing and start rolling.
    if (vry < 0.5 || state.y < CONSTANTS.ROLL_THRESHOLD) {
      state.vy    = 0;
      state.y     = 0;
      state.phase = 'rolling';
    } else {
      // Ball still has enough energy to bounce again — back to flying
      state.phase = 'flying';
    }

  }

  // ------------------------------------------------------------------
  // _roll()
  // PDF section 7 — Cross (2024) slope rolling model.
  //
  // Computes deceleration from rolling friction and gravitational
  // pull along the slope. Produces "The Break" — the curved path
  // a ball follows on a sloped green.
  //
  // Equations (Cross p.5):
  //   ax = −A · (vx / |v|)
  //   ay = −B − A · (vy / |v|)
  //   where:
  //     A = μR · g · cos(θ)   ← rolling friction deceleration
  //     B = g · sin(θ) / 1.4  ← gravitational slope pull
  // ------------------------------------------------------------------
  _roll(state) {

    const dt    = CONSTANTS.FIXED_DT;
    const theta = (this.slopeAngleDeg * Math.PI) / 180;

    const speed = Math.sqrt(state.vx ** 2 + state.vz ** 2);

    // --- Termination condition (PDF section 11.1) ---
    if (speed < CONSTANTS.MIN_SPEED) {
      state.vx    = 0;
      state.vy    = 0;
      state.vz    = 0;
      state.phase = 'stopped';
      return;
    }

    // --- Cross (2024) slope acceleration components ---
    // A = rolling friction deceleration magnitude
    // B = gravitational pull component down the slope
    const A = CONSTANTS.MU_ROLL * CONSTANTS.GRAVITY * Math.cos(theta);
    const B = CONSTANTS.GRAVITY * Math.sin(theta) / 1.4;

    // Unit vector of current velocity (direction of motion)
    const ux = state.vx / speed;
    const uz = state.vz / speed;

    // Acceleration components
    const ax = -A * ux - B;   // friction opposing motion + gravity on slope X
    const az = -A * uz;       // friction opposing motion on slope Z

    // --- Semi-implicit Euler integration (same method as PhysicsEngine) ---
    state.vx += ax * dt;
    state.vz += az * dt;

    state.x  += state.vx * dt;
    state.z  += state.vz * dt;

    // Ball stays on the ground during rolling
    state.y   = 0;
    state.vy  = 0;

    // Spin decays gradually during rolling
    state.wz *= 0.98;
    state.wy *= 0.98;

    state.time += dt;

  }

}

export default CollisionHandler;


/*
The Penner restitution formula (section 6.1) is implemented exactly as written — the quadratic e formula for speeds under 20 m/s, and the flat e = 0.120 floor above it. The clamp to [0, 1] is a safety measure since the quadratic can technically produce values outside that range at extreme speeds.
The sliding vs rolling branch (section 6.3) is the most important part of the collision model. The critical friction μc determines which equation applies — this is the distinction your PDF highlights as the difference between a simple simulation and a realistic one. The comment on the pure rolling equation explains the physics: backspin (wz) directly opposes forward motion, which is exactly why a professional's backspin shot can make the ball roll backwards.
The Cross (2024) slope model (section 7) uses vx and vz for the rolling plane, with vy forced to zero since the ball is on the ground. The B term is what produces "The Break" — without it, the ball would just decelerate in a straight line regardless of slope.


*/