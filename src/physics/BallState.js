// physics/BallState.js
// Represents the full physical state of the golf ball at any instant.
// This is the single object that PhysicsEngine reads and writes each step.
// Import: constants only.

import CONSTANTS from '../constants.js';

class BallState {

  constructor() {
    // Position vector (m)
    this.x  = 0;
    this.y  = 0;
    this.z  = 0;

    // Velocity vector (m/s)
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;

    // Angular velocity / spin vector (rad/s)
    // ωz → backspin/topspin (produces Magnus lift on Y axis)
    // ωy → hook/slice spin  (produces Magnus deviation on Z axis)
    // ωx → rarely used, side-tilt
    this.wx = 0;
    this.wy = 0;
    this.wz = 0;

    // Simulation phase
    // 'idle' | 'flying' | 'bouncing' | 'rolling' | 'stopped'
    this.phase = 'idle';

    // Elapsed simulation time (s)
    this.time = 0;
  }

  // ------------------------------------------------------------------
  // init()
  // Called once when the user launches a shot.
  // params = { v0, angleDeg, spinRpm, spinAxisY }
  //   v0         — launch speed (m/s)
  //   angleDeg   — launch angle above horizontal (degrees)
  //   spinRpm    — backspin in RPM (positive = backspin)
  //   spinAxisY  — hook/slice spin in RPM (positive = slice right)
  // ------------------------------------------------------------------
  init(params) {
    const { v0, angleDeg, spinRpm, spinAxisY = 0 } = params;

    const angleRad = (angleDeg * Math.PI) / 180;

    // Section 3 of PDF — launch vector decomposition
    this.x  = 0;
    this.y  = 0;
    this.z  = 0;

    this.vx = v0 * Math.cos(angleRad);  // forward velocity
    this.vy = v0 * Math.sin(angleRad);  // vertical velocity
    this.vz = 0;                         // no lateral velocity at launch

    // Convert RPM → rad/s  (ω = RPM × 2π / 60)
    this.wx = 0;
    this.wy = (spinAxisY * 2 * Math.PI) / 60;  // hook/slice axis
    this.wz = (spinRpm   * 2 * Math.PI) / 60;  // backspin axis

    this.phase = 'flying';
    this.time  = 0;
  }

  // ------------------------------------------------------------------
  // clone()
  // Returns a plain snapshot of the current state.
  // Used by TrailRenderer to record trajectory points.
  // ------------------------------------------------------------------
  clone() {
    return {
      x: this.x, y: this.y, z: this.z,
      vx: this.vx, vy: this.vy, vz: this.vz,
      wx: this.wx, wy: this.wy, wz: this.wz,
      phase: this.phase,
      time: this.time,
    };
  }

  // ------------------------------------------------------------------
  // reset()
  // Returns ball to idle state. Called before each new launch.
  // ------------------------------------------------------------------
  reset() {
    this.x  = 0; this.y  = 0; this.z  = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.wx = 0; this.wy = 0; this.wz = 0;
    this.phase = 'idle';
    this.time  = 0;
  }

  // ------------------------------------------------------------------
  // speed()
  // Returns the scalar speed of the ball (magnitude of velocity vector)
  // ------------------------------------------------------------------
  speed() {
    return Math.sqrt(this.vx ** 2 + this.vy ** 2 + this.vz ** 2);
  }

  // ------------------------------------------------------------------
  // isFinite()
  // NaN guard — returns false if any value has gone invalid.
  // Called by PhysicsEngine after every integration step.
  // ------------------------------------------------------------------
  isFinite() {
    return (
      Number.isFinite(this.x)  &&
      Number.isFinite(this.y)  &&
      Number.isFinite(this.z)  &&
      Number.isFinite(this.vx) &&
      Number.isFinite(this.vy) &&
      Number.isFinite(this.vz)
    );
  }

}

export default BallState; 

/**
A few things to note:
Spin is stored in rad/s internally, not RPM. The conversion happens once in init() — everything downstream works in SI units consistently, which matches your PDF's equations directly.
clone() returns a plain object, not a BallState instance. This is intentional — the trail only needs the numbers, not the methods. It keeps the snapshot lightweight.
The phase string is the simple state machine mentioned earlier — PhysicsEngine and CollisionHandler will read and write this to know which physics regime is currently active.
move to physics/Forces.js 
 */