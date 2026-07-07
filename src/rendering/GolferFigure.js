// rendering/GolferFigure.js
// A simple stylized (non-photorealistic, non-rigged) golfer standing at
// address next to the tee. Built entirely from primitives — no external
// model to download, license, or scale-calibrate — so it works identically
// on every landscape, including the real scanned terrain.

import * as THREE from 'three';
import { VISUAL_RADIUS } from './BallMesh.js';

// Distance from the golfer's spine to the ball, in the golfer's own local
// +Z direction. ~1.0 m matches a real address stance and keeps the body
// clear of the tee marker's 0.5 m radius circle (0.62 m overlapped it).
const STAND_DISTANCE = 1.0;

// The clubhead should sit flush against the ball's near side (touching,
// not through its center, but not floating off to the side either).
// clubHead is 0.14 m deep (half = 0.07); pulling the ground-contact point
// back by radius + half-depth puts the clubhead's front face exactly at
// the ball's surface.
const CLUB_GROUND_Z = STAND_DISTANCE - VISUAL_RADIUS - 0.07;

class GolferFigure {

  constructor() {
    this.group = null;
  }

  init(scene) {
    this.group = new THREE.Group();

    const skin  = new THREE.MeshStandardMaterial({ color: 0xd8a878, roughness: 0.8 });
    const shirt = new THREE.MeshStandardMaterial({ color: 0x2b6cb0, roughness: 0.9 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x2f2f33, roughness: 0.9 });
    const shoe  = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 });
    const club  = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, roughness: 0.3, metalness: 0.8 });
    const cap   = new THREE.MeshStandardMaterial({ color: 0xe0e0e0, roughness: 0.9 });

    // Legs
    const legGeo = new THREE.CylinderGeometry(0.075, 0.09, 0.85, 10);
    const legL = new THREE.Mesh(legGeo, pants);
    legL.position.set(-0.13, 0.425, 0);
    const legR = new THREE.Mesh(legGeo, pants);
    legR.position.set(0.13, 0.425, 0);

    // Shoes
    const shoeGeo = new THREE.BoxGeometry(0.11, 0.07, 0.26);
    const shoeL = new THREE.Mesh(shoeGeo, shoe);
    shoeL.position.set(-0.13, 0.035, 0.05);
    const shoeR = new THREE.Mesh(shoeGeo, shoe);
    shoeR.position.set(0.13, 0.035, 0.05);

    // Torso — tilted slightly forward, as at address
    const torsoGeo = new THREE.CapsuleGeometry(0.19, 0.5, 6, 12);
    const torso = new THREE.Mesh(torsoGeo, shirt);
    torso.position.set(0, 1.15, 0);
    torso.rotation.x = 0.35;

    // Head
    const headGeo = new THREE.SphereGeometry(0.115, 16, 12);
    const head = new THREE.Mesh(headGeo, skin);
    head.position.set(0, 1.62, 0.10);

    // Cap
    const capGeo = new THREE.SphereGeometry(0.12, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const capMesh = new THREE.Mesh(capGeo, cap);
    capMesh.position.set(0, 1.645, 0.10);

    // Arms — angled down/forward to the grip point (address posture).
    // Grip sits roughly waist-high, most of the way from spine to ball.
    // X stays 0 (no forward/back bias) so the club lines up exactly with
    // the ball instead of appearing to stand slightly ahead of it.
    const armGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.62, 8);
    const gripPoint = new THREE.Vector3(0, 0.80, CLUB_GROUND_Z * 0.62);

    const armL = new THREE.Mesh(armGeo, shirt);
    armL.position.set((-0.16 + gripPoint.x) / 2, (1.35 + gripPoint.y) / 2, (0.05 + gripPoint.z) / 2);
    armL.lookAt(gripPoint.x, gripPoint.y, gripPoint.z);
    armL.rotateX(Math.PI / 2);

    const armR = new THREE.Mesh(armGeo, shirt);
    armR.position.set((0.16 + gripPoint.x) / 2, (1.35 + gripPoint.y) / 2, (0.05 + gripPoint.z) / 2);
    armR.lookAt(gripPoint.x, gripPoint.y, gripPoint.z);
    armR.rotateX(Math.PI / 2);

    // Club — shaft from the grip down to the ground beside the ball,
    // clubhead resting on the turf just short of the ball's near side
    // (not driven through its center — see CLUB_GROUND_Z above).
    const groundPoint = new THREE.Vector3(0, 0.0, CLUB_GROUND_Z);
    const shaftLen = gripPoint.distanceTo(groundPoint);
    const shaftGeo = new THREE.CylinderGeometry(0.012, 0.012, shaftLen, 8);
    const shaft = new THREE.Mesh(shaftGeo, club);
    shaft.position.copy(gripPoint).add(groundPoint).multiplyScalar(0.5);
    shaft.lookAt(groundPoint.x, groundPoint.y, groundPoint.z);
    shaft.rotateX(Math.PI / 2);

    const headClubGeo = new THREE.BoxGeometry(0.10, 0.05, 0.14);
    const clubHead = new THREE.Mesh(headClubGeo, club);
    clubHead.position.copy(groundPoint).setY(0.025);

    this.group.add(
      legL, legR, shoeL, shoeR, torso, head, capMesh,
      armL, armR, shaft, clubHead,
    );

    this.group.traverse(obj => {
      if (obj.isMesh) { obj.castShadow = true; obj.receiveShadow = true; }
    });

    scene.add(this.group);
  }

  // Faces the golfer toward the aim direction and stands them beside the
  // ball (real golfers address the ball from the side, not standing on
  // it). The stance offset must use the exact same rotation as the body
  // itself (-rad) — using the opposite sign only happened to cancel out
  // at aimDeg=0 and pointed the club away from the ball at any other angle.
  updateAim(aimDeg) {
    if (!this.group) return;
    const rad = (aimDeg * Math.PI) / 180;
    this.group.rotation.y = -rad;
    const offset = new THREE.Vector3(0, 0, -STAND_DISTANCE).applyAxisAngle(new THREE.Vector3(0, 1, 0), -rad);
    this.group.position.set(offset.x, 0, offset.z);
  }

  setVisible(visible) {
    if (this.group) this.group.visible = visible;
  }

}

export default GolferFigure;
