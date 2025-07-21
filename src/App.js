import './App.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { ARButton } from 'three/examples/jsm/webxr/ARButton';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

let camera, scene, renderer, controller;
let reticle, model = null;
let selected = false;
let startX = 0, startY = 0;
let isDragging = false;

let previousTouches = [];

init();

function init() {
  const container = document.createElement('div');
  document.body.appendChild(container);

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  container.appendChild(renderer.domElement);

  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
  light.position.set(0.5, 1, 0.25);
  scene.add(light);

  // Reticle for AR plane detection
  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x00ff00 })
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  // Load model
  const loader = new GLTFLoader();
  loader.load('./chair.glb', function (gltf) {
    model = gltf.scene;
    model.visible = false;
    scene.add(model);
  });

  document.body.appendChild(ARButton.createButton(renderer, { requiredFeatures: ['hit-test'] }));

  const controller = renderer.xr.getController(0);
  controller.addEventListener('select', onSelect);
  scene.add(controller);

  // Add event listeners
  renderer.domElement.addEventListener('touchstart', onTouchStart, false);
  renderer.domElement.addEventListener('touchmove', onTouchMove, false);
  renderer.domElement.addEventListener('touchend', onTouchEnd, false);

  renderer.setAnimationLoop(render);
}

// On screen tap, place the model
function onSelect() {
  if (reticle.visible && model) {
    model.position.setFromMatrixPosition(reticle.matrix);
    model.visible = true;
  }
}

// Touch handlers
function onTouchStart(event) {
  if (!model || !model.visible) return;

  if (event.touches.length === 1) {
    const touch = event.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    isDragging = true;

    // Check if tap is on model
    const mouse = new THREE.Vector2(
      (startX / window.innerWidth) * 2 - 1,
      -(startY / window.innerHeight) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObject(model, true);
    selected = intersects.length > 0;
  } else if (event.touches.length === 2) {
    previousTouches = [...event.touches];
  }
}

function onTouchMove(event) {
  if (!model || !model.visible) return;

  if (event.touches.length === 1 && isDragging && selected) {
    const touch = event.touches[0];
    const deltaX = (touch.clientX - startX) / 200;
    const deltaY = (touch.clientY - startY) / 200;

    model.position.x += deltaX;
    model.position.z += deltaY;

    startX = touch.clientX;
    startY = touch.clientY;
  }

  if (event.touches.length === 2 && previousTouches.length === 2) {
    const [touch1, touch2] = event.touches;
    const [prev1, prev2] = previousTouches;

    // Rotate
    const angle = Math.atan2(touch2.clientY - touch1.clientY, touch2.clientX - touch1.clientX);
    const prevAngle = Math.atan2(prev2.clientY - prev1.clientY, prev2.clientX - prev1.clientX);
    const angleDiff = angle - prevAngle;

    model.rotation.y += angleDiff;

    // Scale
    const dist = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
    const prevDist = Math.hypot(prev2.clientX - prev1.clientX, prev2.clientY - prev1.clientY);
    const scaleChange = dist / prevDist;

    model.scale.multiplyScalar(scaleChange);
    previousTouches = [...event.touches];
  }
}

function onTouchEnd(event) {
  isDragging = false;
  selected = false;
  previousTouches = [];
}

function render(timestamp, frame) {
  if (frame) {
    const referenceSpace = renderer.xr.getReferenceSpace();
    const session = renderer.xr.getSession();

    const viewerPose = frame.getViewerPose(referenceSpace);

    if (viewerPose) {
      const hitTestResults = frame.getHitTestResults(renderer.xr.getController(0).inputSource);

      if (hitTestResults.length > 0) {
        const hit = hitTestResults[0];
        const hitPose = hit.getPose(referenceSpace);

        reticle.visible = true;
        reticle.matrix.fromArray(hitPose.transform.matrix);
      } else {
        reticle.visible = false;
      }
    }
  }

  renderer.render(scene, camera);
}
