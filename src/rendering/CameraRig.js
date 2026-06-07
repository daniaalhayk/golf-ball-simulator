// rendering/CameraRig.js
// Mixed camera mode:
//   - OrbitControls handles all mouse input (rotate, zoom, pan)
//   - target is updated every frame to follow the ball
//   - Result: orbit freely around a moving ball
//
// Mouse controls (same as GMAT OrbitView):
//   Left button drag   → rotate around ball
//   Right button drag  → pan (offset view)
//   Scroll wheel       → zoom in/out
//   Middle button drag → pan

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

class CameraRig {

  constructor() {
    this.camera   = null;
    this.controls = null;

    // When true, camera snaps back behind ball (e.g. on new launch)
    this._resetPending = false;
  }

  // ------------------------------------------------------------------
  // init()
  // ------------------------------------------------------------------
  init(camera, rendererDomElement) {
    this.camera = camera;

    // Starting position — behind and above the tee
    this.camera.position.set(-8, 5, 0);

    // OrbitControls attached to the renderer canvas
    this.controls = new OrbitControls(camera, rendererDomElement);

    // Smooth damping — gives the GMAT inertia feel
    this.controls.enableDamping  = true;
    this.controls.dampingFactor  = 0.06;

    // Zoom limits — don't let camera go underground or too far
    this.controls.minDistance    = 0.5;
    this.controls.maxDistance    = 200;

    // Vertical angle limits — prevent flipping under ground
    this.controls.maxPolarAngle  = Math.PI / 2 - 0.05;

    // Start looking at the tee
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  // ------------------------------------------------------------------
  // update(state)
  // Called every frame from main.js.
  // Updates OrbitControls target to ball position, then calls
  // controls.update() to apply damping and mouse input.
  //
  // The camera ANGLE and DISTANCE are owned by OrbitControls (mouse).
  // The camera TARGET is owned by us (ball position).
  // These two concerns are fully independent.
  // ------------------------------------------------------------------
  update(state) {

    if (this._resetPending) {
      // Snap target and camera back to starting position
      this.controls.target.set(0, 0, 0);
      this.camera.position.set(-8, 5, 0);
      this.controls.update();
      this._resetPending = false;
      return;
    }

    // Move orbit target to current ball position
    // OrbitControls will orbit around this point while
    // preserving whatever angle/distance the user has set
    this.controls.target.set(state.x, state.y, state.z);

    // Apply damping + mouse input
    this.controls.update();

  }

  // ------------------------------------------------------------------
  // reset()
  // Called before each new launch.
  // Flags a pending reset — executed on next update() call.
  // ------------------------------------------------------------------
  reset() {
    this._resetPending = true;
  }

}

export default CameraRig;