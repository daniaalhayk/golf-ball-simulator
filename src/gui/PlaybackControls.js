// gui/PlaybackControls.js
// Timeline scrubber UI — appears after the first simulation completes.
// Reads from SimulationRecorder by index — zero physics re-computation.
// Controls: play/pause, scrub slider, speed selector, step buttons.

class PlaybackControls {

  constructor() {
    this.container     = null;
    this.slider        = null;
    this.playBtn       = null;
    this.timeLabel     = null;

    this.isPlaying     = false;
    this.currentIndex  = 0;
    this.playbackSpeed = 1.0;   // multiplier: 0.25, 0.5, 1, 2, 4

    // Set by main.js — called every frame during playback
    // with the snapshot at currentIndex
    this.onScrub = null;

    this._playInterval = null;
  }

  // ------------------------------------------------------------------
  // init()
  // Creates the timeline bar HTML and injects it into the DOM.
  // Hidden by default — shown after first simulation completes.
  // ------------------------------------------------------------------
  init() {

    const style = document.createElement('style');
    style.textContent = `
      #playback-controls {
        position:        fixed;
        bottom:          20px;
        left:            50%;
        transform:       translateX(-50%);
        background:      rgba(0, 0, 0, 0.75);
        border:          1px solid rgba(255,255,255,0.15);
        border-radius:   12px;
        backdrop-filter: blur(8px);
        padding:         10px 20px;
        display:         flex;
        align-items:     center;
        gap:             12px;
        z-index:         1001;
        min-width:       520px;
        display:         none;   /* hidden until first sim completes */
      }

      #playback-controls button {
        background:    rgba(255,255,255,0.1);
        border:        1px solid rgba(255,255,255,0.2);
        border-radius: 6px;
        color:         #fff;
        font-size:     14px;
        width:         32px;
        height:        32px;
        cursor:        pointer;
        display:       flex;
        align-items:   center;
        justify-content: center;
        transition:    background 0.15s;
        flex-shrink:   0;
      }

      #playback-controls button:hover {
        background: rgba(255,255,255,0.25);
      }

      #pb-slider {
        flex:            1;
        accent-color:    #ffdd00;
        height:          4px;
        cursor:          pointer;
      }

      #pb-time {
        color:       rgba(255,255,255,0.7);
        font-family: monospace;
        font-size:   12px;
        min-width:   80px;
        text-align:  right;
        flex-shrink: 0;
      }

      #pb-speed {
        background:    rgba(255,255,255,0.1);
        border:        1px solid rgba(255,255,255,0.2);
        border-radius: 6px;
        color:         #fff;
        font-size:     11px;
        padding:       4px 6px;
        cursor:        pointer;
        flex-shrink:   0;
      }

      #pb-speed option {
        background: #222;
        color: #fff;
      }
    `;
    document.head.appendChild(style);

    this.container = document.createElement('div');
    this.container.id = 'playback-controls';
    this.container.innerHTML = `
      <button id="pb-restart" title="Restart">⏮</button>
      <button id="pb-stepback" title="Step back">⏪</button>
      <button id="pb-play" title="Play / Pause">▶</button>
      <button id="pb-stepfwd" title="Step forward">⏩</button>
      <input  id="pb-slider" type="range" min="0" value="0" step="1" />
      <span   id="pb-time">0.00 s / 0.00 s</span>
      <select id="pb-speed" title="Playback speed">
        <option value="0.25">0.25×</option>
        <option value="0.5">0.5×</option>
        <option value="1"   selected>1×</option>
        <option value="2">2×</option>
        <option value="4">4×</option>
      </select>
    `;

    document.body.appendChild(this.container);

    // Cache elements
    this.slider    = document.getElementById('pb-slider');
    this.playBtn   = document.getElementById('pb-play');
    this.timeLabel = document.getElementById('pb-time');

    // Wire events
    document.getElementById('pb-restart')
      .addEventListener('click', () => this._restart());

    document.getElementById('pb-stepback')
      .addEventListener('click', () => this._step(-1));

    document.getElementById('pb-stepfwd')
      .addEventListener('click', () => this._step(1));

    this.playBtn
      .addEventListener('click', () => this._togglePlay());

    this.slider
      .addEventListener('input', () => {
        this.currentIndex = parseInt(this.slider.value);
        this._scrub();
      });

    document.getElementById('pb-speed')
      .addEventListener('change', (e) => {
        this.playbackSpeed = parseFloat(e.target.value);
        // Restart interval at new speed if currently playing
        if (this.isPlaying) {
          this._stopInterval();
          this._startInterval();
        }
      });

  }

  // ------------------------------------------------------------------
  // show(totalSteps, duration)
  // Called by main.js when simulation finishes.
  // Sets slider range to total recorded steps.
  // ------------------------------------------------------------------
  show(totalSteps, duration) {
    this.totalSteps  = totalSteps;
    this.duration    = duration;
    this.currentIndex = 0;

    this.slider.max   = totalSteps - 1;
    this.slider.value = 0;

    this.container.style.display = 'flex';
    this._updateTimeLabel();
  }

  // ------------------------------------------------------------------
  // hide()
  // Called by main.js when user relaunches — hides timeline
  // while new simulation runs live.
  // ------------------------------------------------------------------
  hide() {
    this._pause();
    this.container.style.display = 'none';
  }

  // ------------------------------------------------------------------
  // _togglePlay() / _pause()
  // ------------------------------------------------------------------
  _togglePlay() {
    if (this.isPlaying) {
      this._pause();
    } else {
      // If at end, restart from beginning
      if (this.currentIndex >= this.totalSteps - 1) {
        this.currentIndex = 0;
      }
      this._play();
    }
  }

  _play() {
    this.isPlaying       = true;
    this.playBtn.textContent = '⏸';
    this._startInterval();
  }

  _pause() {
    this.isPlaying       = false;
    this.playBtn.textContent = '▶';
    this._stopInterval();
  }

  // ------------------------------------------------------------------
  // _startInterval() / _stopInterval()
  // Advances currentIndex at the correct rate for playback speed.
  // FIXED_DT = 0.01 s per step → base interval = 10 ms at 1×
  // ------------------------------------------------------------------
  _startInterval() {
    const intervalMs = (10 / this.playbackSpeed);
    this._playInterval = setInterval(() => {

      this.currentIndex++;

      if (this.currentIndex >= this.totalSteps) {
        this.currentIndex = this.totalSteps - 1;
        this._pause();
        return;
      }

      this.slider.value = this.currentIndex;
      this._scrub();

    }, intervalMs);
  }

  _stopInterval() {
    if (this._playInterval) {
      clearInterval(this._playInterval);
      this._playInterval = null;
    }
  }

  // ------------------------------------------------------------------
  // _step(direction)
  // Moves one snapshot forward (+1) or backward (-1).
  // ------------------------------------------------------------------
  _step(direction) {
    this._pause();
    this.currentIndex = Math.max(
      0,
      Math.min(this.currentIndex + direction, this.totalSteps - 1)
    );
    this.slider.value = this.currentIndex;
    this._scrub();
  }

  // ------------------------------------------------------------------
  // _restart()
  // ------------------------------------------------------------------
  _restart() {
    this._pause();
    this.currentIndex = 0;
    this.slider.value = 0;
    this._scrub();
  }

  // ------------------------------------------------------------------
  // _scrub()
  // Fires onScrub callback with currentIndex.
  // main.js receives the index, reads the snapshot from
  // SimulationRecorder, and pushes it to renderers.
  // ------------------------------------------------------------------
  _scrub() {
    this._updateTimeLabel();
    if (this.onScrub) this.onScrub(this.currentIndex);
  }

  // ------------------------------------------------------------------
  // _updateTimeLabel()
  // ------------------------------------------------------------------
  _updateTimeLabel() {
    const current = ((this.currentIndex * 0.01)).toFixed(2);
    const total   = (this.duration || 0).toFixed(2);
    this.timeLabel.textContent = `${current} s / ${total} s`;
  }

}

export default PlaybackControls;