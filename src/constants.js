// constants.js
// All physical constants for the golf ball simulation.
// Sources: USGA standards, Jorgensen (1994), NASA Glenn Research Center,
//          Penner (2002), Cross (2024).

const CONSTANTS = Object.freeze({

  // --- Ball properties (USGA standard) ---
  MASS:          0.04593,   // kg      — ball mass
  RADIUS:        0.02133,   // m       — ball radius
  AREA:          0.00143,   // m²      — cross-sectional area (π · r²)

  // --- Aerodynamic properties ---
  AIR_DENSITY:   1.225,     // kg/m³   — air density at sea level
  CD:            0.22,      // —       — drag coefficient (dimpled ball, NASA)
  MAGNUS_S:      0.00006,   // kg·m    — Magnus force coefficient

  // --- Environment ---
  GRAVITY:       9.806,     // m/s²    — gravitational acceleration

  // --- Collision model (Penner 2002) ---
  MU_FRICTION:   0.40,      // —       — grass kinetic friction coefficient (Daish)
  MU_ROLL:       0.10,      // —       — rolling friction coefficient
  RESTITUTION_A: 0.510,     // —       — Penner e formula: constant term
  RESTITUTION_B: 0.0375,    // —       — Penner e formula: linear term
  RESTITUTION_C: 0.000903,  // —       — Penner e formula: quadratic term
  RESTITUTION_MIN: 0.120,   // —       — floor value for impact speed > 20 m/s
  ROLL_THRESHOLD: 0.005,    // m       — height below which ball switches to rolling (5 mm)

  // --- Integrator ---
  FIXED_DT:      0.01,      // s       — physics timestep (semi-implicit Euler)

  // --- Simulation bounds ---
  COURSE_SIZE:   300,       // m       — half-width of the course plane
  MIN_SPEED:     0.01,      // m/s     — total speed below which simulation stops

});

export default CONSTANTS;

/**
 A few things worth noting:
MAGNUS_S is the only constant not directly stated in your PDF — it's a standard empirical value for a golf ball (units kg·m). Your PDF gives the formula F = S·(ω × v) but leaves S to be looked up. 0.00006 is the widely used value from Bearman & Harvey's wind tunnel data.
Object.freeze() means nothing can accidentally overwrite these values at runtime — if any other file tries to do CONSTANTS.GRAVITY = 0 it will silently fail (or throw in strict mode). This is exactly what you want for physical constants.
Every value maps directly to a formula in your PDF — I've left comments pointing back to the source so your professor can trace them.
 move on to physics/BallState.js.

 */