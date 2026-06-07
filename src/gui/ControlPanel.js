// gui/ControlPanel.js
// Builds the parameter control panel using lil-gui.
// All sliders map directly to physical parameters from the PDF.
// This file only reads user input and calls callbacks —
// it has zero knowledge of physics or Three.js internals.

import GUI from 'lil-gui';

class ControlPanel {

  constructor() {
    this.gui    = null;

    // All controllable parameters with their default values
    // Units match the PDF equations exactly
    this.params = {

      // --- Launch parameters (PDF section 3) ---
      swingSpeed:  50.0,    // m/s   — ball launch speed v₀
      launchAngle: 15.0,    // deg   — launch angle θ above horizontal
      backspin:    3000,    // RPM   — backspin ωz (positive = backspin = lift)
      sidespin:    0,       // RPM   — hook/slice ωy (positive = slice right)

      // --- Environment (PDF section 4.4) ---
      windSpeed:   0.0,     // m/s   — wind speed magnitude
      windAngle:   0.0,     // deg   — wind direction (0 = headwind, 90 = crosswind right)

      // --- Course (PDF section 7) ---
      slopeAngle:  0.0,     // deg   — green slope angle θ (Cross 2024)

      // --- Simulation ---
      showTrail:   true,    // toggle trajectory trail visibility

    };

    // Callbacks — set by main.js after construction
    this.onLaunch     = null;   // called when Launch button is clicked
    this.onParamChange = null;  // called when any slider changes
  }

  // ------------------------------------------------------------------
  // init()
  // Called once from main.js.
  // Builds the lil-gui panel with all sliders grouped by category.
  // ------------------------------------------------------------------
  init() {

    this.gui = new GUI({ title: 'Golf Simulation Controls' });
    this.gui.domElement.style.zIndex = '1000';

    // --- Launch parameters folder ---
    const launchFolder = this.gui.addFolder('Launch Parameters');

    launchFolder.add(this.params, 'swingSpeed', 10, 90, 0.5)
      .name('Swing Speed (m/s)')
      .onChange(() => this._onParamChange());

    launchFolder.add(this.params, 'launchAngle', 1, 45, 0.5)
      .name('Launch Angle (°)')
      .onChange(() => this._onParamChange());

    launchFolder.add(this.params, 'backspin', -3000, 8000, 100)
      .name('Backspin (RPM)')
      .onChange(() => this._onParamChange());

    launchFolder.add(this.params, 'sidespin', -3000, 3000, 100)
      .name('Sidespin (RPM)')
      .onChange(() => this._onParamChange());

    launchFolder.open();

    // --- Environment folder ---
    const envFolder = this.gui.addFolder('Environment');

    envFolder.add(this.params, 'windSpeed', 0, 20, 0.5)
      .name('Wind Speed (m/s)')
      .onChange(() => this._onParamChange());

    envFolder.add(this.params, 'windAngle', 0, 360, 1)
      .name('Wind Direction (°)')
      .onChange(() => this._onParamChange());

    envFolder.open();

    // --- Course folder ---
    const courseFolder = this.gui.addFolder('Course');

    courseFolder.add(this.params, 'slopeAngle', 0, 10, 0.1)
      .name('Green Slope (°)')
      .onChange(() => this._onParamChange());

    courseFolder.open();

    // --- Simulation folder ---
    const simFolder = this.gui.addFolder('Simulation');

    simFolder.add(this.params, 'showTrail')
      .name('Show Trail')
      .onChange((value) => {
        if (this.onTrailToggle) this.onTrailToggle(value);
      });

    simFolder.open();

    // --- Launch button ---
    // Placed outside folders so it is always visible at the top
    this.gui.add({ launch: () => this._onLaunch() }, 'launch')
      .name('▶  Launch Ball');

  }

  // ------------------------------------------------------------------
  // _onLaunch()
  // Validates parameters, converts units, and fires the onLaunch callback.
  // Unit conversions happen here — physics layer always receives SI units.
  //
  // Wind vector decomposition:
  //   windAngle = 0°   → headwind  (negative X — opposing forward motion)
  //   windAngle = 90°  → crosswind right (positive Z)
  //   windAngle = 180° → tailwind  (positive X — helping forward motion)
  //   windAngle = 270° → crosswind left  (negative Z)
  // ------------------------------------------------------------------
  _onLaunch() {

    const p = this.params;

    // Clamp all values to physical limits before sending to physics
    const v0          = Math.max(1,  Math.min(90,   p.swingSpeed));
    const angleDeg    = Math.max(1,  Math.min(45,   p.launchAngle));
    const spinRpm     = Math.max(-3000, Math.min(8000, p.backspin));
    const spinAxisY   = Math.max(-3000, Math.min(3000, p.sidespin));
    const slopeAngle  = Math.max(0,  Math.min(10,   p.slopeAngle));

    // Wind vector decomposition (PDF section 4.4)
    const windRad = (p.windAngle * Math.PI) / 180;
    const wind = {
      vx: -p.windSpeed * Math.cos(windRad),   // headwind opposes X motion
      vy:  0,
      vz:  p.windSpeed * Math.sin(windRad),   // crosswind on Z axis
    };

    // Assembled launch params — all in SI units
    const launchParams = {
      v0,
      angleDeg,
      spinRpm,
      spinAxisY,
      slopeAngle,
      wind,
    };

    if (this.onLaunch) this.onLaunch(launchParams);

  }

  // ------------------------------------------------------------------
  // _onParamChange()
  // Fires whenever any slider moves — notifies main.js.
  // main.js uses this to update environment settings in real time
  // (wind, slope) without requiring a full relaunch.
  // ------------------------------------------------------------------
  _onParamChange() {
    if (this.onParamChange) this.onParamChange(this.params);
  }

  // ------------------------------------------------------------------
  // setCallbacks()
  // Called by main.js immediately after init() to wire up responses.
  // Keeps ControlPanel decoupled — it fires events, main.js decides
  // what to do with them.
  // ------------------------------------------------------------------
  setCallbacks({ onLaunch, onParamChange, onTrailToggle }) {
    this.onLaunch      = onLaunch;
    this.onParamChange = onParamChange;
    this.onTrailToggle = onTrailToggle;
  }

}

export default ControlPanel;


/*

The wind decomposition in _onLaunch() is directly from PDF section 4.4.
A single wind speed and angle from the GUI is decomposed into the { vx, vy, vz } vector that Forces.drag() expects.
The sign convention — headwind opposing X motion, crosswind on Z — matches the coordinate system used throughout the physics layer.

All unit conversions happen here and only here.
ControlPanel receives RPM from the slider and converts nothing — it passes RPM directly.
BallState.init() converts RPM to rad/s.
This way the conversion is always in one place and the GUI always shows human-readable units.

The clamping in _onLaunch() is the input validation mentioned in the architecture review — it runs silently before any physics sees the values.
No separate validator class needed, just five Math.max/min calls.
setCallbacks() is the decoupling pattern — ControlPanel fires events, main.js decides what to do with them.

ControlPanel never calls physicsEngine.step() or ballMesh.sync() directly.
This keeps the GUI layer completely ignorant of how the engine works

*/