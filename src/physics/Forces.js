import CONSTANTS from '../constants.js';

// ------------------------------------------------------------------
// gravity()
export function gravity() {
  return {
    fx: 0,
    fy: -CONSTANTS.MASS * CONSTANTS.GRAVITY,
    fz: 0,
  };
}

// ------------------------------------------------------------------
// drag()
export function drag(state, wind = { vx: 0, vy: 0, vz: 0 }) {

  // Section 4.4 — relative velocity (Cross 2024)
  const vrx = state.vx - wind.vx;
  const vry = state.vy - wind.vy;
  const vrz = state.vz - wind.vz;

  const vrel = Math.sqrt(vrx ** 2 + vry ** 2 + vrz ** 2);

  // Guard: no drag if ball is stationary
  if (vrel < 0.01) return { fx: 0, fy: 0, fz: 0 };

  const k = 0.5 * CONSTANTS.CD * CONSTANTS.AIR_DENSITY * CONSTANTS.AREA * vrel;

  return {
    fx: -k * vrx,
    fy: -k * vry,
    fz: -k * vrz,
  };
}

// ------------------------------------------------------------------
// magnus()
// Cross product of spin vector and RELATIVE velocity vector, scaled by S.
//
// Paper Eq.11–13 (Burglund & Street, Hinrichsen): the cross product
// must use vrel = vball − vwind, not absolute ball velocity.
// This matches how drag is computed and ensures consistent aerodynamic
// reference frame — forces act on velocity relative to the air mass.
//
// Cross product expanded (using vrel components):
//   (ω × vrel).x = ωy·vrel,z − ωz·vrel,y
//   (ω × vrel).y = ωz·vrel,x − ωx·vrel,z
//   (ω × vrel).z = ωx·vrel,y − ωy·vrel,x
//
// Spin effects (Jorgensen Chapter 8):
//   ωz > 0  → backspin → lift upward  (positive Y force)
//   ωy > 0  → slice spin → pushes right (positive Z force)
//   ωy < 0  → hook spin  → pushes left  (negative Z force)

export function magnus(state, wind = { vx: 0, vy: 0, vz: 0 }) {
  const S = CONSTANTS.MAGNUS_S;

  // Relative velocity components — paper Eq.9
  const vrx = state.vx - wind.vx;
  const vry = state.vy - wind.vy;
  const vrz = state.vz - wind.vz;

  return {
    fx: S * (state.wy * vrz - state.wz * vry),
    fy: S * (state.wz * vrx - state.wx * vrz),
    fz: S * (state.wx * vry - state.wy * vrx),
  };
}

// ------------------------------------------------------------------
// totalForce()

export function totalForce(state, wind) {
  const g = gravity();
  const d = drag(state, wind);
  const m = magnus(state, wind);   // wind passed so Magnus uses vrel (paper Eq.11–13)

  return {
    fx: g.fx + d.fx + m.fx,
    fy: g.fy + d.fy + m.fy,
    fz: g.fz + d.fz + m.fz,
  };
}
