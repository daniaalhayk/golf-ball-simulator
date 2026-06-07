// rendering/SceneBuilder.js
// Builds the Three.js scene, renderer, lights, and sky.
// Uses the built-in Sky shader addon for physically-based atmosphere.
// No external texture files needed.

import * as THREE from 'three';
import { Sky }    from 'three/addons/objects/Sky.js';

class SceneBuilder {

  constructor() {
    this.scene    = null;
    this.camera   = null;
    this.renderer = null;
    this.sky      = null;
    this.sun      = null;   // DirectionalLight — repositioned to match Sky shader sun
  }

  // ------------------------------------------------------------------
  // init()
  // ------------------------------------------------------------------
  init() {

    // ── Renderer ──────────────────────────────────────────────────
    this.renderer = new THREE.WebGLRenderer({
      antialias:  true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // ACESFilmic tone mapping — the single biggest visual improvement.
    // Prevents the washed-out white look by compressing HDR values
    // into a cinematic color response curve.
    this.renderer.toneMapping          = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure  = 0.5;

    // Shadow setup
    this.renderer.shadowMap.enabled    = true;
    this.renderer.shadowMap.type       = THREE.PCFSoftShadowMap;

    document.body.appendChild(this.renderer.domElement);

    // ── Scene ─────────────────────────────────────────────────────
    this.scene = new THREE.Scene();

    // Fog color will be updated to match sky horizon after sky is built
    this.scene.fog = new THREE.FogExp2(0x88bbdd, 0.004);

    // ── Camera ────────────────────────────────────────────────────
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      2000    // far clip extended for sky dome
    );
    this.camera.position.set(-8, 5, 0);

    // ── Sky shader ────────────────────────────────────────────────
    this._buildSky();

    // ── Lights ────────────────────────────────────────────────────
    this._buildLights();

    // ── Resize ────────────────────────────────────────────────────
    window.addEventListener('resize', () => this._onResize());

    return {
      scene:    this.scene,
      camera:   this.camera,
      renderer: this.renderer,
    };

  }

  // ------------------------------------------------------------------
  // _buildSky()
  // Three.js Sky addon — physically-based Preetham sky model.
  // Simulates Rayleigh scattering (blue sky) and Mie scattering (haze).
  // The sun position drives both the visual sky AND the DirectionalLight.
  // ------------------------------------------------------------------
  _buildSky() {

    this.sky = new Sky();
    this.sky.scale.setScalar(1000);   // large enough to always surround scene
    this.scene.add(this.sky);

    const uniforms = this.sky.material.uniforms;

    // Rayleigh scattering — controls blue sky intensity
    uniforms['rayleigh'].value         = 1.0;

    // Turbidity — atmospheric haze/dust (higher = hazier horizon)
    uniforms['turbidity'].value        = 4;

    // Mie scattering — controls sun glow size
    uniforms['mieCoefficient'].value   = 0.003;

    // Mie directionality — how tight the sun glow is (0=wide, 1=tight)
    uniforms['mieDirectionalG'].value  = 0.97;

    // Sun position — elevation and azimuth
    // elevation: angle above horizon in degrees (30° = mid-morning)
    // azimuth:   horizontal direction in degrees
    const elevation = 30;
    const azimuth   = 160;

    const phi   = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);

    const sunPosition = new THREE.Vector3();
    sunPosition.setFromSphericalCoords(1, phi, theta);

    uniforms['sunPosition'].value.copy(sunPosition);

    // Use sky as scene background so it renders behind everything
    this.scene.background = this.sky;

    // Store sun direction for light positioning
    this._sunDirection = sunPosition.clone().normalize();

  }

  // ------------------------------------------------------------------
  // _buildLights()
  // Three-point setup tuned to match the Sky shader sun position.
  // Intensities are low because ACESFilmic tone mapping amplifies them.
  // ------------------------------------------------------------------
  _buildLights() {

    // Ambient — very soft fill, prevents pure black shadows
    const ambient = new THREE.AmbientLight(0xffffff, 0.3);
    this.scene.add(ambient);

    // Directional sun — positioned to match Sky shader sun direction
    this.sun = new THREE.DirectionalLight(0xfff4e0, 2.0);

    // Position light in same direction as sky sun
    this.sun.position
      .copy(this._sunDirection)
      .multiplyScalar(100);

    this.sun.castShadow             = true;
    this.sun.shadow.mapSize.width   = 2048;
    this.sun.shadow.mapSize.height  = 2048;
    this.sun.shadow.camera.near     = 1;
    this.sun.shadow.camera.far      = 400;
    this.sun.shadow.camera.left     = -120;
    this.sun.shadow.camera.right    = 120;
    this.sun.shadow.camera.top      = 120;
    this.sun.shadow.camera.bottom   = -120;
    this.sun.shadow.bias            = -0.0005;   // reduces shadow acne

    this.scene.add(this.sun);
    this.scene.add(this.sun.target);   // target stays at origin (tee)

    // Hemisphere light — sky blue above, grass green below
    // Gives natural color bounce without expensive GI
    const hemi = new THREE.HemisphereLight(0x88bbff, 0x4a7c3f, 0.6);
    this.scene.add(hemi);

  }

  // ------------------------------------------------------------------
  // _onResize()
  // ------------------------------------------------------------------
  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  // ------------------------------------------------------------------
  // render()
  // ------------------------------------------------------------------
  render() {
    this.renderer.render(this.scene, this.camera);
  }

}

export default SceneBuilder;