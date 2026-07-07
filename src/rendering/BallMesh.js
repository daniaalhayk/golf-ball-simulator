// rendering/BallMesh.js
// Creates the golf ball mesh and syncs it with BallState every frame.

import * as THREE from 'three';
import CONSTANTS from '../constants.js';

// The ball's true physics radius (0.02133 m) is barely a few pixels on
// screen at golf-course scale — good for accurate drag/spin physics, bad
// for actually seeing the ball. Rendering uses an exaggerated radius;
// every physics calculation (drag area, spin-to-roll, etc.) keeps using
// CONSTANTS.RADIUS untouched. Exported so other rendering modules
// (aim arrow height, trail height, golfer's club) can line up with the
// ball's actual on-screen size instead of assuming the true tiny radius.
export const VISUAL_RADIUS = CONSTANTS.RADIUS * 3.5;

class BallMesh {

  constructor() {
    this.mesh       = null;
    this.shadowMesh = null;
    this.scene      = null;
  }

  init(scene) {
    this.scene = scene;
    this._buildBall();
    this._buildShadow();
  }

  _buildBall() {
    const geo = new THREE.SphereGeometry(VISUAL_RADIUS, 48, 48);
    this._applyDimples(geo, VISUAL_RADIUS);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.35, metalness: 0.0, envMapIntensity: 0.8,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow    = true;
    this.mesh.receiveShadow = false;
    this.mesh.position.set(0, VISUAL_RADIUS, 0);
    this.scene.add(this.mesh);
  }

  // Real geometric dimples (vertex displacement), not a bump map — a bump
  // map only fakes shading and was nearly invisible except under exactly
  // the right light angle. Displacing actual vertices reads as dimples
  // from any angle/lighting, same as the real 300-500 dimples on a ball.
  // Centers are placed with a Fibonacci-sphere distribution for even
  // coverage (no pole clustering/gaps like a naive lat/long grid gives).
  _applyDimples(geometry, radius) {
    const DIMPLE_COUNT = 330;
    const DIMPLE_ANGLE  = 0.10;           // angular radius of each dimple (rad)
    const DIMPLE_DEPTH  = radius * 0.05;  // ~5% of radius — clearly visible

    const centers = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < DIMPLE_COUNT; i++) {
      const y = 1 - (i / (DIMPLE_COUNT - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = golden * i;
      centers.push(new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r));
    }

    const pos = geometry.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize();

      let minAngle = Infinity;
      for (const c of centers) {
        const angle = v.angleTo(c);
        if (angle < minAngle) minAngle = angle;
        if (minAngle < 1e-6) break;
      }

      let r = radius;
      if (minAngle < DIMPLE_ANGLE) {
        const t = 1 - minAngle / DIMPLE_ANGLE;              // 1 at center, 0 at rim
        r -= DIMPLE_DEPTH * (t * t * (3 - 2 * t));           // smoothstep falloff
      }
      pos.setXYZ(i, v.x * r, v.y * r, v.z * r);
    }

    pos.needsUpdate = true;
    geometry.computeVertexNormals();
  }

  _buildShadow() {
    const geo = new THREE.CircleGeometry(VISUAL_RADIUS * 2.2, 16);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false,
    });
    this.shadowMesh = new THREE.Mesh(geo, mat);
    this.shadowMesh.rotation.x = -Math.PI / 2;
    this.scene.add(this.shadowMesh);
  }

  // ------------------------------------------------------------------
  // sync()
  // Only transfer point between physics and rendering.
  // Shadow Y must track state.y (terrain height) to prevent the
  // "floating ball" appearance when terrain is non-zero.
  // ------------------------------------------------------------------
  sync(state) {
    // Ball sits on top of the terrain surface — rendered at VISUAL_RADIUS
    // so its (exaggerated) bottom still touches state.y exactly, instead
    // of floating/sinking by the visual-vs-physics radius difference.
    this.mesh.position.set(state.x, state.y + VISUAL_RADIUS, state.z);

    // Roll the ball visually based on ground speed. Uses the true physics
    // radius (not VISUAL_RADIUS) so the spin rate matches real RPM — the
    // bigger rendered sphere rolling at the "correct" surface speed for
    // its true size looks right; scaling this by VISUAL_RADIUS would make
    // it spin visibly slower than the backspin numbers say it should.
    const speed = Math.sqrt(state.vx ** 2 + state.vz ** 2);
    if (speed > 0.01) {
      const axisX = -state.vz / speed;
      const axisZ =  state.vx / speed;
      const rollRate = speed / CONSTANTS.RADIUS;
      this.mesh.rotateOnWorldAxis(
        new THREE.Vector3(axisX, 0, axisZ).normalize(),
        rollRate * CONSTANTS.FIXED_DT
      );
    }

    // Shadow follows terrain height — critical fix for "floating" appearance.
    // state.y is the terrain height at ball position; shadow sits 2 cm above it.
    const shadowY = state.y + 0.02;
    this.shadowMesh.position.set(state.x, shadowY, state.z);

    // Shadow shrinks and fades as ball rises above terrain
    const ballAboveGnd  = Math.max(0, this.mesh.position.y - shadowY);
    const shadowScale   = Math.max(0.1, 1 - ballAboveGnd * 0.05);
    const shadowOpacity = Math.max(0,   0.25 - ballAboveGnd * 0.01);
    this.shadowMesh.scale.setScalar(shadowScale);
    this.shadowMesh.material.opacity = shadowOpacity;
  }

  reset() {
    this.mesh.position.set(0, VISUAL_RADIUS, 0);
    this.shadowMesh.position.set(0, 0.02, 0);
    this.shadowMesh.scale.setScalar(1);
    this.shadowMesh.material.opacity = 0.25;
  }

}

export default BallMesh;
