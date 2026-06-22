// ============================================================================
// System 4 — Three.js scene: renderer, camera, fog, lighting.
// ============================================================================

import * as THREE from 'three';
import { SCENE, COLORS } from '../core/config.js';

export function createScene(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.bg);
  scene.fog = new THREE.Fog(COLORS.bg, SCENE.fogNear, SCENE.fogFar);

  const camera = new THREE.PerspectiveCamera(
    SCENE.camFov,
    window.innerWidth / window.innerHeight,
    SCENE.camNear,
    SCENE.camFar,
  );
  camera.position.set(...SCENE.camPos);
  camera.lookAt(0, 1.0, -20);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    const msg = document.getElementById('loading-pct');
    if (msg) { msg.textContent = 'WEBGL UNAVAILABLE'; msg.style.color = '#ff2244'; }
    throw new Error('WebGL is required to run ENTRAINMENT: ' + e.message);
  }
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  // lighting
  const ambient = new THREE.AmbientLight(SCENE.ambientColor, SCENE.ambientIntensity);
  scene.add(ambient);

  const dir = new THREE.DirectionalLight(SCENE.dirColor, SCENE.dirIntensity);
  dir.position.set(...SCENE.dirPos);
  scene.add(dir);

  const point = new THREE.PointLight(SCENE.pointColor, SCENE.pointIntensity, SCENE.pointDistance);
  point.position.set(0, 3, 1);
  scene.add(point);

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  };
  window.addEventListener('resize', onResize);

  return { scene, camera, renderer, lights: { ambient, dir, point } };
}
