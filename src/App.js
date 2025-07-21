// Import necessary modules
import "./App.css";
import * as THREE from "three";
import { ARButton } from "three/examples/jsm/webxr/ARButton";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { XREstimatedLight } from "three/examples/jsm/webxr/XREstimatedLight";
import { TransformControls } from "three/examples/jsm/controls/TransformControls";

let camera, scene, renderer;
let controller;
let reticle;
let currentModel = null;
let models = [];
let loader;

let lastTouchDistance = null;
let isRotating = false;

let previousTouches = [];
let activeModel = null;

init();

function init() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);
  document.body.appendChild(ARButton.createButton(renderer, { requiredFeatures: ['hit-test'] }));

  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
  light.position.set(0.5, 1, 0.25);
  scene.add(light);

  loader = new GLTFLoader();
  const geometry = new THREE.RingGeometry(0.1, 0.11, 32).rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
  reticle = new THREE.Mesh(geometry, material);
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  controller = renderer.xr.getController(0);
  scene.add(controller);

  const hitTestSourceRequested = false;
  let hitTestSource = null;

  renderer.setAnimationLoop(function (timestamp, frame) {
    if (frame) {
      const referenceSpace = renderer.xr.getReferenceSpace();
      const session = renderer.xr.getSession();
      if (!hitTestSourceRequested) {
        session.requestReferenceSpace('viewer').then((refSpace) => {
          session.requestHitTestSource({ space: refSpace }).then((source) => {
            hitTestSource = source;
          });
        });
        session.addEventListener('end', () => {
          hitTestSourceRequested = false;
          hitTestSource = null;
        });
      }
      if (hitTestSource) {
        const hitTestResults = frame.getHitTestResults(hitTestSource);
        if (hitTestResults.length > 0) {
          const hit = hitTestResults[0];
          const pose = hit.getPose(referenceSpace);
          reticle.visible = true;
          reticle.matrix.fromArray(pose.transform.matrix);
        } else {
          reticle.visible = false;
        }
      }
    }
    renderer.render(scene, camera);
  });

  window.addEventListener("touchstart", onTouchStart);
  window.addEventListener("touchmove", onTouchMove);
  window.addEventListener("touchend", onTouchEnd);
}

function onTouchStart(event) {
  if (event.touches.length === 2) {
    previousTouches = [...event.touches];
  } else if (event.touches.length === 1) {
    isRotating = true;
  }
}

function onTouchMove(event) {
  if (!activeModel) return;
  if (event.touches.length === 2) {
    const dx1 = previousTouches[0].clientX - previousTouches[1].clientX;
    const dy1 = previousTouches[0].clientY - previousTouches[1].clientY;
    const dist1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

    const dx2 = event.touches[0].clientX - event.touches[1].clientX;
    const dy2 = event.touches[0].clientY - event.touches[1].clientY;
    const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

    const delta = dist2 - dist1;
    activeModel.scale.multiplyScalar(1 + delta * 0.005);

    // Translate model based on average touch movement
    const avgPrevX = (previousTouches[0].clientX + previousTouches[1].clientX) / 2;
    const avgPrevY = (previousTouches[0].clientY + previousTouches[1].clientY) / 2;
    const avgCurrX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
    const avgCurrY = (event.touches[0].clientY + event.touches[1].clientY) / 2;

    const deltaX = (avgCurrX - avgPrevX) * 0.001;
    const deltaZ = (avgCurrY - avgPrevY) * 0.001;

    activeModel.position.x += deltaX;
    activeModel.position.z += deltaZ;

    previousTouches = [...event.touches];
  } else if (isRotating && event.touches.length === 1) {
    const deltaX = event.touches[0].movementX || (event.touches[0].clientX - (previousTouches[0]?.clientX || event.touches[0].clientX));
    const deltaY = event.touches[0].movementY || (event.touches[0].clientY - (previousTouches[0]?.clientY || event.touches[0].clientY));
    activeModel.rotation.y += deltaX * 0.01;
    activeModel.rotation.x += deltaY * 0.01;
    previousTouches = [...event.touches];
  }
}

function onTouchEnd(event) {
  isRotating = false;
  previousTouches = [];
}

function loadModel(modelPath) {
  if (reticle.visible) {
    if (activeModel) {
      activeModel = null; // Fix the current model in place
    }
    loader.load(modelPath, function (gltf) {
      const model = gltf.scene;
      model.position.setFromMatrixPosition(reticle.matrix);
      model.quaternion.setFromRotationMatrix(reticle.matrix);
      model.scale.set(0.2, 0.2, 0.2);
      scene.add(model);
      models.push(model);
      activeModel = model;
    });
  }
}

// Example usage: trigger this with L-shape gesture detection logic
// loadModel('path_to_model.gltf');
