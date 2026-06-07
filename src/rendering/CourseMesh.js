// rendering/CourseMesh.js
// Builds the golf course ground with realistic grass material.
// Uses MeshStandardMaterial (PBR) for proper light response.
// No external textures — procedural vertex color variation.

import * as THREE from 'three';

class CourseMesh {

  constructor() {
    this.groundMesh = null;
    this.scene      = null;
  }

  // ------------------------------------------------------------------
  // init()
  // ------------------------------------------------------------------
  init(scene) {
    this.scene = scene;
    this._buildGround();
    this._buildHoleMarker();
    this._buildTeeMarker();
    this._buildYardLines();
    this._buildTrees();
  }

  // ------------------------------------------------------------------
  // _buildGround()
  // PBR grass material with vertex color variation for natural look.
  // ------------------------------------------------------------------
  _buildGround() {

    const size     = 300;
    const segments = 80;   // more segments = more vertex color detail

    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);

    // ── Vertex color variation ─────────────────────────────────────
    // Adds subtle green variation across the ground without a texture.
    // Each vertex gets a slightly different shade of green.
    const count  = geometry.attributes.position.count;
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const x = geometry.attributes.position.getX(i);
      const z = geometry.attributes.position.getY(i);   // Y before rotation

      // Base green with small random variation
      const variation = (Math.random() - 0.5) * 0.08;

      // Slightly darker near edges (fairway → rough transition)
      const edgeFactor = Math.min(
        1.0,
        1.0 - (Math.abs(x) + Math.abs(z)) / (size * 0.8)
      );

      colors[i * 3]     = 0.18 + variation * 0.5;              // R
      colors[i * 3 + 1] = 0.42 + variation + edgeFactor * 0.1; // G
      colors[i * 3 + 2] = 0.12 + variation * 0.3;              // B
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // ── PBR material ───────────────────────────────────────────────
    // MeshStandardMaterial responds correctly to the Sky shader lighting.
    // roughness=1 → no specular shine (grass is matte)
    // metalness=0 → grass is not metallic
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,     // use the colors we set above
      roughness:    1.0,
      metalness:    0.0,
      envMapIntensity: 0.3,
    });

    this.groundMesh = new THREE.Mesh(geometry, material);
    this.groundMesh.rotation.x    = -Math.PI / 2;
    this.groundMesh.receiveShadow = true;
    this.scene.add(this.groundMesh);

    // ── Subtle grid overlay ────────────────────────────────────────
    // Much more transparent than before — just enough for depth cues
    const grid = new THREE.GridHelper(size, 60, 0x000000, 0x000000);
    grid.position.y                = 0.01;
    grid.material.opacity          = 0.06;
    grid.material.transparent      = true;
    this.scene.add(grid);

  }

  // ------------------------------------------------------------------
  // _buildHoleMarker()
  // ------------------------------------------------------------------
  _buildHoleMarker() {

    // Hole
    const holeGeo = new THREE.CircleGeometry(0.108, 32);
    const holeMat = new THREE.MeshStandardMaterial({
      color:     0x111111,
      roughness: 0.8,
    });
    const hole = new THREE.Mesh(holeGeo, holeMat);
    hole.rotation.x = -Math.PI / 2;
    hole.position.set(150, 0.02, 0);
    this.scene.add(hole);

    // Pole
    const poleGeo = new THREE.CylinderGeometry(0.02, 0.02, 2.2, 8);
    const poleMat = new THREE.MeshStandardMaterial({
      color:     0xdddddd,
      roughness: 0.3,
      metalness: 0.8,
    });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(150, 1.1, 0);
    pole.castShadow = true;
    this.scene.add(pole);

    // Flag
    const flagGeo = new THREE.PlaneGeometry(0.6, 0.35);
    const flagMat = new THREE.MeshStandardMaterial({
      color:    0xff2222,
      roughness: 0.9,
      side:     THREE.DoubleSide,
    });
    const flag = new THREE.Mesh(flagGeo, flagMat);
    flag.position.set(150.3, 2.0, 0);
    flag.castShadow = true;
    this.scene.add(flag);

  }

  // ------------------------------------------------------------------
  // _buildTeeMarker()
  // ------------------------------------------------------------------
  _buildTeeMarker() {

    const teeGeo = new THREE.CircleGeometry(0.3, 24);
    const teeMat = new THREE.MeshStandardMaterial({
      color:     0xeeeeee,
      roughness: 0.9,
    });
    const tee = new THREE.Mesh(teeGeo, teeMat);
    tee.rotation.x = -Math.PI / 2;
    tee.position.set(0, 0.02, 0);
    this.scene.add(tee);

  }

  // ------------------------------------------------------------------
  // _buildYardLines()
  // Distance markers every 50 m along the fairway.
  // ------------------------------------------------------------------
  _buildYardLines() {

    const mat = new THREE.LineBasicMaterial({
      color:       0xffffff,
      opacity:     0.15,
      transparent: true,
    });

    for (let x = 50; x <= 250; x += 50) {
      const pts = [
        new THREE.Vector3(x, 0.02, -15),
        new THREE.Vector3(x, 0.02,  15),
      ];
      const geo  = new THREE.BufferGeometry().setFromPoints(pts);
      this.scene.add(new THREE.Line(geo, mat));

      // Distance label using a small white disc
      const discGeo = new THREE.CircleGeometry(0.4, 16);
      const discMat = new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: 1,
      });
      const disc = new THREE.Mesh(discGeo, discMat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(x, 0.03, 12);
      this.scene.add(disc);
    }

  }

  // ------------------------------------------------------------------
  // _buildTrees()
  // Simple low-poly trees along the sides of the fairway.
  // No external models — built from cylinders and cones.
  // Adds depth and scale reference during flight.
  // ------------------------------------------------------------------
  _buildTrees() {

    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x5c3a1e, roughness: 1.0,
    });
    const leavesMat = new THREE.MeshStandardMaterial({
      color: 0x2d5a1b, roughness: 1.0,
    });

    const treePositions = [];

    // Left side of fairway (negative Z)
    for (let x = 10; x <= 260; x += 18) {
      treePositions.push({ x, z: -(14 + Math.random() * 8) });
    }
    // Right side of fairway (positive Z)
    for (let x = 10; x <= 260; x += 18) {
      treePositions.push({ x, z: (14 + Math.random() * 8) });
    }

    treePositions.forEach(({ x, z }) => {

      const height  = 3.5 + Math.random() * 2.5;
      const spread  = 1.2 + Math.random() * 0.8;

      // Trunk
      const trunkGeo = new THREE.CylinderGeometry(0.12, 0.18, height * 0.4, 6);
      const trunk    = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(x, height * 0.2, z);
      trunk.castShadow    = true;
      trunk.receiveShadow = true;
      this.scene.add(trunk);

      // Foliage — two stacked cones for a natural silhouette
      const cone1Geo = new THREE.ConeGeometry(spread, height * 0.7, 7);
      const cone1    = new THREE.Mesh(cone1Geo, leavesMat);
      cone1.position.set(x, height * 0.4 + height * 0.35, z);
      cone1.castShadow    = true;
      cone1.receiveShadow = true;
      this.scene.add(cone1);

      const cone2Geo = new THREE.ConeGeometry(spread * 0.65, height * 0.5, 7);
      const cone2    = new THREE.Mesh(cone2Geo, leavesMat);
      cone2.position.set(x, height * 0.4 + height * 0.7, z);
      cone2.castShadow = true;
      this.scene.add(cone2);

    });

  }

  // ------------------------------------------------------------------
  // setSlope()
  // ------------------------------------------------------------------
  setSlope(angleDeg) {
    const angleRad = (angleDeg * Math.PI) / 180;
    this.groundMesh.rotation.x = -Math.PI / 2 + angleRad;
  }

}

export default CourseMesh;

/*

PlaneGeometry is created in the XY plane by default in Three.js, so the -Math.PI / 2 rotation on the X axis is mandatory to make it lie flat — this is a very common source of confusion with Three.js ground planes.
The setSlope() method is the critical bridge between physics and rendering — when the user moves the slope slider, main.js calls both collisionHandler.setSlope(angle) and courseMesh.setSlope(angle) so the visual tilt always matches the physics. Without this, the ball would visually roll uphill while the physics says it's rolling downhill.
The 0.01 and 0.02 Y offsets on the grid, hole, tee, and yard lines prevent z-fighting — a flickering artifact that happens when two surfaces occupy exactly the same depth in the renderer.
The hole is placed at 150 m — a realistic par-3 distance. The regulation hole diameter of 108 mm (radius 0.054 m) is used for the disc, which gives a satisfying visual target at that distance.

*/