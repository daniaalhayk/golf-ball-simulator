// gui/ForceKinematicsPanel.js
// Numeric readout of the exact same forces/kinematics ForceArrows draws
// as 3D arrows, plus a per-second log table so specific values at each
// whole second of the flight/roll can be read back during replay instead
// of only eyeballed off a number that's constantly moving.
//
// Sits beside StatsOverlay (bottom-left) at bottom-right — same visual
// language (dark glass panel, monospace), different data: StatsOverlay
// summarizes the *trajectory* (carry, apex, etc.), this panel shows the
// *instantaneous* forces and kinematics acting on the ball right now.

import CONSTANTS from '../constants.js';
import { gravity, drag, magnus } from '../physics/Forces.js';

class ForceKinematicsPanel {

  constructor() {
    this.container = null;
    this.elements  = {};
    this.logBody   = null;
    this.visible   = true;
    this._lastLoggedSecond = -1;
  }

  init() {
    const style = document.createElement('style');
    style.textContent = `
      #force-panel {
        position:        fixed;
        bottom:          20px;
        right:           20px;
        background:      rgba(0, 0, 0, 0.65);
        color:           #ffffff;
        font-family:     monospace;
        font-size:       12px;
        line-height:     1.7;
        padding:         14px 18px;
        border-radius:   8px;
        border:          1px solid rgba(255, 255, 255, 0.15);
        backdrop-filter: blur(6px);
        min-width:       260px;
        max-width:       300px;
        z-index:         999;
        transition:      opacity 0.3s ease;
      }
      #force-panel.hidden { opacity: 0; pointer-events: none; }
      #force-panel .fp-title {
        font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase;
        color: #ffdd00; margin-bottom: 6px;
        border-bottom: 1px solid rgba(255,255,255,0.15); padding-bottom: 4px;
      }
      #force-panel .fp-row { display: flex; justify-content: space-between; gap: 14px; }
      #force-panel .fp-label { display: flex; align-items: center; gap: 6px; color: rgba(255,255,255,0.65); }
      #force-panel .fp-swatch { width: 9px; height: 9px; border-radius: 50%; display: inline-block; flex: none; }
      #force-panel .fp-value { text-align: right; font-weight: bold; white-space: nowrap; }
      #force-panel .fp-section { margin-top: 8px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.12); }
      #force-panel .fp-log-wrap {
        margin-top: 8px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.12);
        max-height: 150px; overflow-y: auto;
      }
      #force-panel table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
      #force-panel th {
        text-align: right; color: rgba(255,255,255,0.5); font-weight: normal;
        padding: 2px 4px; position: sticky; top: 0; background: rgba(20,20,20,0.95);
      }
      #force-panel th:first-child, #force-panel td:first-child { text-align: left; }
      #force-panel td { text-align: right; padding: 2px 4px; color: rgba(255,255,255,0.85); }
      #force-panel tr:nth-child(even) td { background: rgba(255,255,255,0.04); }
      #force-panel .fp-empty { color: rgba(255,255,255,0.35); font-size: 10.5px; padding: 4px 0; }
    `;
    document.head.appendChild(style);

    this.container = document.createElement('div');
    this.container.id = 'force-panel';
    this.container.innerHTML = `
      <div class="fp-title">Forces &amp; Kinematics</div>

      <div class="fp-row">
        <span class="fp-label"><span class="fp-swatch" style="background:#ffdd00"></span>Velocity</span>
        <span class="fp-value" id="fp-vel">0.0 m/s</span>
      </div>
      <div class="fp-row">
        <span class="fp-label"><span class="fp-swatch" style="background:#ff00ff"></span>Spin</span>
        <span class="fp-value" id="fp-spin">0 rpm</span>
      </div>

      <div class="fp-section">
        <div class="fp-row">
          <span class="fp-label"><span class="fp-swatch" style="background:#4488ff"></span>Gravity</span>
          <span class="fp-value" id="fp-grav">0.00 N</span>
        </div>
        <div class="fp-row">
          <span class="fp-label"><span class="fp-swatch" style="background:#ff3333"></span>Drag</span>
          <span class="fp-value" id="fp-drag">0.00 N</span>
        </div>
        <div class="fp-row">
          <span class="fp-label"><span class="fp-swatch" style="background:#33ff88"></span>Magnus</span>
          <span class="fp-value" id="fp-magnus">0.00 N</span>
        </div>
      </div>

      <div class="fp-log-wrap">
        <table>
          <thead><tr><th>t(s)</th><th>v (m/s)</th><th>spin (rpm)</th><th>drag (N)</th><th>mag (N)</th></tr></thead>
          <tbody id="fp-log-body"></tbody>
        </table>
      </div>
    `;
    document.body.appendChild(this.container);

    this.elements = {
      vel:    document.getElementById('fp-vel'),
      spin:   document.getElementById('fp-spin'),
      grav:   document.getElementById('fp-grav'),
      drag:   document.getElementById('fp-drag'),
      magnus: document.getElementById('fp-magnus'),
    };
    this.logBody = document.getElementById('fp-log-body');
  }

  _mag(v) { return v ? Math.sqrt(v.fx ** 2 + v.fy ** 2 + v.fz ** 2) : 0; }

  _updateNumbers(state, forces) {
    const speed = Math.sqrt(state.vx ** 2 + state.vy ** 2 + state.vz ** 2);
    const wMag  = Math.sqrt(state.wx ** 2 + state.wy ** 2 + state.wz ** 2);
    const rpm   = (wMag * 60) / (2 * Math.PI);

    this.elements.vel.textContent  = speed.toFixed(1) + ' m/s';
    this.elements.spin.textContent = rpm.toFixed(0) + ' rpm';

    if (forces.isFlying) {
      this.elements.grav.textContent   = this._mag(forces.gravity).toFixed(2) + ' N';
      this.elements.drag.textContent   = this._mag(forces.drag).toFixed(2)    + ' N';
      this.elements.magnus.textContent = this._mag(forces.magnus).toFixed(2)  + ' N';
    } else {
      this.elements.grav.textContent   = '— (grounded)';
      this.elements.drag.textContent   = '— (grounded)';
      this.elements.magnus.textContent = '— (grounded)';
    }
  }

  _logRowHTML(state, forces) {
    const speed = Math.sqrt(state.vx ** 2 + state.vy ** 2 + state.vz ** 2);
    const wMag  = Math.sqrt(state.wx ** 2 + state.wy ** 2 + state.wz ** 2);
    const rpm   = (wMag * 60) / (2 * Math.PI);
    const dragMag   = forces.isFlying ? this._mag(forces.drag)   : 0;
    const magnusMag = forces.isFlying ? this._mag(forces.magnus) : 0;

    return `<tr>
      <td>${state.time.toFixed(0)}</td>
      <td>${speed.toFixed(1)}</td>
      <td>${rpm.toFixed(0)}</td>
      <td>${dragMag.toFixed(2)}</td>
      <td>${magnusMag.toFixed(2)}</td>
    </tr>`;
  }

  // ------------------------------------------------------------------
  // updateLive()
  // Called every frame during live simulation. Appends one new log row
  // the instant simulation time crosses each whole second — forward-only,
  // so incremental append is safe here.
  // ------------------------------------------------------------------
  updateLive(state, forces) {
    if (!this.visible) return;
    this._updateNumbers(state, forces);

    const sec = Math.floor(state.time);
    if (sec > this._lastLoggedSecond && state.time > 0) {
      this._lastLoggedSecond = sec;
      this.logBody.insertAdjacentHTML('beforeend', this._logRowHTML(state, forces));
      this.logBody.parentElement.scrollTop = this.logBody.parentElement.scrollHeight;
    }
  }

  // ------------------------------------------------------------------
  // updateReplay()
  // Called while scrubbing. The user can jump the slider forward or
  // backward to any point, so the log is rebuilt from the recorder each
  // time rather than incrementally patched — that's the only way it
  // stays correct regardless of scrub direction.
  // ------------------------------------------------------------------
  updateReplay(state, forces, recorder, wind) {
    if (!this.visible) return;
    this._updateNumbers(state, forces);

    const maxSec = Math.floor(state.time);
    let html = '';
    for (let s = 0; s <= maxSec; s++) {
      const idx  = Math.round(s / CONSTANTS.FIXED_DT);
      const snap = recorder.getSnapshot(idx);
      if (!snap) continue;
      const snapIsFlying = snap.phase === 'flying';
      const snapForces = {
        isFlying: snapIsFlying,
        gravity:  snapIsFlying ? gravity() : null,
        drag:     snapIsFlying ? drag(snap, wind)   : null,
        magnus:   snapIsFlying ? magnus(snap, wind) : null,
      };
      html += this._logRowHTML(snap, snapForces);
    }
    this.logBody.innerHTML = html || '';
  }

  reset() {
    this.elements.vel.textContent    = '0.0 m/s';
    this.elements.spin.textContent   = '0 rpm';
    this.elements.grav.textContent   = '0.00 N';
    this.elements.drag.textContent   = '0.00 N';
    this.elements.magnus.textContent = '0.00 N';
    this.logBody.innerHTML = '';
    this._lastLoggedSecond = -1;
  }

  show() { this.visible = true; this.container.classList.remove('hidden'); }
  hide() { this.visible = false; this.container.classList.add('hidden'); }
}

export default ForceKinematicsPanel;
