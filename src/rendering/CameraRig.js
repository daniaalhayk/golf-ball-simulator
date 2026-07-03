// rendering/CameraRig.js
// Mixed camera mode:
//   - OrbitControls handles all mouse input (rotate, zoom, pan)
//   - Target is updated every frame to follow the ball
//   - On reset, camera snaps behind the aim direction

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

class CameraRig {

  constructor() {
    this.camera        = null;
    this.controls      = null;
    this._resetPending = false;
    this._pendingAimDeg = 0;
  }

  init(camera, rendererDomElement) {
    this.camera = camera;
    this.camera.position.set(-10, 6, 0);

    this.controls = new OrbitControls(camera, rendererDomElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance   = 0.5;
    this.controls.maxDistance   = 400;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  update(state) {
    if (this._resetPending) {
      // Position camera behind the ball in the opposite of aim direction
      const aimRad = (this._pendingAimDeg * Math.PI) / 180;
      const dist   = 10;
      const camX   = -dist * Math.cos(aimRad);
      const camZ   = -dist * Math.sin(aimRad);

      this.controls.target.set(0, 0, 0);
      this.camera.position.set(camX, 6, camZ);
      this.controls.update();
      this._resetPending = false;
      return;
    }

    this.controls.target.set(state.x, state.y, state.z);
    this.controls.update();
  }

  // aimDeg — the launch aim direction; camera positions itself behind it
  reset(aimDeg = 0) {
    this._pendingAimDeg = aimDeg;
    this._resetPending  = true;
  }

}

export default CameraRig;
