// gui/ControlPanel.js
// Parameter control panel using lil-gui.
// Fires onLaunch and onParamChange callbacks only — no physics knowledge.

import GUI from 'lil-gui';

class ControlPanel {

  constructor() {
    this.gui    = null;
    this.params = {
      // Launch
      swingSpeed:    50.0,
      launchAngle:   15.0,
      backspin:      3000,
      sidespin:      0,
      aimDeg:        0,       // horizontal aim direction (degrees, 0 = +X)
      // Environment
      windSpeed:     0.0,
      windAngle:     0.0,
      // Course
      holeNumber:    1,
      slopeAngle:    0.0,
      landscapeType: 'parkland',
      // Sim
      showTrail:     true,
    };

    this.onLaunch      = null;
    this.onParamChange = null;
    this.onTrailToggle = null;
  }

  init() {
    this.gui = new GUI({ title: 'Golf Simulation' });
    this.gui.domElement.style.zIndex = '1000';

    // --- Launch folder ---
    const launch = this.gui.addFolder('Launch Parameters');

    launch.add(this.params, 'swingSpeed', 10, 90, 0.5)
      .name('Swing Speed (m/s)')
      .onChange(() => this._onParamChange());

    launch.add(this.params, 'launchAngle', 1, 45, 0.5)
      .name('Launch Angle (°)')
      .onChange(() => this._onParamChange());

    launch.add(this.params, 'backspin', -3000, 8000, 100)
      .name('Backspin (RPM)')
      .onChange(() => this._onParamChange());

    launch.add(this.params, 'sidespin', -3000, 3000, 100)
      .name('Sidespin (RPM)')
      .onChange(() => this._onParamChange());

    launch.add(this.params, 'aimDeg', -180, 180, 1)
      .name('Aim Direction (°)')
      .onChange(() => this._onParamChange());

    launch.open();

    // --- Environment folder ---
    const env = this.gui.addFolder('Environment');

    env.add(this.params, 'windSpeed', 0, 20, 0.5)
      .name('Wind Speed (m/s)')
      .onChange(() => this._onParamChange());

    env.add(this.params, 'windAngle', 0, 360, 1)
      .name('Wind Direction (°)')
      .onChange(() => this._onParamChange());

    env.open();

    // --- Course folder ---
    const course = this.gui.addFolder('Course');

    course.add(this.params, 'holeNumber', Array.from({ length: 18 }, (_, i) => i + 1))
      .name('Hole')
      .onChange(() => this._onParamChange());

    course.add(this.params, 'landscapeType', ['parkland', 'links', 'heathland', 'desert'])
      .name('Landscape')
      .onChange(() => this._onParamChange());

    course.add(this.params, 'slopeAngle', 0, 10, 0.1)
      .name('Green Slope (°)')
      .onChange(() => this._onParamChange());

    course.open();

    // --- Simulation ---
    const sim = this.gui.addFolder('Simulation');
    sim.add(this.params, 'showTrail')
      .name('Show Trail')
      .onChange((v) => { if (this.onTrailToggle) this.onTrailToggle(v); });
    sim.open();

    // Launch button
    this.gui.add({ launch: () => this._onLaunch() }, 'launch')
      .name('▶  Launch Ball');
  }

  _onLaunch() {
    const p = this.params;

    const windRad = (p.windAngle * Math.PI) / 180;
    const wind = {
      vx: -p.windSpeed * Math.cos(windRad),
      vy:  0,
      vz:  p.windSpeed * Math.sin(windRad),
    };

    if (this.onLaunch) this.onLaunch({
      v0:        Math.max(1,     Math.min(90,   p.swingSpeed)),
      angleDeg:  Math.max(1,     Math.min(45,   p.launchAngle)),
      spinRpm:   Math.max(-3000, Math.min(8000, p.backspin)),
      spinAxisY: Math.max(-3000, Math.min(3000, p.sidespin)),
      aimDeg:    p.aimDeg,
      slopeAngle: Math.max(0,   Math.min(10,   p.slopeAngle)),
      wind,
    });
  }

  _onParamChange() {
    if (this.onParamChange) this.onParamChange(this.params);
  }

  setCallbacks({ onLaunch, onParamChange, onTrailToggle }) {
    this.onLaunch      = onLaunch;
    this.onParamChange = onParamChange;
    this.onTrailToggle = onTrailToggle;
  }

}

export default ControlPanel;
