// physics/Forces.js
// Pure functions — each takes state + constants and returns a force vector.
// No side effects. No imports from Three.js.
// Equations sourced directly from PDF sections 4.1, 4.2, 4.3, 4.4.

import CONSTANTS from '../constants.js';

// ------------------------------------------------------------------
// gravity()
// Section 4.1 — F⃗g = m · g⃗
// Always acts downward on the Y axis.
// Returns: { fx, fy, fz }
// ------------------------------------------------------------------
export function gravity() {
  return {
    fx: 0,
    fy: -CONSTANTS.MASS * CONSTANTS.GRAVITY,
    fz: 0,
  };
}

// ------------------------------------------------------------------
// drag()
// Section 4.2 — F⃗d = -½ · CD · ρ · A · |v⃗rel| · v⃗rel
// Quadratic drag — opposes the direction of motion.
// Uses relative velocity (ball velocity minus wind velocity).
// Returns: { fx, fy, fz }
// ------------------------------------------------------------------
export function drag(state, wind = { vx: 0, vy: 0, vz: 0 }) {

  // Section 4.4 — relative velocity (Cross 2024)
  const vrx = state.vx - wind.vx;
  const vry = state.vy - wind.vy;
  const vrz = state.vz - wind.vz;

  const vrel = Math.sqrt(vrx ** 2 + vry ** 2 + vrz ** 2);

  // Guard: no drag if ball is stationary
  if (vrel === 0) return { fx: 0, fy: 0, fz: 0 };

  const k = 0.5 * CONSTANTS.CD * CONSTANTS.AIR_DENSITY * CONSTANTS.AREA * vrel;

  return {
    fx: -k * vrx,
    fy: -k * vry,
    fz: -k * vrz,
  };
}

// ------------------------------------------------------------------
// magnus()
// Section 4.3 — F⃗M = S · (ω⃗ × v⃗)
// Cross product of spin vector and velocity vector, scaled by S.
//
// Cross product expanded:
//   (ω × v).x = ωy·vz − ωz·vy
//   (ω × v).y = ωz·vx − ωx·vz
//   (ω × v).z = ωx·vy − ωy·vx
//
// Spin effects (Jorgensen Chapter 8):
//   ωz > 0  → backspin → lift upward  (positive Y force)
//   ωy > 0  → slice spin → pushes right (positive Z force)
//   ωy < 0  → hook spin  → pushes left  (negative Z force)
//
// Returns: { fx, fy, fz }
// ------------------------------------------------------------------
export function magnus(state) {
  const { vx, vy, vz, wx, wy, wz } = state;
  const S = CONSTANTS.MAGNUS_S;

  return {
    fx: S * (wy * vz - wz * vy),
    fy: S * (wz * vx - wx * vz),
    fz: S * (wx * vy - wy * vx),
  };
}

// ------------------------------------------------------------------
// totalForce()
// Sums all forces acting on the ball during flight.
// This is what PhysicsEngine calls — it never calls the above directly.
// Returns: { fx, fy, fz }
// ------------------------------------------------------------------
export function totalForce(state, wind) {
  const g = gravity();
  const d = drag(state, wind);
  const m = magnus(state);

  return {
    fx: g.fx + d.fx + m.fx,
    fy: g.fy + d.fy + m.fy,
    fz: g.fz + d.fz + m.fz,
  };
}

/*
gravity() is section 4.1 — one line of physics, nothing more.
drag() implements section 4.2 and 4.4 together — the quadratic drag formula using relative velocity, exactly as Cross (2024) specifies. The wind parameter defaults to zero so calling drag(state) without wind still works correctly.
magnus() is section 4.3 with the cross product fully expanded into its three scalar components. The comments map directly to Jorgensen Chapter 8's explanation of how spin axis direction determines ball curve — this is the part your professor will look at most closely.
totalForce() is the only function PhysicsEngine.js will ever call — it keeps the integrator clean and unaware of how many forces exist.
*/