// physics/PhysicsEngine.js
// Numerical integrator — advances the ball state forward by one fixed timestep.
// Method: Semi-implicit Euler (section 8.1 of PDF)
// Timestep: Δt = 0.01 s (section 8.1 of PDF)

import CONSTANTS     from '../constants.js';
import { totalForce } from './Forces.js';

class PhysicsEngine {

  constructor() {
    this.wind    = { vx: 0, vy: 0, vz: 0 };
    this.terrain = null;   // set by main.js after courseMesh is ready
  }

  // ------------------------------------------------------------------
  // setWind()  — called by main.js when wind sliders change
  // ------------------------------------------------------------------
  setWind(vx, vy, vz) {
    this.wind = { vx, vy, vz };
  }

  // ------------------------------------------------------------------
  // setTerrain()
  // Receives the CourseMesh instance (duck-typed sampler).
  // Only getHeightAt(wx, wz) is called from here.
  // ------------------------------------------------------------------
  setTerrain(sampler) {
    this.terrain = sampler;
  }

  // ------------------------------------------------------------------
  // step()
  // Advances the simulation by exactly one Δt = 0.01 s.
  // ------------------------------------------------------------------
  step(state) {

    if (state.phase !== 'flying') return;

    const dt = CONSTANTS.FIXED_DT;

    // --- Compute total force (drag + Magnus + gravity) ---
    const F  = totalForce(state, this.wind);
    const ax = F.fx / CONSTANTS.MASS;
    const ay = F.fy / CONSTANTS.MASS;
    const az = F.fz / CONSTANTS.MASS;

    // --- Semi-implicit Euler: velocity first, then position ---
    state.vx += ax * dt;
    state.vy += ay * dt;
    state.vz += az * dt;

    state.x  += state.vx * dt;
    state.y  += state.vy * dt;
    state.z  += state.vz * dt;

    state.time += dt;

    // --- NaN guard ---
    if (!state.isFinite()) {
      console.error('PhysicsEngine: NaN at t =', state.time);
      state.phase = 'stopped';
      return;
    }

    // --- Ground check: compare against actual terrain height ---
    // With a flat course this is identical to the old y <= 0 check.
    // With terrain, the ball correctly detects the shaped ground.
    const groundY = this.terrain
      ? this.terrain.getHeightAt(state.x, state.z)
      : 0;

    if (state.y <= groundY && state.vy < 0) {
      state.y     = groundY;
      state.phase = 'bouncing';
      return;
    }

    // --- Out of bounds ---
    if (
      Math.abs(state.x) > CONSTANTS.COURSE_SIZE ||
      Math.abs(state.z) > CONSTANTS.COURSE_SIZE
    ) {
      state.phase = 'stopped';
      return;
    }

  }

}

export default PhysicsEngine;
