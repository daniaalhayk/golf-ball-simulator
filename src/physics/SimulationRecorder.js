// physics/SimulationRecorder.js
// Records a full snapshot of BallState at every physics step
// during the live simulation run.
// After simulation ends, provides random-access playback
// by index — no physics re-computation needed.

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


/*

The core idea:
OrbitControls normally orbits around a fixed point in world space.
The trick is to update its .target every frame to the ball's current position.
This way the controls orbit around the ball as it moves,
while still letting you rotate, zoom, and pan freely with the mouse.

OrbitControls.target = ball position (updated every frame)
OrbitControls handles all mouse input on top of that

Think of it like a camera drone that always points at the ball, but you control the drone's angle and distance freely.

For the playback scrubber:
SimulationRecorder runs once during the first live simulation
and stores a full snapshot at every physics step.
After the ball stops,the timeline slider appears.
Dragging it just reads index i from the array and pushes that snapshot into the renderer — no physics runs again.

*/