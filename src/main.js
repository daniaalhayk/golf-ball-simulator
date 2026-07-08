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
import ForceArrows        from './rendering/ForceArrows.js';

import ControlPanel          from './gui/ControlPanel.js';
import StatsOverlay          from './gui/StatsOverlay.js';
import PlaybackControls      from './gui/PlaybackControls.js';
import ForceKinematicsPanel  from './gui/ForceKinematicsPanel.js';

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
const forceArrows      = new ForceArrows();

const controlPanel        = new ControlPanel();
const statsOverlay        = new StatsOverlay();
const playbackControls    = new PlaybackControls();
const forceKinematicsPanel = new ForceKinematicsPanel();

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
forceArrows.init(scene);

controlPanel.init();
statsOverlay.init();
playbackControls.init();
forceKinematicsPanel.init();

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

    // Landscape — full rebuild only when value actually changes
    if (params.landscapeType !== _currentLandscape) {
      _currentLandscape = params.landscapeType;
      courseMesh.setLandscape(params.landscapeType);
      physicsEngine.setTerrain(courseMesh);
      collisionHandler.setTerrain(courseMesh);
    }
  },

  onTrailToggle: (visible) => {
    trailRenderer.line.visible = visible;
  },

  onForcesToggle: (visible) => {
    if (visible) { forceArrows.show(); forceKinematicsPanel.show(); }
    else         { forceArrows.hide(); forceKinematicsPanel.hide(); }
  },

});

// Playback scrub
playbackControls.onScrub = (index) => {
  const snap = recorder.getSnapshot(index);
  if (!snap) return;
  ballMesh.sync(snap);
  cameraRig.update(snap);
  statsOverlay.update(snap, trailRenderer.getStats());

  const forces = forceArrows.update(snap, physicsEngine.wind);
  forceKinematicsPanel.updateReplay(snap, forces, recorder, physicsEngine.wind);
};

// ── Launch ────────────────────────────────────────────────────────────
function _launch(lp) {
  physicsEngine.setWind(lp.wind.vx, lp.wind.vy, lp.wind.vz);
  collisionHandler.setSlope(lp.slopeAngle);
  courseMesh.setSlope(lp.slopeAngle);

  ballState.init({
    v0:        lp.v0,
    angleDeg:  lp.angleDeg,
    spinRpm:   lp.spinRpm,
    spinAxisY: lp.spinAxisY,
    aimDeg:    lp.aimDeg,
  });

  // Hide aim arrow while ball is in flight
  courseMesh.showAimArrow(false);

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
  forceKinematicsPanel.reset();
  playbackControls.hide();
  courseMesh.showAimArrow(true);    // aim arrow visible at rest
  simMode = 'idle';
}

// ── Sim end ───────────────────────────────────────────────────────────
function _onSimulationEnd() {
  recorder.stop();
  simMode = 'playback';
  playbackControls.show(recorder.totalSteps, recorder.duration());
  courseMesh.showAimArrow(true);    // aim arrow returns after ball stops
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
      let acc = dt;
      while (acc >= CONSTANTS.FIXED_DT) {
        physicsEngine.step(ballState);
        
        // تحديث الزمن هنا (مرة واحدة لكل خطوة فيزيائية)
        ballState.time += CONSTANTS.FIXED_DT; 

        acc -= CONSTANTS.FIXED_DT;
        recorder.record(ballState);
        if (ballState.phase !== 'flying') break;
      }

    } else if (ballState.phase === 'bouncing' || ballState.phase === 'rolling') {
      let acc = dt;
      while (acc >= CONSTANTS.FIXED_DT) {
        collisionHandler.handle(ballState);
        
        // تحديث الزمن هنا أيضاً أثناء الارتداد والدحرجة
        ballState.time += CONSTANTS.FIXED_DT; 

        acc -= CONSTANTS.FIXED_DT;
        recorder.record(ballState);
        if (ballState.phase !== 'bouncing' && ballState.phase !== 'rolling') break;
      }
    }

    if (ballState.phase !== 'idle' && ballState.phase !== 'stopped') {
      trailRenderer.record(ballState);
    }

    ballMesh.sync(ballState, dt);
    cameraRig.update(ballState);
    statsOverlay.update(ballState, trailRenderer.getStats());

    const forces = forceArrows.update(ballState, physicsEngine.wind);
    forceKinematicsPanel.updateLive(ballState, forces);

    if (ballState.phase === 'stopped' && recorder.recording) {
      _onSimulationEnd();
    }

  } else {
    cameraRig.controls.update();
  }

  sceneBuilder.render();
}

requestAnimationFrame(gameLoop);
