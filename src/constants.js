// constants.js
const CONSTANTS = Object.freeze({
  MASS:            0.04593,
  RADIUS:          0.02133,
  AREA:            0.00143,
  AIR_DENSITY:     1.225,
  CD:              0.22,
  MAGNUS_S:        0.000005,
  GRAVITY:         9.806,
  MU_FRICTION:     0.40,
  MU_ROLL:         0.10,
  RESTITUTION_A:   0.510,
  RESTITUTION_B:   0.0375,
  RESTITUTION_C:   0.000903,
  RESTITUTION_MIN: 0.120,
  ROLL_THRESHOLD:  0.005,
  // Rolling-resistance coefficients, tuned to realistic golf roll-out
  // distances (roll ≈ 10-25% of carry on fairway, not 60%+). The previous
  // values (e.g. 0.065 for fairway) were far below published rolling
  // friction figures for turf and let the ball roll for tens of extra
  // metres without meaningfully slowing down.
  MU_ROLL_GREEN:   0.10,
  MU_ROLL_FRINGE:  0.14,
  MU_ROLL_FAIRWAY: 0.19,
  MU_ROLL_TEE:     0.19,
  MU_ROLL_ROUGH:   0.32,
  MU_ROLL_SAND:    0.50,
  MU_ROLL_WATER:   1.000,
  SURFACE_ROUGH:   0,
  SURFACE_FAIRWAY: 1,
  SURFACE_GREEN:   2,
  SURFACE_TEE:     3,
  SURFACE_SAND:    4,
  SURFACE_WATER:   5,
  SURFACE_FRINGE:  6,
  FIXED_DT:        0.01,
  COURSE_SIZE:     450,
  MIN_SPEED:       0.01,
});

export default CONSTANTS;
