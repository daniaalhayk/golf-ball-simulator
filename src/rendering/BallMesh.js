// rendering/BallMesh.js
// Creates the golf ball mesh and syncs it with BallState every frame.

import * as THREE from 'three';
import CONSTANTS from '../constants.js';

class BallMesh {

  constructor() {
    this.mesh       = null;
    this.shadowMesh = null;
    this.scene      = null;
    this._spinAxis  = new THREE.Vector3(); // reused each frame, avoid GC churn
  }

  init(scene) {
    this.scene = scene;
    this._buildBall();
    this._buildShadow();
  }

  _buildBall() {
    // Higher segment count than a plain display sphere needs, because the
    // dimples are real vertex displacement, not a texture — enough vertex
    // density is what makes each dimple read as an actual little crater
    // instead of a faceted blob.
    const geo = new THREE.SphereGeometry(CONSTANTS.RADIUS, 64, 64);
    this._applyDimples(geo, CONSTANTS.RADIUS);

    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.35, metalness: 0.0, envMapIntensity: 0.8,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow    = true;
    this.mesh.receiveShadow = false;
    this.mesh.position.set(0, CONSTANTS.RADIUS, 0);
    this.scene.add(this.mesh);
  }

  // ------------------------------------------------------------------
  // _applyDimples()
  // Real geometric dimples (vertex displacement), not a bump/normal map
  // — a texture-based fake only reads correctly under one narrow light
  // angle. Displacing actual vertices reads as dimples from any camera
  // angle or lighting, same as the ~330 physical dimples on a real ball.
  //
  // Centers are placed with a Fibonacci-sphere distribution (golden-angle
  // spiral) so coverage is even across the whole sphere — a naive
  // latitude/longitude grid clusters points at the poles and leaves gaps
  // near the equator.
  //
  // Each dimple is a smooth cosine-profile bowl (0 depth at its rim,
  // full depth at its center) rather than a hard-edged crater, so
  // neighboring dimples blend the way real manufactured dimples do
  // instead of showing visible seams.
  // ------------------------------------------------------------------
  _applyDimples(geometry, radius) {
    const DIMPLE_COUNT = 330;             // real golf balls run ~300-500
    const DIMPLE_ANGLE = 0.11;            // angular radius of each dimple (rad)
    const DIMPLE_DEPTH = radius * 0.045;  // ~4.5% of radius — visible, not cartoonish

    // Fibonacci-sphere distribution of dimple centers (unit vectors).
    const centers = [];
    const golden  = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < DIMPLE_COUNT; i++) {
      const y     = 1 - (i / (DIMPLE_COUNT - 1)) * 2;
      const r     = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = golden * i;
      centers.push(new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r));
    }

    const pos = geometry.attributes.position;
    const v   = new THREE.Vector3();

    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize();

      // Nearest dimple center for this vertex.
      let minAngle = Infinity;
      for (const c of centers) {
        const angle = v.angleTo(c);
        if (angle < minAngle) minAngle = angle;
      }

      if (minAngle < DIMPLE_ANGLE) {
        // Cosine bowl: 1.0 at the dimple's own center, 0.0 at its rim.
        const t     = minAngle / DIMPLE_ANGLE;
        const bowl  = 0.5 * (1 + Math.cos(t * Math.PI));
        const depth = DIMPLE_DEPTH * bowl;
        const newR  = radius - depth;
        pos.setXYZ(i, v.x * newR, v.y * newR, v.z * newR);
      }
    }

    pos.needsUpdate = true;
    geometry.computeVertexNormals(); // required after displacing vertices,
                                      // or lighting will still shade the
                                      // original smooth sphere
  }

  _buildShadow() {
    const geo = new THREE.CircleGeometry(CONSTANTS.RADIUS * 3, 16);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false,
    });
    this.shadowMesh = new THREE.Mesh(geo, mat);
    this.shadowMesh.rotation.x = -Math.PI / 2;
    this.scene.add(this.shadowMesh);
  }

  // ------------------------------------------------------------------
  // sync()
  // Transfer point between physics and rendering.
  //
  // dt is how much real time this visual rotation increment should
  // cover — pass the frame's actual elapsed time during live play (the
  // physics may have taken several fixed sub-steps within it; using the
  // spin at the end of those sub-steps for the whole visual increment is
  // a fine approximation since spin only changes slowly frame-to-frame).
  // Defaults to FIXED_DT for playback scrubbing, where "elapsed time
  // since last render" isn't a meaningful concept (the user just jumped
  // the slider to an arbitrary point).
  //
  // Rotation is now driven by the ball's true angular velocity vector
  // (wx, wy, wz) instead of a ground-speed-derived roll direction. With
  // real dimple geometry the spin is actually visible, so it has to be
  // the real spin — backspin/sidespin in flight, and, since
  // CollisionHandler now enforces the rolling-without-slip constraint
  // every step, wz/wx correctly track ground speed during the roll phase
  // too, so this one code path is correct in every phase without a
  // separate "rolling visual" special case.
  // ------------------------------------------------------------------
  sync(state, dt = CONSTANTS.FIXED_DT) {
    // Ball sits on top of the terrain surface
    this.mesh.position.set(state.x, state.y + CONSTANTS.RADIUS, state.z);

    const wMag = Math.sqrt(state.wx ** 2 + state.wy ** 2 + state.wz ** 2);
    if (wMag > 1e-4) {
      this._spinAxis.set(state.wx, state.wy, state.wz).normalize();
      this.mesh.rotateOnWorldAxis(this._spinAxis, wMag * dt);
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
    this.mesh.position.set(0, CONSTANTS.RADIUS, 0);
    this.mesh.quaternion.identity();
    this.shadowMesh.position.set(0, 0.02, 0);
    this.shadowMesh.scale.setScalar(1);
    this.shadowMesh.material.opacity = 0.25;
  }

}

export default BallMesh;
