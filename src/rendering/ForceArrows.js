// rendering/ForceArrows.js
// Draws real-time force/kinematics vectors as 3D arrows anchored to the
// ball: what's actually pushing it around as it flies, plus its current
// velocity and spin axis.
//
// Every arrow is built from the exact same gravity()/drag()/magnus()
// functions PhysicsEngine.step() calls — this is not a separate
// approximation for display purposes, it's the literal force the
// integrator used that step.
//
// Aerodynamic forces (gravity/drag/magnus) are only shown during the
// 'flying' phase, because that's the only phase PhysicsEngine actually
// applies them in — CollisionHandler's bounce/roll model uses restitution
// and friction impulses instead. Showing an aerodynamic drag arrow while
// the ball is rolling would be showing a number that isn't influencing
// the simulation, which would be misleading rather than informative.
//
// Arrow lengths are NOT physically to-scale relative to each other —
// velocity (m/s), spin (rad/s), and force (N) are different units
// entirely and span very different ranges. Each quantity has its own
// length scale + clamp chosen so it's visible without swallowing the
// ball. The three force arrows (gravity/drag/magnus) DO share one scale,
// so their lengths ARE meaningfully comparable to each other.

import * as THREE from 'three';
import CONSTANTS from '../constants.js';
import { gravity, drag, magnus } from '../physics/Forces.js';

export const ARROW_COLORS = {
  velocity: 0xffdd00, // yellow — kinematic, not a force
  spin:     0xff00ff, // magenta — angular velocity axis
  gravity:  0x4488ff, // blue
  drag:     0xff3333, // red
  magnus:   0x33ff88, // green — lift/curve
};

// length = clamp(magnitude * k, min, max), all in meters
const SCALE = {
  velocity: { k: 0.035, min: 0.15, max: 3.5 },  // m/s  -> m
  spin:     { k: 0.004, min: 0.15, max: 2.5 },  // rad/s -> m
  force:    { k: 1.8,   min: 0.15, max: 2.5 },  // N     -> m (shared by gravity/drag/magnus)
};

class ForceArrows {

  constructor() {
    this.group   = new THREE.Group();
    this.arrows  = {};
    this.visible = true;
    this._v      = new THREE.Vector3(); // scratch, avoid per-frame GC
  }

  init(scene) {
    const zero = new THREE.Vector3();
    const dir  = new THREE.Vector3(1, 0, 0);

    this.arrows.velocity = new THREE.ArrowHelper(dir, zero, 1, ARROW_COLORS.velocity);
    this.arrows.spin     = new THREE.ArrowHelper(dir, zero, 1, ARROW_COLORS.spin);
    this.arrows.gravity  = new THREE.ArrowHelper(dir, zero, 1, ARROW_COLORS.gravity);
    this.arrows.drag     = new THREE.ArrowHelper(dir, zero, 1, ARROW_COLORS.drag);
    this.arrows.magnus   = new THREE.ArrowHelper(dir, zero, 1, ARROW_COLORS.magnus);

    for (const a of Object.values(this.arrows)) this.group.add(a);
    scene.add(this.group);
  }

  _setArrow(arrow, x, y, z, scaleCfg) {
    const mag = Math.sqrt(x * x + y * y + z * z);
    if (mag < 1e-6) { arrow.visible = false; return mag; }
    arrow.visible = true;
    const len = Math.min(scaleCfg.max, Math.max(scaleCfg.min, mag * scaleCfg.k));
    this._v.set(x, y, z).normalize();
    arrow.setDirection(this._v);
    arrow.setLength(len, len * 0.28, len * 0.16);
    return mag;
  }

  // state: BallState (live) or a recorded snapshot (replay) — either
  // works since both expose the same x/y/z/vx/vy/vz/wx/wy/wz/phase shape.
  // wind: { vx, vy, vz } — needed because drag()/magnus() act on
  // velocity relative to the air, not the ball's absolute velocity.
  update(state, wind) {
    if (!this.visible) { this.group.visible = false; return { isFlying: false }; }
    this.group.visible = true;
    this.group.position.set(state.x, state.y + CONSTANTS.RADIUS, state.z);

    this._setArrow(this.arrows.velocity, state.vx, state.vy, state.vz, SCALE.velocity);
    this._setArrow(this.arrows.spin,     state.wx, state.wy, state.wz, SCALE.spin);

    const isFlying = state.phase === 'flying';
    this.arrows.gravity.visible = isFlying;
    this.arrows.drag.visible    = isFlying;
    this.arrows.magnus.visible  = isFlying;

    if (!isFlying) return { isFlying: false, gravity: null, drag: null, magnus: null };

    const g = gravity();
    const d = drag(state, wind);
    const m = magnus(state, wind);

    this._setArrow(this.arrows.gravity, g.fx, g.fy, g.fz, SCALE.force);
    this._setArrow(this.arrows.drag,    d.fx, d.fy, d.fz, SCALE.force);
    this._setArrow(this.arrows.magnus,  m.fx, m.fy, m.fz, SCALE.force);

    return { isFlying: true, gravity: g, drag: d, magnus: m };
  }

  show() { this.visible = true; }
  hide() { this.visible = false; this.group.visible = false; }
}

export default ForceArrows;
