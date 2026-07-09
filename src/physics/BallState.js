import CONSTANTS from '../constants.js';

class BallState {

  constructor() {
    this.x  = 0; this.y  = 0; this.z  = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.wx = 0; this.wy = 0; this.wz = 0;
    this.phase = 'idle';
    this.time  = 0;
  }

  // ------------------------------------------------------------------
  // init()
  // Called once when the user launches a shot.
  //
  // params = { v0, angleDeg, spinRpm, spinAxisY, aimDeg }
  //   v0        — launch speed (m/s)
  //   angleDeg  — launch angle above horizontal (degrees)
  //   spinRpm   — backspin in RPM (positive = backspin = lift)
  //   spinAxisY — hook/slice spin in RPM (positive = slice right)
  //   aimDeg    — horizontal aim direction (degrees, 0 = +X, 90 = +Z)
  //
  // Aim direction decomposition:
  //   The ball always launches from (0,0,0).
  //   aimDeg rotates the forward direction around the Y axis.
  //   0°   → fires along +X (original default)
  //   90°  → fires along +Z
  //   -90° → fires along -Z
  //   180° → fires along -X
  //
  // Spin axis rotation:
  //   Backspin axis must be perpendicular to the aim direction
  //   in the horizontal plane — not always +Z.
  //   For aimDeg=0:   backspin axis = +Z  (wx=0,  wz=ω)
  //   For aimDeg=90:  backspin axis = -X  (wx=-ω, wz=0)
  //   General:        wx = -ω·sin(aim),   wz = ω·cos(aim)
  //   Hook/slice spin is always about the world Y axis (wy), independent of aim.
  // ------------------------------------------------------------------
  init(params) {
    const { v0, angleDeg, spinRpm, spinAxisY = 0, aimDeg = 0 } = params;

    const angleRad = (angleDeg * Math.PI) / 180;
    const aimRad   = (aimDeg   * Math.PI) / 180;

    this.x = 0; this.y = 0; this.z = 0;

    // Horizontal speed
    const hSpeed = v0 * Math.cos(angleRad);

    // Velocity decomposed into aim direction
    this.vx = hSpeed * Math.cos(aimRad);
    this.vy = v0     * Math.sin(angleRad);
    this.vz = hSpeed * Math.sin(aimRad);

    // Spin: convert RPM → rad/s, then rotate backspin axis with aim
    const spinOmega = (spinRpm   * 2 * Math.PI) / 60;
    const sideOmega = (spinAxisY * 2 * Math.PI) / 60;

    this.wx = -spinOmega * Math.sin(aimRad);  // backspin x-component
    this.wy =  sideOmega;                      // hook/slice = always world-Y
    this.wz =  spinOmega * Math.cos(aimRad);  // backspin z-component

    this.phase = 'flying';
    this.time  = 0;
  }

  clone() {
    return {
      x: this.x, y: this.y, z: this.z,
      vx: this.vx, vy: this.vy, vz: this.vz,
      wx: this.wx, wy: this.wy, wz: this.wz,
      phase: this.phase, time: this.time,
    };
  }

  reset() {
    this.x  = 0; this.y  = 0; this.z  = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.wx = 0; this.wy = 0; this.wz = 0;
    this.phase = 'idle';
    this.time  = 0;
  }

  speed() {
    return Math.sqrt(this.vx ** 2 + this.vy ** 2 + this.vz ** 2);
  }

  isFinite() {
    return (
      Number.isFinite(this.x)  && Number.isFinite(this.y)  && Number.isFinite(this.z)  &&
      Number.isFinite(this.vx) && Number.isFinite(this.vy) && Number.isFinite(this.vz)
    );
  }

}

export default BallState;
