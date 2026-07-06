// rendering/BallMesh.js
// Creates the golf ball mesh and syncs it with BallState every frame.

import * as THREE from 'three';
import CONSTANTS from '../constants.js';

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
    const geo = new THREE.SphereGeometry(CONSTANTS.RADIUS, 48, 48);
    const bumpMap = this._createDimpleTexture();
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.35, metalness: 0.0, envMapIntensity: 0.8,
      bumpMap, bumpScale: 0.0006,   // real dimples are ~0.3-0.5mm deep
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow    = true;
    this.mesh.receiveShadow = false;
    this.mesh.position.set(0, CONSTANTS.RADIUS, 0);
    this.scene.add(this.mesh);
  }

  // Procedural dimple pattern baked into a bump map — real golf balls have
  // 300-500 dimples; drawing them on the sphere's own equirectangular UVs
  // avoids downloading/licensing an external textured ball model.
  _createDimpleTexture() {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size / 2;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const rows = 22;
    const dimpleR = size / rows / 2.1;
    for (let row = 0; row < rows; row++) {
      const y = (row + 0.5) * (canvas.height / rows);
      const cols = Math.round(rows * 2 * Math.sin((row + 0.5) / rows * Math.PI));
      const offset = (row % 2) * (canvas.width / cols / 2);
      for (let col = 0; col < cols; col++) {
        const x = offset + (col + 0.5) * (canvas.width / cols);
        const grad = ctx.createRadialGradient(x, y, 0, x, y, dimpleR);
        grad.addColorStop(0,   '#4a4a4a');
        grad.addColorStop(0.8, '#707070');
        grad.addColorStop(1,   '#808080');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, dimpleR, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
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
  // Only transfer point between physics and rendering.
  // Shadow Y must track state.y (terrain height) to prevent the
  // "floating ball" appearance when terrain is non-zero.
  // ------------------------------------------------------------------
  sync(state) {
    // Ball sits on top of the terrain surface
    this.mesh.position.set(state.x, state.y + CONSTANTS.RADIUS, state.z);

    // Roll the ball visually based on ground speed
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
    const airHeight     = Math.max(0, (state.y + CONSTANTS.RADIUS) - state.y);
    const ballAboveGnd  = Math.max(0, this.mesh.position.y - shadowY);
    const shadowScale   = Math.max(0.1, 1 - ballAboveGnd * 0.05);
    const shadowOpacity = Math.max(0,   0.25 - ballAboveGnd * 0.01);
    this.shadowMesh.scale.setScalar(shadowScale);
    this.shadowMesh.material.opacity = shadowOpacity;
  }

  reset() {
    this.mesh.position.set(0, CONSTANTS.RADIUS, 0);
    this.shadowMesh.position.set(0, 0.02, 0);
    this.shadowMesh.scale.setScalar(1);
    this.shadowMesh.material.opacity = 0.25;
  }

}

export default BallMesh;
