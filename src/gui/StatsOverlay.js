// gui/StatsOverlay.js
// Displays real-time simulation statistics as an HTML overlay.
// Reads data from TrailRenderer.getStats() and BallState.
// No physics knowledge — purely a display module.
// No external libraries — plain HTML/CSS injected into the DOM.

class StatsOverlay {

  constructor() {
    this.container  = null;
    this.elements   = {};     // references to individual stat DOM nodes
    this.visible    = true;
  }

  // ------------------------------------------------------------------
  // init()
  // Called once from main.js.
  // Creates the overlay container and all stat rows via DOM injection.
  // ------------------------------------------------------------------
  init() {

    // --- Inject base CSS ---
    const style = document.createElement('style');
    style.textContent = `
      #stats-overlay {
        position:         fixed;
        bottom:           20px;
        left:             20px;
        background:       rgba(0, 0, 0, 0.65);
        color:            #ffffff;
        font-family:      monospace;
        font-size:        13px;
        line-height:      1.8;
        padding:          14px 18px;
        border-radius:    8px;
        border:           1px solid rgba(255, 255, 255, 0.15);
        backdrop-filter:  blur(6px);
        min-width:        220px;
        pointer-events:   none;
        z-index:          999;
        transition:       opacity 0.3s ease;
      }

      #stats-overlay.hidden {
        opacity: 0;
      }

      .stat-title {
        font-size:      11px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color:          #ffdd00;
        margin-bottom:  6px;
        border-bottom:  1px solid rgba(255, 255, 255, 0.15);
        padding-bottom: 4px;
      }

      .stat-row {
        display:         flex;
        justify-content: space-between;
        gap:             24px;
      }

      .stat-label {
        color: rgba(255, 255, 255, 0.6);
      }

      .stat-value {
        color:       #ffffff;
        font-weight: bold;
        text-align:  right;
      }

      .stat-value.highlight {
        color: #ffdd00;
      }

      .stat-phase {
        margin-top:   6px;
        padding-top:  4px;
        border-top:   1px solid rgba(255, 255, 255, 0.15);
        font-size:    11px;
        text-align:   center;
        color:        rgba(255, 255, 255, 0.5);
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
    `;
    document.head.appendChild(style);

    // --- Create container ---
    this.container = document.createElement('div');
    this.container.id = 'stats-overlay';

    // --- Build inner HTML ---
    this.container.innerHTML = `
      <div class="stat-title">Flight Statistics</div>

      <div class="stat-row">
        <span class="stat-label">Carry Distance</span>
        <span class="stat-value highlight" id="stat-carry">0 m</span>
      </div>

      <div class="stat-row">
        <span class="stat-label">Max Height</span>
        <span class="stat-value" id="stat-height">0 m</span>
      </div>

      <div class="stat-row">
        <span class="stat-label">Lateral Deviation</span>
        <span class="stat-value" id="stat-lateral">0 m</span>
      </div>

      <div class="stat-row">
        <span class="stat-label">Ball Speed</span>
        <span class="stat-value" id="stat-speed">0 m/s</span>
      </div>

      <div class="stat-row">
        <span class="stat-label">Altitude</span>
        <span class="stat-value" id="stat-altitude">0 m</span>
      </div>

      <div class="stat-row">
        <span class="stat-label">Sim Time</span>
        <span class="stat-value" id="stat-time">0.00 s</span>
      </div>

      <div class="stat-phase" id="stat-phase">idle</div>
    `;

    document.body.appendChild(this.container);

    // --- Cache DOM references for fast per-frame updates ---
    this.elements = {
      carry:   document.getElementById('stat-carry'),
      height:  document.getElementById('stat-height'),
      lateral: document.getElementById('stat-lateral'),
      speed:   document.getElementById('stat-speed'),
      altitude:document.getElementById('stat-altitude'),
      time:    document.getElementById('stat-time'),
      phase:   document.getElementById('stat-phase'),
    };

  }

  // ------------------------------------------------------------------
  // update()
  // Called every frame from main.js.
  // Receives live BallState values and trajectory stats from
  // TrailRenderer.getStats().
  // Only updates DOM text — no layout changes per frame.
  // ------------------------------------------------------------------
  update(state, trailStats) {

    if (!this.visible) return;

    const speed = Math.sqrt(
      state.vx ** 2 +
      state.vy ** 2 +
      state.vz ** 2
    );

    // Live values — update every frame
    this.elements.speed.textContent   = speed.toFixed(1)       + ' m/s';
    this.elements.altitude.textContent = state.y.toFixed(2)    + ' m';
    this.elements.time.textContent     = state.time.toFixed(2) + ' s';
    this.elements.phase.textContent    = state.phase;

    // Trajectory stats — from TrailRenderer.getStats()
    this.elements.carry.textContent   = trailStats.carryDistance    + ' m';
    this.elements.height.textContent  = trailStats.maxHeight        + ' m';
    this.elements.lateral.textContent = trailStats.lateralDeviation + ' m';

    // Phase color coding
    const phaseColors = {
      idle:     'rgba(255, 255, 255, 0.5)',
      flying:   '#44dd88',
      bouncing: '#ffaa00',
      rolling:  '#44aaff',
      stopped:  '#ff4444',
    };
    this.elements.phase.style.color =
      phaseColors[state.phase] || 'rgba(255, 255, 255, 0.5)';

  }

  // ------------------------------------------------------------------
  // show() / hide()
  // Called by main.js when the trail toggle changes in ControlPanel.
  // Uses CSS opacity transition — no layout reflow.
  // ------------------------------------------------------------------
  show() {
    this.visible = true;
    this.container.classList.remove('hidden');
  }

  hide() {
    this.visible = false;
    this.container.classList.add('hidden');
  }

  // ------------------------------------------------------------------
  // reset()
  // Clears all displayed values. Called before each new launch.
  // ------------------------------------------------------------------
  reset() {
    this.elements.carry.textContent    = '0 m';
    this.elements.height.textContent   = '0 m';
    this.elements.lateral.textContent  = '0 m';
    this.elements.speed.textContent    = '0 m/s';
    this.elements.altitude.textContent = '0 m';
    this.elements.time.textContent     = '0.00 s';
    this.elements.phase.textContent    = 'idle';
    this.elements.phase.style.color    = 'rgba(255, 255, 255, 0.5)';
  }

}

export default StatsOverlay;



/*

DOM references are cached in this.elements during init() and reused every frame.
Calling document.getElementById() inside update() on every frame would trigger a DOM query 60 times per second 
— caching it once at startup means update() only touches .textContent, which is the cheapest possible DOM write.

The phase color coding gives instant visual feedback — green during flight, orange during bounce, blue during roll, red when stopped.
This makes it immediately obvious which physical regime the simulation is in without reading the text.

pointer-events: none on the overlay is important — without it the overlay would block mouse interaction with the lil-gui panel behind it,
making sliders unclickable if the overlay overlaps them.
The backdrop-filter: blur(6px) gives the overlay a frosted glass look that works against both the green course and the blue sky background without needing a hard opaque background.

*/