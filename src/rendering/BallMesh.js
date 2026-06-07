// rendering/BallMesh.js
// Creates the golf ball 3D mesh and keeps it in sync with BallState.
// Ball radius = CONSTANTS.RADIUS = 0.02133 m (USGA standard).
// Imports: Three.js only — reads BallState values, never imports BallState.

import * as THREE from 'three';
import CONSTANTS from '../constants.js';

class BallMesh {

  constructor() {
    this.mesh        = null;
    this.shadowMesh  = null;   // flat disc shadow on the ground
  }

  // ------------------------------------------------------------------
  // init()
  // Called once from main.js.
  // Creates the ball sphere and its ground shadow disc.
  // ------------------------------------------------------------------
  init(scene) {
    this.scene = scene;

    this._buildBall();
    this._buildShadow();
  }

  // ------------------------------------------------------------------
  // _buildBall()
  // SphereGeometry with USGA regulation radius.
  // Uses MeshPhongMaterial for specular highlight — gives the ball
  // a shiny surface that reacts to the directional sun light.
  // ------------------------------------------------------------------
  _buildBall() {

    const geometry = new THREE.SphereGeometry(
      CONSTANTS.RADIUS,   // radius = 0.02133 m
      32,                 // width segments
      32                  // height segments
    );

    // const material = new THREE.MeshPhongMaterial({
    //   color:     0xffffff,   // white ball
    //   specular:  0xaaaaaa,   // grey specular highlight
    //   shininess: 80,         // moderately shiny surface
    // });

// MeshStandardMaterial — responds correctly to Sky shader lighting
// roughness: 0.3 → slightly rough surface (real golf balls aren't mirror-smooth)
// metalness: 0.0 → not metallic
const material = new THREE.MeshStandardMaterial({
  color:     0xffffff,
  roughness: 0.35,
  metalness: 0.0,
  envMapIntensity: 0.8,
});


    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.castShadow    = true;
    this.mesh.receiveShadow = false;

    // Start at origin (tee position)
    this.mesh.position.set(0, CONSTANTS.RADIUS, 0);

    this.scene.add(this.mesh);

  }

  // ------------------------------------------------------------------
  // _buildShadow()
  // Flat semi-transparent disc projected onto the ground.
  // Scales with ball height to simulate a soft shadow blob.
  // This is much cheaper than computing real shadow maps for a tiny ball.
  // ------------------------------------------------------------------
  _buildShadow() {

    const geometry = new THREE.CircleGeometry(CONSTANTS.RADIUS * 3, 16);
    const material = new THREE.MeshBasicMaterial({
      color:       0x000000,
      transparent: true,
      opacity:     0.25,
      depthWrite:  false,   // prevents shadow from writing to depth buffer
    });

    this.shadowMesh = new THREE.Mesh(geometry, material);
    this.shadowMesh.rotation.x = -Math.PI / 2;
    this.shadowMesh.position.y = 0.01;   // just above ground

    this.scene.add(this.shadowMesh);

  }

  // ------------------------------------------------------------------
  // sync()
  // Called every frame from main.js after PhysicsEngine.step().
  // Reads the current BallState values and updates mesh position.
  // This is the ONLY place that transfers physics data to the renderer.
  // ------------------------------------------------------------------
  sync(state) {

    // Update ball position directly from physics state
    this.mesh.position.set(
      state.x,
      state.y + CONSTANTS.RADIUS,   // offset by radius so ball sits on ground
      state.z
    );

    // Rotate ball mesh based on velocity direction — gives rolling feel
    // Rotation axis is perpendicular to velocity: (-vz, 0, vx) normalized
    const speed = Math.sqrt(state.vx ** 2 + state.vz ** 2);
    if (speed > 0.01) {
      const axisX = -state.vz / speed;
      const axisZ =  state.vx / speed;
      const rollSpeed = speed / CONSTANTS.RADIUS;   // ω = v / r
      this.mesh.rotateOnWorldAxis(
        new THREE.Vector3(axisX, 0, axisZ).normalize(),
        rollSpeed * CONSTANTS.FIXED_DT
      );
    }

    // Shadow follows ball on the ground plane
    this.shadowMesh.position.x = state.x;
    this.shadowMesh.position.z = state.z;

    // Shadow shrinks and fades as ball rises — max effect at ground level
    const height       = Math.max(0, state.y);
    const shadowScale  = Math.max(0.1, 1 - height * 0.02);
    const shadowOpacity = Math.max(0, 0.25 - height * 0.005);
    this.shadowMesh.scale.setScalar(shadowScale);
    this.shadowMesh.material.opacity = shadowOpacity;

  }

  // ------------------------------------------------------------------
  // reset()
  // Returns ball mesh to tee position. Called before each new launch.
  // ------------------------------------------------------------------
  reset() {
    this.mesh.position.set(0, CONSTANTS.RADIUS, 0);
    this.shadowMesh.position.set(0, 0.01, 0);
    this.shadowMesh.scale.setScalar(1);
    this.shadowMesh.material.opacity = 0.25;
  }

}

export default BallMesh;


/*

sync() is the only function in the entire codebase that transfers data from the physics layer to the rendering layer. It reads state.x, state.y, state.z and sets mesh.position — nothing more. This is the clean boundary between your two layers working in practice.
The + CONSTANTS.RADIUS offset in sync() is important — state.y = 0 means the ball is on the ground, but the mesh origin is at its center, so without the offset the ball would be halfway buried in the ground.
The blob shadow is a classic game rendering trick — computing real projected shadows for an object as small as a golf ball is expensive and the result looks identical to a simple scaled disc. The scale and opacity both decrease with height, which gives a convincing depth cue as the ball rises.
The ball rotation uses rotateOnWorldAxis() rather than rotateX() or rotateZ() because the rotation axis needs to be perpendicular to the velocity direction in world space — this correctly handles diagonal shots where the ball moves in both X and Z.

*/