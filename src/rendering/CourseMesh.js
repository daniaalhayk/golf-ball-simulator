// rendering/CourseMesh.js
// Builds a regulation 18-hole golf course.
//
// Architecture:
//   - 128×128 height field (Float32Array) over 800×800 m world space
//   - 128×128 surface field (Uint8Array) with CONSTANTS.SURFACE_* values
//   - getHeightAt(wx,wz) + getSurfaceAt(wx,wz) queried by physics layer
//   - setLandscape(style) rebuilds everything for the chosen style
//   - setSlope(deg) modifies green heights live
//   - updateAimArrow(deg) + showAimArrow(bool) control the aim indicator

import * as THREE from 'three';
import CONSTANTS  from '../constants.js';

// ── Smoothstep ────────────────────────────────────────────────────────
function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// ── Deterministic noise  0..1 ─────────────────────────────────────────
function noise(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// ── Surface priority (higher = wins when zones overlap) ───────────────
// Index = CONSTANTS.SURFACE_* value
// ROUGH=0, FAIRWAY=1, GREEN=2, TEE=3, SAND=4, WATER=5, FRINGE=6
const SURF_PRI = [0, 1, 5, 6, 3, 2, 4];
function higher(cur, cand) {
  return SURF_PRI[cand] > SURF_PRI[cur] ? cand : cur;
}

// ═════════════════════════════════════════════════════════════════════
//  18-HOLE COURSE DEFINITION
//  Routing: one continuous loop, each tee near the previous green.
//  Coordinates in metres, world origin (0,0) = Hole 1 tee.
//  Par 72 — front 9: 36, back 9: 36.
//
//  path: polyline control points defining the fairway centreline.
//        First point ≈ tee, last point ≈ green.
//  fw:   fairway half-width (metres) — corridor = fw × 2 wide.
//  gr:   green radius (metres).
//  bunkers: [{x,z,r}]  sand bunkers.
//  water:   {x,z,r}    optional water hazard, null otherwise.
// ═════════════════════════════════════════════════════════════════════
const HOLES = [
  // ── FRONT 9 ──────────────────────────────────────────────────────

  // H1  Par 4 — Opens straight East, slight right curve. Classic opener.
  { id:1, par:4,
    tee:[0,0], green:[200,-15], gr:10, fw:12,
    path:[[0,0],[100,4],[200,-15]],
    bunkers:[{x:158,z:-24,r:7},{x:178,z:8,r:6}], water:null },

  // H2  Par 5 — Long sweeping right, good birdie chance.
  { id:2, par:5,
    tee:[205,-12], green:[370,-22], gr:11, fw:13,
    path:[[205,-12],[285,-16],[370,-22]],
    bunkers:[{x:298,z:-6,r:7},{x:342,z:-33,r:6}], water:null },

  // H3  Par 3 — Short shot straight South across bunker clusters.
  { id:3, par:3,
    tee:[375,-18], green:[375,-115], gr:9, fw:10,
    path:[[375,-18],[375,-115]],
    bunkers:[{x:362,z:-78,r:8},{x:390,z:-84,r:6}], water:null },

  // H4  Par 4 — Dogleg left, demands accurate drive.
  { id:4, par:4,
    tee:[375,-122], green:[260,-195], gr:10, fw:11,
    path:[[375,-122],[338,-178],[260,-195]],
    bunkers:[{x:303,z:-185,r:7},{x:266,z:-183,r:6}], water:null },

  // H5  Par 5 — Long sweeping left, water on the left side.
  { id:5, par:5,
    tee:[255,-200], green:[80,-235], gr:11, fw:13,
    path:[[255,-200],[178,-214],[80,-235]],
    bunkers:[{x:198,z:-225,r:7},{x:98,z:-222,r:6}],
    water:{x:162,z:-228,r:12} },

  // H6  Par 3 — Short diagonal shot NW, tricky green.
  { id:6, par:3,
    tee:[75,-240], green:[-20,-220], gr:9, fw:10,
    path:[[75,-240],[-20,-220]],
    bunkers:[{x:22,z:-236,r:7},{x:-12,z:-210,r:6}], water:null },

  // H7  Par 4 — Straight North, long rough on both sides.
  { id:7, par:4,
    tee:[-25,-216], green:[-50,-100], gr:10, fw:11,
    path:[[-25,-216],[-38,-158],[-50,-100]],
    bunkers:[{x:-62,z:-144,r:6},{x:-36,z:-112,r:7}], water:null },

  // H8  Par 4 — Dogleg right, demands shaped tee shot.
  { id:8, par:4,
    tee:[-55,-95], green:[-155,-30], gr:10, fw:11,
    path:[[-55,-95],[-96,-62],[-155,-30]],
    bunkers:[{x:-102,z:-50,r:7},{x:-142,z:-40,r:6}], water:null },

  // H9  Par 4 — Signature finisher of front 9, back toward turn.
  { id:9, par:4,
    tee:[-160,-25], green:[-45,-8], gr:10, fw:12,
    path:[[-160,-25],[-104,-17],[-45,-8]],
    bunkers:[{x:-116,z:-6,r:6},{x:-58,z:-18,r:6}], water:null },

  // ── BACK 9 ───────────────────────────────────────────────────────

  // H10  Par 4 — Heads North, long straight hole.
  { id:10, par:4,
    tee:[-40,-2], green:[-60,115], gr:10, fw:12,
    path:[[-40,-2],[-50,56],[-60,115]],
    bunkers:[{x:-72,z:74,r:6},{x:-46,z:90,r:7}], water:null },

  // H11  Par 4 — Dogleg NE, trees pinch the corner.
  { id:11, par:4,
    tee:[-65,120], green:[80,170], gr:10, fw:11,
    path:[[-65,120],[-10,150],[80,170]],
    bunkers:[{x:8,z:140,r:6},{x:64,z:182,r:7}], water:null },

  // H12  Par 5 — Long East, pond on right, risk-reward.
  { id:12, par:5,
    tee:[85,175], green:[290,165], gr:11, fw:13,
    path:[[85,175],[186,175],[290,165]],
    bunkers:[{x:202,z:162,r:7},{x:268,z:178,r:6}],
    water:{x:178,z:172,r:11} },

  // H13  Par 3 — Short South into tight green.
  { id:13, par:3,
    tee:[295,160], green:[310,78], gr:9, fw:10,
    path:[[295,160],[310,78]],
    bunkers:[{x:298,z:105,r:7},{x:322,z:90,r:6}], water:null },

  // H14  Par 4 — Dogleg SW, long second shot.
  { id:14, par:4,
    tee:[312,73], green:[195,40], gr:10, fw:11,
    path:[[312,73],[266,58],[195,40]],
    bunkers:[{x:248,z:48,r:6},{x:200,z:52,r:6}], water:null },

  // H15  Par 5 — Long journey back SW, generous fairway.
  { id:15, par:5,
    tee:[190,35], green:[60,-30], gr:11, fw:13,
    path:[[190,35],[128,10],[60,-30]],
    bunkers:[{x:142,z:-2,r:6},{x:74,z:-20,r:7}], water:null },

  // H16  Par 3 — Straight South, all-or-nothing green.
  { id:16, par:3,
    tee:[55,-35], green:[50,-120], gr:9, fw:10,
    path:[[55,-35],[50,-120]],
    bunkers:[{x:38,z:-90,r:7},{x:64,z:-94,r:6}], water:null },

  // H17  Par 4 — West dogleg, demands precision second.
  { id:17, par:4,
    tee:[45,-125], green:[-100,-140], gr:10, fw:11,
    path:[[45,-125],[-28,-132],[-100,-140]],
    bunkers:[{x:-24,z:-120,r:6},{x:-84,z:-152,r:7}], water:null },

  // H18  Par 4 — Classic finisher, sweeps NE back to clubhouse.
  { id:18, par:4,
    tee:[-105,-135], green:[-15,-5], gr:10, fw:12,
    path:[[-105,-135],[-62,-78],[-15,-5]],
    bunkers:[{x:-68,z:-66,r:6},{x:-28,z:-18,r:7}], water:null },
];

// ═════════════════════════════════════════════════════════════════════
class CourseMesh {

  constructor() {
    this.scene          = null;
    this.groundMesh     = null;
    this.groundGeometry = null;
    this.landscapeStyle = 'parkland';

    this.GRID = 512;   // grid resolution — higher = smaller squares
    this.WORLD_SIZE = 300;   // metres — recomputed per hole in loadHole()/init()

    this.heightField  = new Float32Array(this.GRID * this.GRID);
    this.surfaceField = new Uint8Array(this.GRID * this.GRID);

    this._greenSlopeDeg = 0;
    this._disposables   = [];
    this._aimArrow      = null;

    this.currentHoleId  = 1;
    this._activeHoles   = [];   // single localized hole currently loaded
  }

  // ── Public API ─────────────────────────────────────────────────────

  init(scene) {
    this.scene = scene;
    this._activeHoles = [this._localizeHole(this._findHole(this.currentHoleId))];
    this.WORLD_SIZE   = this._computeWorldSizeForHole(this._activeHoles[0]);
    this._buildCourse(this.landscapeStyle);
  }

  // Loads a single hole as its own standalone map — tee at local (0,0),
  // green direction aligned to +X — so the existing physics/camera code
  // (which always launches from world origin along aimDeg) needs no changes
  // regardless of which of the 18 holes is selected.
  loadHole(holeNumber) {
    this.currentHoleId  = holeNumber;
    this._activeHoles   = [this._localizeHole(this._findHole(holeNumber))];
    this.WORLD_SIZE     = this._computeWorldSizeForHole(this._activeHoles[0]);
    this._greenSlopeDeg = 0;
    this._disposeAll();
    this._buildCourse(this.landscapeStyle);
  }

  setLandscape(style) {
    this.landscapeStyle = style;
    this._greenSlopeDeg = 0;
    this._disposeAll();
    this._buildCourse(style);
  }

  // Half-extent of the currently loaded map. Physics uses this for the
  // out-of-bounds check instead of a fixed constant, since map size now
  // varies per hole (short par 3 vs long par 5).
  getBounds() {
    return this.WORLD_SIZE / 2 - 5;
  }

  _disposeAll() {
    // Dispose aim arrow separately (not in _disposables)
    if (this._aimArrow) {
      this.scene.remove(this._aimArrow);
      this._aimArrow = null;
    }

    this._disposables.forEach(obj => {
      this.scene.remove(obj);
      obj.geometry?.dispose();
      if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
      else if (obj.material) obj.material.dispose();
    });
    this._disposables   = [];
    this.groundMesh     = null;
    this.groundGeometry = null;
  }

  setSlope(angleDeg) {
    this._greenSlopeDeg = angleDeg;
    if (this.groundGeometry) this._refreshGroundGeometry();
  }

  // Queried every frame by physics — bilinear interpolation
  getHeightAt(wx, wz) {
    const N   = this.GRID;
    const gxf = (wx / this.WORLD_SIZE + 0.5) * (N - 1);
    const gzf = (wz / this.WORLD_SIZE + 0.5) * (N - 1);

    const ix = Math.max(0, Math.min(N - 2, Math.floor(gxf)));
    const iz = Math.max(0, Math.min(N - 2, Math.floor(gzf)));
    const fx = gxf - ix, fz = gzf - iz;

    const h00 = this.heightField[ iz      * N + ix    ];
    const h10 = this.heightField[ iz      * N + ix + 1];
    const h01 = this.heightField[(iz + 1) * N + ix    ];
    const h11 = this.heightField[(iz + 1) * N + ix + 1];

    let h = h00*(1-fx)*(1-fz) + h10*fx*(1-fz) + h01*(1-fx)*fz + h11*fx*fz;

    // Green slope — live offset, does not touch the base array
    if (this._greenSlopeDeg !== 0) {
      const slope = Math.tan(this._greenSlopeDeg * Math.PI / 180);
      for (const hole of this._activeHoles) {
        const d = Math.sqrt((wx - hole.green[0]) ** 2 + (wz - hole.green[1]) ** 2);
        if (d < hole.gr + 4) {
          const t = 1 - smoothstep(hole.gr - 1, hole.gr + 4, d);
          h += wz * slope * t;
        }
      }
    }

    return h;
  }

  // Queried by CollisionHandler for surface friction
  getSurfaceAt(wx, wz) {
    const N  = this.GRID;
    const gx = Math.max(0, Math.min(N - 1, Math.round((wx / this.WORLD_SIZE + 0.5) * (N - 1))));
    const gz = Math.max(0, Math.min(N - 1, Math.round((wz / this.WORLD_SIZE + 0.5) * (N - 1))));
    return this.surfaceField[gz * N + gx];
  }

  // Rotates the aim arrow to match the player's aim direction
  updateAimArrow(aimDeg) {
    if (!this._aimArrow) return;
    const r = (aimDeg * Math.PI) / 180;
    this._aimArrow.setDirection(new THREE.Vector3(Math.cos(r), 0, Math.sin(r)).normalize());
  }

  showAimArrow(visible) {
    if (this._aimArrow) this._aimArrow.visible = visible;
  }

  // ── Construction pipeline ──────────────────────────────────────────

  _buildCourse(style) {
    this._generateHeightField(style);
    this._generateSurfaceField();
    this._buildGround(style);
    this._buildHoleMarkers();
    this._buildVegetation(style);
    this._buildWaterHazards(style);
    this._buildBunkerVisuals(style);
    this._buildAimArrow();
  }

  // ── Height field ───────────────────────────────────────────────────

  _generateHeightField(style) {
    const N = this.GRID;

    // Pass 1 — landscape undulation
    for (let gz = 0; gz < N; gz++) {
      for (let gx = 0; gx < N; gx++) {
        const wx = this._gxToWorld(gx);
        const wz = this._gzToWorld(gz);
        this.heightField[gz * N + gx] = this._rawHeight(style, wx, wz);
      }
    }

    // Pass 2 — flatten ALL play zones (tee, fairway, green) to 0
    // with smooth blending so terrain flows naturally into play areas
    const BLEND = 8;   // metres of transition zone

    for (let gz = 0; gz < N; gz++) {
      for (let gx = 0; gx < N; gx++) {
        const wx = this._gxToWorld(gx);
        const wz = this._gzToWorld(gz);
        const idx = gz * N + gx;

        let tPlay = 0;

        for (const hole of this._activeHoles) {
          // Fairway corridor
          const df = this._distToPolyline(wx, wz, hole.path);
          tPlay = Math.max(tPlay, 1 - smoothstep(0, BLEND, Math.max(0, df - hole.fw)));

          // Green
          const dg = Math.sqrt((wx - hole.green[0]) ** 2 + (wz - hole.green[1]) ** 2);
          tPlay = Math.max(tPlay, 1 - smoothstep(0, BLEND, Math.max(0, dg - hole.gr)));

          // Tee
          const dt = Math.sqrt((wx - hole.tee[0]) ** 2 + (wz - hole.tee[1]) ** 2);
          tPlay = Math.max(tPlay, 1 - smoothstep(0, 5, dt));
        }

        // Flatten to 0 in play zones
        this.heightField[idx] *= (1 - tPlay);

        // Bunker depressions
        for (const hole of this._activeHoles) {
          for (const b of hole.bunkers) {
            const d = Math.sqrt((wx - b.x) ** 2 + (wz - b.z) ** 2);
            if (d < b.r) {
              this.heightField[idx] -= 0.3 * ((1 - d / b.r) ** 2);
            }
          }
          // Water depression
          if (hole.water) {
            const w = hole.water;
            const d = Math.sqrt((wx - w.x) ** 2 + (wz - w.z) ** 2);
            if (d < w.r) {
              this.heightField[idx] -= 0.6 * ((1 - d / w.r) ** 2);
            }
          }
        }
      }
    }
  }

  _rawHeight(style, wx, wz) {
    switch (style) {
      case 'links':
        // Coastal dunes — amplitudes scaled so max gradient ~0.18 < MU_ROLL_ROUGH (0.20)
        // This prevents the ball from accelerating indefinitely in rough.
        return 0.75 * (
          1.6 * Math.sin(wx * 0.028 + 0.5)
        + 1.2 * Math.sin(wz * 0.035 + 1.1)
        + 0.8 * Math.sin(wx * 0.065 + wz * 0.048 + 2.0)
        + 0.5 * Math.sin(wx * 0.110 - wz * 0.075 + 3.0)
        );

      case 'parkland':
        return 0.75 * (
          0.9 * Math.sin(wx * 0.018 + 0.3)
        + 0.7 * Math.sin(wz * 0.022 + 0.9)
        + 0.5 * Math.sin(wx * 0.046 + wz * 0.038 + 1.5)
        + 0.2 * Math.sin(wx * 0.085 - wz * 0.055 + 2.4)
        );

      case 'heathland':
        return 0.75 * (
          1.2 * Math.sin(wx * 0.036 + 0.7)
        + 1.0 * Math.sin(wz * 0.050 + 0.2)
        + 0.7 * Math.sin(wx * 0.082 + wz * 0.064 + 1.0)
        + 0.4 * Math.sin(wx * 0.140 - wz * 0.100 + 2.5)
        );

      case 'desert':
        return 0.75 * (
          0.4 * Math.sin(wx * 0.013 + 0.2)
        + 0.3 * Math.sin(wz * 0.018 + 0.9)
        + 0.2 * Math.sin(wx * 0.038 + wz * 0.028 + 1.2)
        );

      default: return 0;
    }
  }

  // ── Surface field ──────────────────────────────────────────────────

  _generateSurfaceField() {
    const N = this.GRID;
    const S = CONSTANTS;

    for (let gz = 0; gz < N; gz++) {
      for (let gx = 0; gx < N; gx++) {
        const wx = this._gxToWorld(gx);
        const wz = this._gzToWorld(gz);
        const idx = gz * N + gx;

        let surface = S.SURFACE_ROUGH;

        for (const hole of this._activeHoles) {
          // Fairway corridor
          const df = this._distToPolyline(wx, wz, hole.path);
          if (df <= hole.fw) surface = higher(surface, S.SURFACE_FAIRWAY);

          // Bunkers
          for (const b of hole.bunkers) {
            if (Math.sqrt((wx - b.x) ** 2 + (wz - b.z) ** 2) <= b.r)
              surface = higher(surface, S.SURFACE_SAND);
          }

          // Water
          if (hole.water) {
            const w = hole.water;
            if (Math.sqrt((wx - w.x) ** 2 + (wz - w.z) ** 2) <= w.r)
              surface = higher(surface, S.SURFACE_WATER);
          }

          // Fringe + Green
          const dg = Math.sqrt((wx - hole.green[0]) ** 2 + (wz - hole.green[1]) ** 2);
          if (dg <= hole.gr + 3) surface = higher(surface, S.SURFACE_FRINGE);
          if (dg <= hole.gr)     surface = higher(surface, S.SURFACE_GREEN);

          // Tee box
          const dt = Math.sqrt((wx - hole.tee[0]) ** 2 + (wz - hole.tee[1]) ** 2);
          if (dt <= 4) surface = higher(surface, S.SURFACE_TEE);
        }

        this.surfaceField[idx] = surface;
      }
    }
  }

  // ── Ground mesh ────────────────────────────────────────────────────

  _buildGround(style) {
    const segs = this.GRID - 1;
    this.groundGeometry = new THREE.PlaneGeometry(this.WORLD_SIZE, this.WORLD_SIZE, segs, segs);
    this._applyHeightToGeometry();
    this._applyVertexColors(style);

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 1.0, metalness: 0.0,
    });

    this.groundMesh = new THREE.Mesh(this.groundGeometry, mat);
    this.groundMesh.rotation.x    = -Math.PI / 2;
    this.groundMesh.receiveShadow = true;
    this.scene.add(this.groundMesh);
    this._disposables.push(this.groundMesh);
  }

  _applyHeightToGeometry() {
    const pos  = this.groundGeometry.attributes.position;
    const segs = this.GRID - 1;

    for (let row = 0; row <= segs; row++) {
      for (let col = 0; col <= segs; col++) {
        const vIdx  = row * (segs + 1) + col;
        // NOTE: after this mesh's rotation.x = -Math.PI/2, a geometry-space
        // vertex at (x, y_geom, height) lands in world space at
        // (x, height, -y_geom). PlaneGeometry lays out row 0 at
        // y_geom = +WORLD_SIZE/2 and row=segs at y_geom = -WORLD_SIZE/2, i.e.
        // y_geom = (0.5 - row/segs) * WORLD_SIZE, so the vertex's FINAL
        // world Z is -y_geom = (row/segs - 0.5) * WORLD_SIZE — no extra
        // negation needed. (The previous version negated this a second
        // time, which sampled each vertex's height from its Z-mirror
        // image instead of its own true world position — the rendered
        // ground was a mirrored copy of the terrain physics actually uses.)
        const worldX = (col / segs - 0.5) * this.WORLD_SIZE;
        const worldZ = (row / segs - 0.5) * this.WORLD_SIZE;
        pos.setZ(vIdx, this.getHeightAt(worldX, worldZ));
      }
    }

    pos.needsUpdate = true;
    this.groundGeometry.computeVertexNormals();
  }

  _refreshGroundGeometry() {
    this._applyHeightToGeometry();
  }

  _applyVertexColors(style) {
    const segs  = this.GRID - 1;
    const count = (segs + 1) * (segs + 1);
    const colors = new Float32Array(count * 3);

    for (let row = 0; row <= segs; row++) {
      for (let col = 0; col <= segs; col++) {
        const vIdx   = row * (segs + 1) + col;
        // Same true-world-position mapping as _applyHeightToGeometry —
        // must match or the color paint and the height bumps (and the
        // fairway/green markers, which use true coordinates directly)
        // end up on different, mirrored patches of ground.
        const worldX = (col / segs - 0.5) * this.WORLD_SIZE;
        const worldZ = (row / segs - 0.5) * this.WORLD_SIZE;
        const surface = this.getSurfaceAt(worldX, worldZ);
        const c = this._surfaceColor(surface, style);
        const n = (noise(worldX * 0.1, worldZ * 0.1) - 0.5) * 0.04;
        colors[vIdx * 3]     = Math.max(0, Math.min(1, c.r + n));
        colors[vIdx * 3 + 1] = Math.max(0, Math.min(1, c.g + n * 0.7));
        colors[vIdx * 3 + 2] = Math.max(0, Math.min(1, c.b + n * 0.4));
      }
    }

    this.groundGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }

  _surfaceColor(surface, style) {
    const S = CONSTANTS;
    switch (surface) {
      case S.SURFACE_GREEN:   return { r:0.18, g:0.62, b:0.14 };
      case S.SURFACE_FRINGE:  return { r:0.21, g:0.57, b:0.16 };
      case S.SURFACE_FAIRWAY: return { r:0.24, g:0.52, b:0.17 };
      case S.SURFACE_TEE:     return { r:0.26, g:0.55, b:0.19 };
      case S.SURFACE_SAND:
        return style === 'heathland' ? { r:0.70, g:0.60, b:0.40 }
                                     : { r:0.82, g:0.72, b:0.47 };
      case S.SURFACE_WATER:   return { r:0.14, g:0.33, b:0.62 };
      case S.SURFACE_ROUGH:
      default:
        switch (style) {
          case 'links':     return { r:0.50, g:0.53, b:0.25 };
          case 'parkland':  return { r:0.11, g:0.34, b:0.09 };
          case 'heathland': return { r:0.44, g:0.36, b:0.22 };
          case 'desert':    return { r:0.70, g:0.57, b:0.30 };
          default:          return { r:0.18, g:0.40, b:0.12 };
        }
    }
  }

  // ── Hole markers ───────────────────────────────────────────────────

  _buildHoleMarkers() {
    const holeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.3, metalness: 0.8 });

    // Flag colors rotate through 4 colours for visual variety
    const flagColors = [0xff2222, 0xffdd00, 0x2255ff, 0xff8800];

    this._activeHoles.forEach((hole, i) => {
      const [hx, hz] = hole.green;
      const gy = this.getHeightAt(hx, hz);

      // Cup
      const cupGeo = new THREE.CircleGeometry(0.108, 24);
      const cup    = new THREE.Mesh(cupGeo, holeMat);
      cup.rotation.x = -Math.PI / 2;
      cup.position.set(hx, gy + 0.02, hz);
      this.scene.add(cup);
      this._disposables.push(cup);

      // Pole
      const poleGeo = new THREE.CylinderGeometry(0.018, 0.018, 2.4, 7);
      const pole    = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(hx, gy + 1.2, hz);
      pole.castShadow = true;
      this.scene.add(pole);
      this._disposables.push(pole);

      // Flag
      const flagColor = flagColors[i % flagColors.length];
      const flagGeo   = new THREE.PlaneGeometry(0.55, 0.32);
      const flagMat   = new THREE.MeshStandardMaterial({
        color: flagColor, roughness: 0.9, side: THREE.DoubleSide,
      });
      const flag = new THREE.Mesh(flagGeo, flagMat);
      flag.position.set(hx + 0.28, gy + 2.1, hz);
      flag.castShadow = true;
      this.scene.add(flag);
      this._disposables.push(flag);

      // Hole number label (small disc with different colour)
      const labelGeo = new THREE.CircleGeometry(0.6, 16);
      const labelMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1.0 });
      const label    = new THREE.Mesh(labelGeo, labelMat);
      label.rotation.x = -Math.PI / 2;
      label.position.set(hx + 1.2, gy + 0.02, hz);
      this.scene.add(label);
      this._disposables.push(label);

      // Tee marker
      const ty = this.getHeightAt(hole.tee[0], hole.tee[1]);
      const teeGeo = new THREE.CircleGeometry(0.5, 20);
      const teeMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.9 });
      const tee    = new THREE.Mesh(teeGeo, teeMat);
      tee.rotation.x = -Math.PI / 2;
      tee.position.set(hole.tee[0], ty + 0.02, hole.tee[1]);
      this.scene.add(tee);
      this._disposables.push(tee);
    });
  }

  // ── Vegetation ─────────────────────────────────────────────────────

  _buildVegetation(style) {
    const S     = CONSTANTS;
    const step  = 18;   // candidate grid spacing (metres)
    const half  = this.WORLD_SIZE / 2 - 10;

    for (let wx = -half; wx <= half; wx += step) {
      for (let wz = -half; wz <= half; wz += step) {
        // Deterministic jitter so trees don't look grid-like
        const jx = wx + (noise(wx,  wz) - 0.5) * 12;
        const jz = wz + (noise(wz, -wx) - 0.5) * 12;

        if (this.getSurfaceAt(jx, jz) !== S.SURFACE_ROUGH) continue;

        // Don't place trees immediately next to play zones
        const tooClose =
          this.getSurfaceAt(jx + 13, jz) !== S.SURFACE_ROUGH ||
          this.getSurfaceAt(jx - 13, jz) !== S.SURFACE_ROUGH ||
          this.getSurfaceAt(jx, jz + 13) !== S.SURFACE_ROUGH ||
          this.getSurfaceAt(jx, jz - 13) !== S.SURFACE_ROUGH;
        if (tooClose) continue;

        this._placeTree(style, jx, jz);
      }
    }
  }

  _placeTree(style, wx, wz) {
    const gy = this.getHeightAt(wx, wz);
    // Use noise to skip ~30% of positions for natural gaps
    if (noise(wx * 0.07, wz * 0.07) < 0.3) return;

    switch (style) {
      case 'links':     this._placeScrub(wx, gy, wz);    break;
      case 'parkland':  this._placeDeciduous(wx, gy, wz); break;
      case 'heathland': noise(wx, wz) > 0.55
                          ? this._placePine(wx, gy, wz)
                          : this._placeHeather(wx, gy, wz); break;
      case 'desert':    noise(wx * 0.05, wz * 0.05) > 0.6
                          ? this._placeCactus(wx, gy, wz)
                          : this._placeRock(wx, gy, wz);    break;
    }
  }

  _placeScrub(x, gy, z) {
    const mat  = new THREE.MeshStandardMaterial({ color: 0x6b7a38, roughness: 1 });
    const w    = 1.0 + noise(x, z) * 0.8;
    const h    = 0.35 + noise(z, x) * 0.2;
    const geo  = new THREE.SphereGeometry(w, 7, 4);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.set(1.2, h / w, 1.4);
    mesh.position.set(x, gy + h * 0.3, z);
    mesh.castShadow = true;
    this.scene.add(mesh);
    this._disposables.push(mesh);
  }

  _placeDeciduous(x, gy, z) {
    const h  = 3.5 + noise(x, z) * 2.0;
    const r  = 1.4 + noise(z, x) * 0.8;
    const trunkMat  = new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 1 });
    const leavesMat = new THREE.MeshStandardMaterial({ color: 0x1a5610, roughness: 1 });

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.20, h * 0.45, 6), trunkMat);
    trunk.position.set(x, gy + h * 0.22, z);
    trunk.castShadow = true;
    this.scene.add(trunk);
    this._disposables.push(trunk);

    const canopy = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), leavesMat);
    canopy.position.set(x, gy + h * 0.45 + r * 0.65, z);
    canopy.castShadow = canopy.receiveShadow = true;
    this.scene.add(canopy);
    this._disposables.push(canopy);
  }

  _placePine(x, gy, z) {
    const h  = 4.0 + noise(x, z) * 2.5;
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 1 });
    const pineMat  = new THREE.MeshStandardMaterial({ color: 0x234d1c, roughness: 1 });

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.15, h * 0.28, 6), trunkMat);
    trunk.position.set(x, gy + h * 0.14, z);
    trunk.castShadow = true;
    this.scene.add(trunk);
    this._disposables.push(trunk);

    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.7 + noise(z,x)*0.3, h * 0.82, 7), pineMat);
    cone.position.set(x, gy + h * 0.28 + h * 0.41, z);
    cone.castShadow = true;
    this.scene.add(cone);
    this._disposables.push(cone);
  }

  _placeHeather(x, gy, z) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x7a4a88, roughness: 1 });
    const r   = 0.30 + noise(x, z) * 0.25;
    const geo = new THREE.SphereGeometry(r, 6, 4);
    const m   = new THREE.Mesh(geo, mat);
    m.scale.set(1.5, 0.55, 1.3);
    m.position.set(x, gy + r * 0.25, z);
    this.scene.add(m);
    this._disposables.push(m);
  }

  _placeCactus(x, gy, z) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x4a7a36, roughness: 1 });
    const h   = 1.2 + noise(x, z) * 1.0;

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, h, 7), mat);
    trunk.position.set(x, gy + h / 2, z);
    trunk.castShadow = true;
    this.scene.add(trunk);
    this._disposables.push(trunk);

    if (h > 1.5) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, h * 0.44, 6), mat);
      arm.rotation.z = Math.PI / 3;
      arm.position.set(x + h * 0.20, gy + h * 0.55, z);
      this.scene.add(arm);
      this._disposables.push(arm);
    }

    const top = new THREE.Mesh(new THREE.SphereGeometry(0.10, 6, 5), mat);
    top.position.set(x, gy + h + 0.08, z);
    this.scene.add(top);
    this._disposables.push(top);
  }

  _placeRock(x, gy, z) {
    const mat  = new THREE.MeshStandardMaterial({ color: 0x8a7060, roughness: 1 });
    const s    = 0.4 + noise(x, z) * 0.5;
    const geo  = new THREE.DodecahedronGeometry(s, 0);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.set(noise(x,z)*2, noise(z,x)*2, noise(x+z,z)*2);
    mesh.position.set(x, gy + s * 0.2, z);
    mesh.castShadow = true;
    this.scene.add(mesh);
    this._disposables.push(mesh);
  }

  // ── Hazard visuals ─────────────────────────────────────────────────

  _buildBunkerVisuals(style) {
    const sandHex = style === 'heathland' ? 0xb09870 : 0xd4c878;

    this._activeHoles.forEach(hole => {
      hole.bunkers.forEach(b => {
        const gy  = this.getHeightAt(b.x, b.z);
        // Organic bunker shape via noise-displaced polygon
        const pts = [];
        const n   = 14;
        for (let i = 0; i <= n; i++) {
          const angle = (i / n) * Math.PI * 2;
          const nv    = noise(b.x * 0.12 + Math.cos(angle) * 3, b.z * 0.12 + Math.sin(angle) * 3);
          const r     = b.r * (0.72 + nv * 0.55);
          pts.push(new THREE.Vector2(Math.cos(angle) * r, Math.sin(angle) * r));
        }
        const shape = new THREE.Shape(pts);
        const geo   = new THREE.ShapeGeometry(shape);
        const mat   = new THREE.MeshStandardMaterial({ color: sandHex, roughness: 1.0 });
        const mesh  = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(b.x, gy + 0.02, b.z);
        this.scene.add(mesh);
        this._disposables.push(mesh);
      });
    });
  }

  _buildWaterHazards(style) {
    if (style === 'desert') return;  // no water in desert

    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x1a4f8c, roughness: 0.05, metalness: 0.15,
    });

    this._activeHoles.forEach(hole => {
      if (!hole.water) return;
      const w  = hole.water;
      const gy = this.getHeightAt(w.x, w.z);
      const geo  = new THREE.CircleGeometry(w.r, 28);
      const mesh = new THREE.Mesh(geo, waterMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(w.x, gy + 0.03, w.z);
      this.scene.add(mesh);
      this._disposables.push(mesh);
    });
  }

  // ── Aim arrow ──────────────────────────────────────────────────────

  _buildAimArrow() {
    const dir    = new THREE.Vector3(1, 0, 0);
    const origin = new THREE.Vector3(0, 0.15, 0);
    this._aimArrow = new THREE.ArrowHelper(dir, origin, 28, 0xff8800, 5, 2.5);
    this._aimArrow.visible = true;
    this.scene.add(this._aimArrow);
  }

  // ── Hole loading / localization ─────────────────────────────────────
  // Transforms a hole out of the master 18-hole layout into a standalone
  // local coordinate system: tee at (0,0), green direction aligned to +X.
  // This lets the existing physics/camera code — which always launches
  // from world origin along aimDeg — work unchanged for any single hole.

  _findHole(holeNumber) {
    return HOLES.find(h => h.id === holeNumber) || HOLES[0];
  }

  _localizeHole(hole) {
    const [tx, tz] = hole.tee;
    const [gx, gz] = hole.green;
    const angle = Math.atan2(gz - tz, gx - tx);
    const cos = Math.cos(-angle), sin = Math.sin(-angle);

    const tf = ([wx, wz]) => {
      const dx = wx - tx, dz = wz - tz;
      return [dx * cos - dz * sin, dx * sin + dz * cos];
    };

    return {
      ...hole,
      tee:     [0, 0],
      green:   tf(hole.green),
      path:    hole.path.map(tf),
      bunkers: hole.bunkers.map(b => {
        const [lx, lz] = tf([b.x, b.z]);
        return { x: lx, z: lz, r: b.r };
      }),
      water: hole.water
        ? (([lx, lz]) => ({ x: lx, z: lz, r: hole.water.r }))(tf([hole.water.x, hole.water.z]))
        : null,
    };
  }

  // Sizes the map to fit the hole's full extent (tee → green, bunkers,
  // water) plus a margin for rough/vegetation/behind-tee space.
  _computeWorldSizeForHole(hole) {
    let maxExtent = 0;
    const pts = [hole.tee, hole.green, ...hole.path];
    for (const [x, z] of pts) maxExtent = Math.max(maxExtent, Math.abs(x), Math.abs(z));
    for (const b of hole.bunkers) {
      maxExtent = Math.max(maxExtent, Math.abs(b.x) + b.r, Math.abs(b.z) + b.r);
    }
    if (hole.water) {
      maxExtent = Math.max(maxExtent, Math.abs(hole.water.x) + hole.water.r, Math.abs(hole.water.z) + hole.water.r);
    }

    const margin = 60;
    const size   = 2 * (maxExtent + margin);
    return Math.max(220, Math.min(600, size));
  }

  // ── Geometry helpers ───────────────────────────────────────────────

  _gxToWorld(gx) { return (gx / (this.GRID - 1) - 0.5) * this.WORLD_SIZE; }
  _gzToWorld(gz) { return (gz / (this.GRID - 1) - 0.5) * this.WORLD_SIZE; }

  // Distance from point (px,pz) to a polyline defined by path = [[x,z], ...]
  _distToPolyline(px, pz, path) {
    let min = Infinity;
    for (let i = 0; i < path.length - 1; i++) {
      const d = this._distToSegment(px, pz, path[i][0], path[i][1], path[i+1][0], path[i+1][1]);
      if (d < min) min = d;
    }
    return min;
  }

  // Distance from point (px,pz) to segment (ax,az)→(bx,bz)
  _distToSegment(px, pz, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    const lenSq = dx * dx + dz * dz;
    if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (pz - az) ** 2);
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq));
    return Math.sqrt((px - ax - t * dx) ** 2 + (pz - az - t * dz) ** 2);
  }

}

export default CourseMesh;
