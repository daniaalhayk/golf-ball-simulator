class SimulationRecorder {

  constructor() {
    this.snapshots  = [];     // full state at every Δt step
    this.recording  = false;
    this.totalSteps = 0;
  }

  // ------------------------------------------------------------------
  // start() / stop()
  // Called by main.js at launch start and simulation end.
  // ------------------------------------------------------------------
  start() {
    this.snapshots  = [];
    this.recording  = true;
    this.totalSteps = 0;
  }

  stop() {
    this.recording  = false;
    this.totalSteps = this.snapshots.length;
  }

  // ------------------------------------------------------------------
  // record()
  // Called by main.js every physics step during live simulation.
  // Stores a full deep copy of BallState — not just position.
  // This is what makes scrubbing backward possible.
  // ------------------------------------------------------------------
  record(state) {
    if (!this.recording) return;

    this.snapshots.push({
      // position
      x: state.x, y: state.y, z: state.z,

      // velocity
      vx: state.vx, vy: state.vy, vz: state.vz,

      // spin
      wx: state.wx, wy: state.wy, wz: state.wz,

      // metadata
      phase: state.phase,
      time:  state.time,
    });
  }

  // ------------------------------------------------------------------
  // getSnapshot(index)
  // Returns the snapshot at a given step index.
  // PlaybackControls slider maps directly to this index.
  // ------------------------------------------------------------------
  getSnapshot(index) {
    const i = Math.max(0, Math.min(index, this.snapshots.length - 1));
    return this.snapshots[i];
  }

  // ------------------------------------------------------------------
  // duration()
  // Returns total simulation time in seconds.
  // Used by PlaybackControls to label the slider end.
  // ------------------------------------------------------------------
  duration() {
    if (this.snapshots.length === 0) return 0;
    return this.snapshots[this.snapshots.length - 1].time;
  }

  // ------------------------------------------------------------------
  // hasData()
  // Returns true if a simulation has been recorded.
  // PlaybackControls checks this before showing the timeline.
  // ------------------------------------------------------------------
  hasData() {
    return this.snapshots.length > 1;
  }

}

export default SimulationRecorder;
