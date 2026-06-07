// main.js
// Orchestrator — wires all modules together and owns the RAF game loop.
// This is the only file that imports from all three layers.
// It does no physics and no rendering itself — it only coordinates.

import * as THREE from 'three';

// Physics layer
import CONSTANTS          from './constants.js';
import BallState          from './physics/BallState.js';
import PhysicsEngine      from './physics/PhysicsEngine.js';
import CollisionHandler   from './physics/CollisionHandler.js';
import SimulationRecorder from './physics/SimulationRecorder.js';

// Rendering layer
import SceneBuilder       from './rendering/SceneBuilder.js';
import CourseMesh         from './rendering/CourseMesh.js';
import BallMesh           from './rendering/BallMesh.js';
import TrailRenderer      from './rendering/TrailRenderer.js';
import CameraRig          from './rendering/CameraRig.js';

// GUI layer
import ControlPanel       from './gui/ControlPanel.js';
import StatsOverlay       from './gui/StatsOverlay.js';
import PlaybackControls   from './gui/PlaybackControls.js';

// ─────────────────────────────────────────────
// 1. CREATE ALL MODULE INSTANCES
// ─────────────────────────────────────────────

const ballState         = new BallState();
const physicsEngine     = new PhysicsEngine();
const collisionHandler  = new CollisionHandler();
const recorder          = new SimulationRecorder();

const sceneBuilder      = new SceneBuilder();
const courseMesh        = new CourseMesh();
const ballMesh          = new BallMesh();
const trailRenderer     = new TrailRenderer();
const cameraRig         = new CameraRig();

const controlPanel      = new ControlPanel();
const statsOverlay      = new StatsOverlay();
const playbackControls  = new PlaybackControls();

// ─────────────────────────────────────────────
// 2. SIMULATION MODE FLAG
// 'live'     — physics is running in real time (first run)
// 'playback' — simulation finished, scrubbing recorded snapshots
// 'idle'     — waiting for first launch
// ─────────────────────────────────────────────

let simMode = 'idle';

// ─────────────────────────────────────────────
// 3. INITIALIZE ALL MODULES
// Order matters — scene must exist before meshes are added to it.
// ─────────────────────────────────────────────

// Build Three.js scene — returns { scene, camera, renderer }
const { scene, camera, renderer } = sceneBuilder.init();

// Add all geometry to scene
courseMesh.init(scene);
ballMesh.init(scene);
trailRenderer.init(scene);

// Wire camera rig — needs renderer.domElement for OrbitControls mouse input
cameraRig.init(camera, renderer.domElement);

// Build GUI panel, stats overlay, and playback timeline
controlPanel.init();
statsOverlay.init();
playbackControls.init();

// ─────────────────────────────────────────────
// 4. WIRE UP GUI CALLBACKS
// ControlPanel fires events — main.js decides what to do with them.
// ─────────────────────────────────────────────

controlPanel.setCallbacks({

  // Called when the Launch button is clicked
  onLaunch: (launchParams) => {
    _resetAll();
    _launch(launchParams);
  },

  // Called when any slider changes — updates environment in real time
  onParamChange: (params) => {

    // Decompose wind vector
    const windRad = (params.windAngle * Math.PI) / 180;
    physicsEngine.setWind(
      -params.windSpeed * Math.cos(windRad),
       0,
       params.windSpeed * Math.sin(windRad)
    );

    // Update slope in both physics and rendering
    collisionHandler.setSlope(params.slopeAngle);
    courseMesh.setSlope(params.slopeAngle);

  },

  // Called when the trail toggle changes
  onTrailToggle: (visible) => {
    trailRenderer.line.visible = visible;
  },

});

// ─────────────────────────────────────────────
// 5. WIRE UP PLAYBACK SCRUB CALLBACK
// When user drags the timeline slider, main.js reads the snapshot
// at that index from the recorder and pushes it to all renderers.
// Zero physics re-computation — pure array lookup.
// ─────────────────────────────────────────────

playbackControls.onScrub = (index) => {
  const snap = recorder.getSnapshot(index);
  if (!snap) return;

  // Sync all renderers to the snapshot state
  ballMesh.sync(snap);
  cameraRig.update(snap);
  statsOverlay.update(snap, trailRenderer.getStats());
};

// ─────────────────────────────────────────────
// 6. LAUNCH HANDLER
// Initialises BallState, starts recorder, switches to live mode.
// ─────────────────────────────────────────────

function _launch(launchParams) {

  // Apply wind and slope
  physicsEngine.setWind(
    launchParams.wind.vx,
    launchParams.wind.vy,
    launchParams.wind.vz
  );
  collisionHandler.setSlope(launchParams.slopeAngle);
  courseMesh.setSlope(launchParams.slopeAngle);

  // Initialise ball physical state
  ballState.init({
    v0:        launchParams.v0,
    angleDeg:  launchParams.angleDeg,
    spinRpm:   launchParams.spinRpm,
    spinAxisY: launchParams.spinAxisY,
  });

  // Start recording this simulation run
  recorder.start();

  // Switch game loop to live physics mode
  simMode = 'live';

}

// ─────────────────────────────────────────────
// 7. RESET HANDLER
// Clears all modules back to initial state before a new launch.
// ─────────────────────────────────────────────

function _resetAll() {
  ballState.reset();
  ballMesh.reset();
  trailRenderer.reset();
  cameraRig.reset();
  statsOverlay.reset();
  playbackControls.hide();
  simMode = 'idle';
}

// ─────────────────────────────────────────────
// 8. SIMULATION END HANDLER
// Called once when ballState.phase becomes 'stopped' during live run.
// Stops the recorder and hands off to playback mode.
// ─────────────────────────────────────────────

function _onSimulationEnd() {
  recorder.stop();
  simMode = 'playback';
  playbackControls.show(recorder.totalSteps, recorder.duration());
}

// ─────────────────────────────────────────────
// 9. GAME LOOP
// requestAnimationFrame drives the loop.
//
// LIVE mode:
//   a) Step physics with fixed-timestep accumulator
//   b) Record snapshot
//   c) Sync rendering
//   d) Update camera
//   e) Update stats
//   f) Check for simulation end
//   g) Render frame
//
// PLAYBACK mode:
//   a) PlaybackControls advances currentIndex via setInterval
//   b) onScrub callback fires → renderers update from snapshot
//   c) Camera still updates (OrbitControls damping needs every frame)
//   d) Render frame
//
// IDLE mode:
//   a) Camera still updates (allows free look around the course)
//   b) Render frame
// ─────────────────────────────────────────────

let lastTime = performance.now();

function gameLoop(timestamp) {

  requestAnimationFrame(gameLoop);

  // --- Delta time (capped at 50ms to prevent spiral of death) ---
  const rawDt = (timestamp - lastTime) / 1000;
  lastTime    = timestamp;
  const dt    = Math.min(rawDt, 0.05);

  // ── LIVE MODE ──────────────────────────────
  if (simMode === 'live') {

    // --- a) Physics step with fixed-timestep accumulator ---
    if (ballState.phase === 'flying') {

      let accumulated = dt;
      while (accumulated >= CONSTANTS.FIXED_DT) {
        physicsEngine.step(ballState);
        accumulated -= CONSTANTS.FIXED_DT;

        // Record every physics step — not just every frame
        recorder.record(ballState);

        // If phase changed mid-accumulation, stop stepping
        if (ballState.phase !== 'flying') break;
      }

    } else if (
      ballState.phase === 'bouncing' ||
      ballState.phase === 'rolling'
    ) {
      collisionHandler.handle(ballState);
      recorder.record(ballState);
    }

    // --- b) Record trail position ---
    if (
      ballState.phase === 'flying'   ||
      ballState.phase === 'bouncing' ||
      ballState.phase === 'rolling'
    ) {
      trailRenderer.record(ballState);
    }

    // --- c) Sync ball mesh to physics state ---
    ballMesh.sync(ballState);

    // --- d) Update camera target to follow ball ---
    cameraRig.update(ballState);

    // --- e) Update stats overlay ---
    statsOverlay.update(ballState, trailRenderer.getStats());

    // --- f) Check if simulation just ended ---
    if (
      ballState.phase === 'stopped' &&
      recorder.recording
    ) {
      _onSimulationEnd();
    }

  // ── PLAYBACK MODE ──────────────────────────
  } else if (simMode === 'playback') {

    // PlaybackControls drives scrubbing via its own setInterval.
    // onScrub callback updates ballMesh and statsOverlay.
    // We only need to keep OrbitControls damping alive here.
    cameraRig.controls.update();

  // ── IDLE MODE ──────────────────────────────
  } else if (simMode === 'idle') {

    // Allow free camera movement while waiting for launch
    cameraRig.controls.update();

  }

  // --- g) Render frame (runs in all modes) ---
  sceneBuilder.render();

}

// ─────────────────────────────────────────────
// 10. START
// ─────────────────────────────────────────────

requestAnimationFrame(gameLoop);