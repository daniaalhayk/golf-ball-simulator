// main.js — orchestrator, owns the RAF game loop.

import * as THREE from 'three';

import CONSTANTS          from './constants.js';
import BallState          from './physics/BallState.js';
import PhysicsEngine      from './physics/PhysicsEngine.js';
import CollisionHandler   from './physics/CollisionHandler.js';
import SimulationRecorder from './physics/SimulationRecorder.js';

import SceneBuilder       from './rendering/SceneBuilder.js';
import CourseMesh         from './rendering/CourseMesh.js';
import BallMesh           from './rendering/BallMesh.js';
import TrailRenderer      from './rendering/TrailRenderer.js';
import CameraRig          from './rendering/CameraRig.js';
import GolferFigure       from './rendering/GolferFigure.js';

import ControlPanel       from './gui/ControlPanel.js';
import StatsOverlay       from './gui/StatsOverlay.js';
import PlaybackControls   from './gui/PlaybackControls.js';

// ── Instances ────────────────────────────────────────────────────────
const ballState        = new BallState();
const physicsEngine    = new PhysicsEngine();
const collisionHandler = new CollisionHandler();
const recorder         = new SimulationRecorder();

const sceneBuilder     = new SceneBuilder();
const courseMesh       = new CourseMesh();
const ballMesh         = new BallMesh();
const trailRenderer    = new TrailRenderer();
const cameraRig        = new CameraRig();
const golferFigure     = new GolferFigure();

const controlPanel     = new ControlPanel();
const statsOverlay     = new StatsOverlay();
const playbackControls = new PlaybackControls();

// ── State ─────────────────────────────────────────────────────────────
let simMode          = 'idle';
let _currentLandscape = 'parkland';
let _currentHole      = 1;

// ── Init ──────────────────────────────────────────────────────────────
const { scene, camera, renderer } = sceneBuilder.init();

courseMesh.init(scene);
ballMesh.init(scene);
trailRenderer.init(scene);
cameraRig.init(camera, renderer.domElement);
golferFigure.init(scene);
golferFigure.updateAim(0);

controlPanel.init();
statsOverlay.init();
playbackControls.init();

// Wire terrain sampler into physics (both read getHeightAt / getSurfaceAt)
physicsEngine.setTerrain(courseMesh);
collisionHandler.setTerrain(courseMesh);

// ── Callbacks ─────────────────────────────────────────────────────────
controlPanel.setCallbacks({

  onLaunch: (lp) => {
    _resetAll(lp.aimDeg);
    _launch(lp);
  },

  onParamChange: (params) => {
    // Hole — full rebuild only when the selected hole actually changes.
    // Each hole is its own standalone map (tee at world origin), so
    // switching holes snaps the ball/camera back to the new tee.
    if (params.holeNumber !== _currentHole) {
      _currentHole = params.holeNumber;
      courseMesh.loadHole(_currentHole);
      physicsEngine.setTerrain(courseMesh);
      collisionHandler.setTerrain(courseMesh);
      _resetAll(params.aimDeg);
    }

    // Wind
    const windRad = (params.windAngle * Math.PI) / 180;
    physicsEngine.setWind(
      -params.windSpeed * Math.cos(windRad),
       0,
       params.windSpeed * Math.sin(windRad)
    );

    // Green slope
    collisionHandler.setSlope(params.slopeAngle);
    courseMesh.setSlope(params.slopeAngle);

    // Aim arrow — rotates in real time as slider moves
    courseMesh.updateAimArrow(params.aimDeg);
    golferFigure.updateAim(params.aimDeg);

    // Landscape — full rebuild only when value actually changes.
    // 'realscan' loads a real drone-scanned mesh asynchronously; every
    // other style rebuilds the procedural sine-wave terrain synchronously.
    if (params.landscapeType !== _currentLandscape) {
      _currentLandscape = params.landscapeType;

      if (params.landscapeType === 'realscan') {
        courseMesh.loadScannedTerrain().then(() => {
          physicsEngine.setTerrain(courseMesh);
          collisionHandler.setTerrain(courseMesh);
          _resetAll(params.aimDeg);
        });
      } else {
        courseMesh.setLandscape(params.landscapeType);
        physicsEngine.setTerrain(courseMesh);
        collisionHandler.setTerrain(courseMesh);
      }
    }
  },

  onTrailToggle: (visible) => {
    trailRenderer.line.visible = visible;
  },

});

// Playback scrub
playbackControls.onScrub = (index) => {
  const snap = recorder.getSnapshot(index);
  if (!snap) return;
  ballMesh.sync(snap);
  cameraRig.update(snap);
  statsOverlay.update(snap, trailRenderer.getStats());
};

// ── Launch ────────────────────────────────────────────────────────────
let _lastLaunchSpeed = 0;

function _launch(lp) {
  physicsEngine.setWind(lp.wind.vx, lp.wind.vy, lp.wind.vz);
  collisionHandler.setSlope(lp.slopeAngle);
  courseMesh.setSlope(lp.slopeAngle);
  _lastLaunchSpeed = lp.v0;

  ballState.init({
    v0:        lp.v0,
    angleDeg:  lp.angleDeg,
    spinRpm:   lp.spinRpm,
    spinAxisY: lp.spinAxisY,
    aimDeg:    lp.aimDeg,
  });

  // Hide aim arrow and golfer while ball is in flight
  courseMesh.showAimArrow(false);
  golferFigure.setVisible(false);

  recorder.start();
  simMode = 'live';
}

// ── Reset ─────────────────────────────────────────────────────────────
function _resetAll(aimDeg = 0) {
  ballState.reset();
  ballMesh.reset();
  trailRenderer.reset();
  cameraRig.reset(aimDeg);          // camera snaps behind aim direction
  statsOverlay.reset();
  playbackControls.hide();
  courseMesh.showAimArrow(true);    // aim arrow visible at rest
  golferFigure.updateAim(aimDeg);
  golferFigure.setVisible(true);
  simMode = 'idle';
}

// ── Sim end ───────────────────────────────────────────────────────────
function _onSimulationEnd() {
  recorder.stop();
  simMode = 'playback';
  playbackControls.show(recorder.totalSteps, recorder.duration());
  courseMesh.showAimArrow(true);    // aim arrow returns after ball stops
  golferFigure.setVisible(true);
  statsOverlay.addShotToHistory(trailRenderer.getStats(), _lastLaunchSpeed);
}

// ── Game loop ─────────────────────────────────────────────────────────
let lastTime = performance.now();

function gameLoop(timestamp) {
  requestAnimationFrame(gameLoop);

  const rawDt = (timestamp - lastTime) / 1000;
  lastTime    = timestamp;
  const dt    = Math.min(rawDt, 0.05);

  if (simMode === 'live') {

    if (ballState.phase === 'flying') {
      // Flying: fixed-timestep accumulator — 100 Hz physics, any frame rate
      let acc = dt;
      while (acc >= CONSTANTS.FIXED_DT) {
        physicsEngine.step(ballState);
        acc -= CONSTANTS.FIXED_DT;
        recorder.record(ballState);
        if (ballState.phase !== 'flying') break;
      }

    } else if (ballState.phase === 'bouncing' || ballState.phase === 'rolling') {
      // Bouncing/rolling: same accumulator so rolling also runs at 100 Hz.
      // Without this, _roll() would advance 0.01 s per frame (0.016 s) —
      // the ball would roll at 60% real-time speed and stopping would lag.
      let acc = dt;
      while (acc >= CONSTANTS.FIXED_DT) {
        collisionHandler.handle(ballState);
        acc -= CONSTANTS.FIXED_DT;
        recorder.record(ballState);
        // Break if physics ended this phase (stopped or returned to flying)
        if (ballState.phase !== 'bouncing' && ballState.phase !== 'rolling') break;
      }
    }

    if (ballState.phase !== 'idle' && ballState.phase !== 'stopped') {
      trailRenderer.record(ballState);
    }

    ballMesh.sync(ballState);
    cameraRig.update(ballState);
    statsOverlay.update(ballState, trailRenderer.getStats());

    if (ballState.phase === 'stopped' && recorder.recording) {
      _onSimulationEnd();
    }

  } else {
    cameraRig.controls.update();
  }

  sceneBuilder.render();
}

requestAnimationFrame(gameLoop);
