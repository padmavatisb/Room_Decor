import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { ARButton } from 'three/examples/jsm/webxr/ARButton';

let camera, scene, renderer;
let controller;
let models = [];
let activeModel = null;
let loader = new GLTFLoader();
let longPressTimeout;
let isTranslating = false;
let previousTouch = null;

init();

function init() {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.01,
    20
  );

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  document.body.appendChild(ARButton.createButton(renderer));

  controller = renderer.xr.getController(0);
  scene.add(controller);

  // Insert first model as default on load
  insertNewModel();

  // Gesture listeners
  renderer.domElement.addEventListener('touchstart', onTouchStart, false);
  renderer.domElement.addEventListener('touchmove', onTouchMove, false);
  renderer.domElement.addEventListener('touchend', onTouchEnd, false);

  animate();
}

function insertNewModel(path = 'model.gltf') {
  loader.load(path, function (gltf) {
    const model = gltf.scene;
    model.position.set(0, 0, -0.5).applyMatrix4(controller.matrixWorld);
    model.rotation.set(0, 0, 0);
    model.scale.set(0.2, 0.2, 0.2);
    scene.add(model);
    models.push(model);
    activeModel = model;
  });
}

function onTouchStart(event) {
  if (event.touches.length === 1) {
    longPressTimeout = setTimeout(() => {
      isTranslating = true;
      previousTouch = event.touches[0];
    }, 1000); // 1-second hold to start move
  }

  if (event.touches.length === 2) {
    previousTouch = {
      x1: event.touches[0].clientX,
      y1: event.touches[0].clientY,
      x2: event.touches[1].clientX,
      y2: event.touches[1].clientY
    };
  }

  if (event.touches.length === 3) {
    const touch = event.touches;
    if (
      Math.abs(touch[0].clientY - touch[1].clientY) < 50 &&
      Math.abs(touch[1].clientX - touch[2].clientX) < 50
    ) {
      // L-shape gesture detected
      insertNewModel();
    }
  }
}

function onTouchMove(event) {
  if (!activeModel) return;

  if (isTranslating && event.touches.length === 1) {
    const touch = event.touches[0];
    const deltaX = (touch.clientX - previousTouch.clientX) * 0.001;
    const deltaY = (touch.clientY - previousTouch.clientY) * 0.001;
    activeModel.position.x += deltaX;
    activeModel.position.y -= deltaY;
    previousTouch = touch;
  }

  if (event.touches.length === 1 && !isTranslating) {
    const deltaX = event.touches[0].clientX - previousTouch.clientX;
    const deltaY = event.touches[0].clientY - previousTouch.clientY;
    activeModel.rotation.y += deltaX * 0.01;
    activeModel.rotation.x += deltaY * 0.01;
    previousTouch = event.touches[0];
  }

  if (event.touches.length === 2) {
    const touch = event.touches;
    const dist = Math.hypot(
      touch[0].clientX - touch[1].clientX,
      touch[0].clientY - touch[1].clientY
    );
    const prevDist = Math.hypot(
      previousTouch.x1 - previousTouch.x2,
      previousTouch.y1 - previousTouch.y2
    );
    const scaleChange = dist / prevDist;
    activeModel.scale.multiplyScalar(scaleChange);
    previousTouch = {
      x1: touch[0].clientX,
      y1: touch[0].clientY,
      x2: touch[1].clientX,
      y2: touch[1].clientY
    };
  }
}

function onTouchEnd() {
  clearTimeout(longPressTimeout);
  isTranslating = false;
}

function animate() {
  renderer.setAnimationLoop(function () {
    renderer.render(scene, camera);
  });
}

// External function to switch model type
window.loadModel = function (modelPath) {
  insertNewModel(modelPath);
};
