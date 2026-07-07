// rendering/TrailRenderer.js
// Draws the trajectory trail behind the ball in real time.
// Records position snapshots from BallState and renders them
// as a continuous line using THREE.BufferGeometry.
// Imports: Three.js only.

import * as THREE from 'three';
import { VISUAL_RADIUS } from './BallMesh.js';

class TrailRenderer {

  constructor() {
    this.line       = null;     // THREE.Line object
    this.geometry   = null;     // BufferGeometry holding position data
    this.positions  = [];       // raw snapshot array: [{x, y, z}, ...]
    this.maxPoints  = 2000;     // max trail length before oldest points drop
  }

  // ------------------------------------------------------------------
  // init()
  // Called once from main.js.
  // Pre-allocates the BufferGeometry with maxPoints capacity.
  // Pre-allocation is important — resizing a BufferGeometry every frame
  // is expensive. We allocate once and only update the drawn range.
  // ------------------------------------------------------------------
  init(scene) {
    this.scene = scene;
    this._landingIndex = null;   // index of first non-'flying' point (true landing spot)

    // Pre-allocate buffer — 3 floats (x, y, z) per point
    const buffer = new Float32Array(this.maxPoints * 3);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(buffer, 3)
    );

    // Start with zero points drawn
    this.geometry.setDrawRange(0, 0);

    // Trail material — bright yellow line, visible against green course
    const material = new THREE.LineBasicMaterial({
      color:       0xffdd00,
      linewidth:   1,          // note: linewidth > 1 only works in WebGL1
      transparent: true,
      opacity:     0.85,
    });

    this.line = new THREE.Line(this.geometry, material);
    this.line.frustumCulled = false;   // never cull — trail spans large distances

    this.scene.add(this.line);

  }

  // ------------------------------------------------------------------
  // record()
  // Called every frame from main.js during flight and rolling phases.
  // Pushes the current ball position into the snapshot array,
  // then updates the GPU buffer with the new point.
  // ------------------------------------------------------------------
  record(state) {

    // Skip duplicate points — no movement, no new point needed
    if (this.positions.length > 0) {
      const last = this.positions[this.positions.length - 1];
      const dx   = state.x - last.x;
      const dy   = state.y - last.y;
      const dz   = state.z - last.z;
      if (dx * dx + dy * dy + dz * dz < 0.0001) return;
    }

    // If buffer is full, remove oldest point (sliding window)
    if (this.positions.length >= this.maxPoints) {
      this.positions.shift();
      if (this._landingIndex !== null) this._landingIndex--;
    }

    // The first point where the ball is no longer 'flying' is the true
    // landing spot — real golf distinguishes Carry (tee to landing) from
    // Total (tee to final rest, after roll).
    if (this._landingIndex === null && state.phase !== 'flying') {
      this._landingIndex = this.positions.length;
    }

    // Record snapshot
    this.positions.push({
      x: state.x,
      y: state.y + VISUAL_RADIUS,   // match ball mesh's rendered (exaggerated) height offset
      z: state.z,
    });

    // Write all positions into the GPU buffer
    this._updateBuffer();

  }

  // ------------------------------------------------------------------
  // _updateBuffer()
  // Writes the positions array into the Float32Array buffer
  // and marks the geometry as needing a GPU upload.
  // ------------------------------------------------------------------
  _updateBuffer() {

    const positionAttribute = this.geometry.attributes.position;
    const array             = positionAttribute.array;

    for (let i = 0; i < this.positions.length; i++) {
      const p      = this.positions[i];
      array[i * 3]     = p.x;
      array[i * 3 + 1] = p.y;
      array[i * 3 + 2] = p.z;
    }

    // Tell Three.js the buffer has changed — triggers GPU re-upload
    positionAttribute.needsUpdate = true;

    // Update draw range to only render the filled portion
    this.geometry.setDrawRange(0, this.positions.length);

  }

  // ------------------------------------------------------------------
  // getStats()
  // Returns trajectory statistics for StatsOverlay.js to display.
  // Computed from the recorded snapshot array — no physics knowledge needed.
  // ------------------------------------------------------------------
  getStats() {

    if (this.positions.length < 2) {
      return { carryDistance: 0, totalDistance: 0, maxHeight: 0, lateralDeviation: 0 };
    }

    let maxHeight = 0;

    for (const p of this.positions) {
      if (p.y > maxHeight) maxHeight = p.y;
    }

    const first = this.positions[0];
    const last  = this.positions[this.positions.length - 1];

    // Total distance — horizontal distance from tee to current/final position
    const totalDistance = Math.sqrt(
      (last.x - first.x) ** 2 +
      (last.z - first.z) ** 2
    );

    // Carry distance — horizontal distance from tee to the true landing
    // spot (first point after 'flying' ends), not the post-roll position.
    let carryDistance = totalDistance;
    if (this._landingIndex !== null && this._landingIndex < this.positions.length) {
      const landing = this.positions[this._landingIndex];
      carryDistance = Math.sqrt(
        (landing.x - first.x) ** 2 +
        (landing.z - first.z) ** 2
      );
    }

    // Lateral deviation — how far left/right the ball finished (Z axis)
    const lateralDeviation = last.z - first.z;

    return {
      carryDistance:    Math.round(carryDistance),        // m
      totalDistance:    Math.round(totalDistance),         // m
      maxHeight:        Math.round(maxHeight * 10) / 10,   // m (1 decimal)
      lateralDeviation: Math.round(lateralDeviation * 10) / 10, // m
    };

  }

  // ------------------------------------------------------------------
  // reset()
  // Clears the trail. Called before each new launch.
  // ------------------------------------------------------------------
  reset() {

    this.positions = [];
    this._landingIndex = null;
    this.geometry.setDrawRange(0, 0);

    // Zero out the buffer to avoid ghost points from previous shots
    const array = this.geometry.attributes.position.array;
    array.fill(0);
    this.geometry.attributes.position.needsUpdate = true;

  }

}

export default TrailRenderer;

/*
The pre-allocated Float32Array of maxPoints * 3 is the most important performance decision in this file. Three.js BufferGeometry cannot be resized after creation — if you push new points by recreating the geometry each frame the GPU has to re-upload the entire mesh every frame, which will tank your framerate. Pre-allocating 2000 points and using setDrawRange() to control how many are actually rendered costs nothing for the unused slots.
frustumCulled = false is mandatory for the trail. Three.js normally skips rendering objects outside the camera's view frustum — but the trail's bounding box starts at the origin and grows dynamically, so Three.js can't compute it correctly and will incorrectly cull the line. Disabling culling tells Three.js to always render it.
The duplicate point check (dx² + dy² + dz² < 0.0001) prevents the buffer from filling up with identical points when the ball is nearly stationary during the rolling phase — only meaningful movement generates a new point.
getStats() lives here rather than in a separate file because TrailRenderer already holds the full position history — computing carry distance, max height, and lateral deviation from that array costs nothing and avoids passing data around unnecessarily.

*/