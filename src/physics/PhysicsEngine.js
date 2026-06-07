// physics/PhysicsEngine.js
// Numerical integrator — advances the ball state forward by one fixed timestep.
// Method: Semi-implicit Euler (section 8.1 of PDF)
// Timestep: Δt = 0.01 s (section 8.1 of PDF)
// ODE system: section 5 of PDF (Jorgensen equations on all 3 axes)
//
// Semi-implicit Euler order (section 8.2):
//   1. Compute acceleration from total force
//   2. Update velocity first  (v += a · dt)
//   3. Update position second (x += v · dt)  ← uses the NEW velocity
// This order makes it more stable than explicit Euler at the same Δt.

import CONSTANTS from '../constants.js';
import { totalForce } from './Forces.js';

class PhysicsEngine {

  constructor() {
    this.wind = { vx: 0, vy: 0, vz: 0 };  // set by ControlPanel via main.js
  }

  // ------------------------------------------------------------------
  // setWind()
  // Called by main.js when the user changes wind sliders.
  // ------------------------------------------------------------------
  setWind(vx, vy, vz) {
    this.wind = { vx, vy, vz };
  }

  // ------------------------------------------------------------------
  // step()
  // Advances the simulation by exactly one Δt = 0.01 s.
  // Directly implements the ODE system from PDF section 5:
  //
  //   ẍ = −(ρ·A·CD / 2m)·vrel·ẋ + (S/m)·(ωy·ż − ωz·ẏ)
  //   ÿ = −g − (ρ·A·CD / 2m)·vrel·ẏ + (S/m)·(ωz·ẋ − ωx·ż)
  //   z̈ = −(ρ·A·CD / 2m)·vrel·ż + (S/m)·(ωx·ẏ − ωy·ẋ)
  //
  // These accelerations are produced by totalForce() / mass,
  // which is Newton's second law: a = F/m.
  // ------------------------------------------------------------------
  step(state) {

    // Only integrate during flight phase
    if (state.phase !== 'flying') return;

    const dt = CONSTANTS.FIXED_DT;

    // --- Step 1: compute total force vector (PDF sections 4.1–4.4) ---
    const F = totalForce(state, this.wind);

    // --- Step 2: compute acceleration — Newton's second law: a = F/m ---
    const ax = F.fx / CONSTANTS.MASS;
    const ay = F.fy / CONSTANTS.MASS;
    const az = F.fz / CONSTANTS.MASS;

    // --- Step 3: update velocity first (semi-implicit Euler, PDF 8.2) ---
    state.vx += ax * dt;
    state.vy += ay * dt;
    state.vz += az * dt;

    // --- Step 4: update position using the NEW velocity ---
    state.x += state.vx * dt;
    state.y += state.vy * dt;
    state.z += state.vz * dt;

    // --- Step 5: advance simulation time ---
    state.time += dt;

    // --- Step 6: NaN guard ---
    // If any value exploded (div by zero, bad input), stop immediately.
    if (!state.isFinite()) {
      console.error('PhysicsEngine: NaN detected at t =', state.time);
      state.phase = 'stopped';
      return;
    }

    // --- Step 7: check termination conditions (PDF section 11) ---
    // 11.1 — ball hit the ground: hand off to CollisionHandler
    if (state.y <= 0 && state.vy < 0) {
      state.y     = 0;
      state.phase = 'bouncing';
      return;
    }

    // 11.2 — out of bounds
    if (
      Math.abs(state.x) > CONSTANTS.COURSE_SIZE ||
      Math.abs(state.z) > CONSTANTS.COURSE_SIZE
    ) {
      console.warn('PhysicsEngine: ball left course bounds.');
      state.phase = 'stopped';
      return;
    }

  }

}

export default PhysicsEngine;

/*
The ODE system in the comment block is copied verbatim from PDF section 5 — the three acceleration equations on x, y, z. What totalForce() / mass computes is exactly those equations, broken into Forces.js for clarity.

The velocity-before-position update order is the defining characteristic of semi-implicit Euler over explicit Euler — PDF section 8.1 specifically justifies choosing this method for stability at Δt = 0.01 s in a web environment.

The ground check state.y <= 0 && state.vy < 0 is important — the vy < 0 condition ensures the ball only triggers collision when it is actually descending, not on the way up if it starts below ground.

The integrator never handles bouncing or rolling itself — it just sets state.phase = 'bouncing' and returns. CollisionHandler.js takes over from there, which keeps each file responsible for exactly one physical regime.
then : physics/CollisionHandler.js — the Penner bounce model and Cross slope rolling.


*/