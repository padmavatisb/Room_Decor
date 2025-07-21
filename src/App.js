import "./App.css";
import * as THREE from "three";
import { ARButton } from "three/examples/jsm/webxr/ARButton";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { XREstimatedLight } from "three/examples/jsm/webxr/XREstimatedLight";

import chairModel from "./assets/models/chair.glb";
import tableModel from "./assets/models/table.glb";

let container, camera, scene, renderer;
let controller;
let reticle;
let selectedModelUrl = null;
let models = {};
let placedModels = [];

let lastTouchDistance = 0;
let lastAngle = 0;

function App() {
  return (
    <>
      <div className="button-container">
        <button onClick={() => handleModelSelection(chairModel)}>Chair</button>
        <button onClick={() => handleModelSelection(tableModel)}>Table</button>
      </div>

      <div className="gesture-hints">
        <div>👆 1-Finger: Move</div>
        <div>🤏 2-Finger: Scale</div>
        <div>🔄 2-Finger Twist: Rotate</div>
        <div>👆👆 Double Tap: Insert</div>
      </div>

      <canvas id="three-canvas" />
    </>
  );
}

function handleModelSelection(url) {
  selectedModelUrl = url;
}

function init() {
  container = document.createElement("div");
  document.body.appendChild(container);

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, canvas: document.getElementById("three-canvas") });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  container.appendChild(ARButton.createButton(renderer, { requiredFeatures: ["hit-test", "dom-overlay"], domOverlay: { root: document.body } }));

  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
  light.position.set(0.5, 1, 0.25);
  scene.add(light);

  const loader = new GLTFLoader();
  loader.load(chairModel, (gltf) => { models["chair"] = gltf.scene; });
  loader.load(tableModel, (gltf) => { models["table"] = gltf.scene; });

  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x00ff00 })
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  const lightProbe = new XREstimatedLight(renderer);
  scene.add(lightProbe);

  controller = renderer.xr.getController(0);
  scene.add(controller);

  const hitTestSource = { current: null };
  const localReferenceSpace = { current: null };

  renderer.xr.addEventListener("sessionstart", async () => {
    const session = renderer.xr.getSession();
    localReferenceSpace.current = await session.requestReferenceSpace("local");
    const viewerSpace = await session.requestReferenceSpace("viewer");
    hitTestSource.current = await session.requestHitTestSource({ space: viewerSpace });

    window.addEventListener("touchstart", onTouchStart, false);
    window.addEventListener("touchmove", onTouchMove, false);
    window.addEventListener("touchend", onTouchEnd, false);

    let lastTap = 0;
    window.addEventListener("touchend", function (e) {
      const now = new Date().getTime();
      const timesince = now - lastTap;
      if (timesince < 400 && timesince > 0) {
        if (reticle.visible && selectedModelUrl) {
          placeModelAtReticle(selectedModelUrl);
        }
      }
      lastTap = now;
    });
  });

  renderer.setAnimationLoop((timestamp, frame) => {
    if (frame) {
      const referenceSpace = localReferenceSpace.current;
      const hitSource = hitTestSource.current;

      const hitTestResults = frame.getHitTestResults(hitSource);
      if (hitTestResults.length > 0) {
        const hit = hitTestResults[0];
        reticle.visible = true;
        reticle.matrix.fromArray(hit.getPose(referenceSpace).transform.matrix);
      } else {
        reticle.visible = false;
      }
    }

    renderer.render(scene, camera);
  });
}

function placeModelAtReticle(url) {
  const loader = new GLTFLoader();
  loader.load(url, (gltf) => {
    const model = gltf.scene;
    model.scale.set(0.3, 0.3, 0.3);
    model.position.setFromMatrixPosition(reticle.matrix);
    model.rotation.setFromRotationMatrix(reticle.matrix);
    model.userData = { initialScale: 0.3 };
    scene.add(model);
    placedModels.push(model);
  });
}

let lastTouches = [];

function onTouchStart(event) {
  if (event.touches.length === 1) {
    lastTouches[0] = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  } else if (event.touches.length === 2) {
    const dx = event.touches[0].clientX - event.touches[1].clientX;
    const dy = event.touches[0].clientY - event.touches[1].clientY;
    lastTouchDistance = Math.sqrt(dx * dx + dy * dy);
    lastAngle = Math.atan2(dy, dx);
  }
}

function onTouchMove(event) {
  if (placedModels.length === 0) return;
  const model = placedModels[placedModels.length - 1];

  if (event.touches.length === 1) {
    const dx = event.touches[0].clientX - lastTouches[0].x;
    const dy = event.touches[0].clientY - lastTouches[0].y;
    model.position.x += dx * 0.0005;
    model.position.z -= dy * 0.0005;
    lastTouches[0] = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }

  if (event.touches.length === 2) {
    const dx = event.touches[0].clientX - event.touches[1].clientX;
    const dy = event.touches[0].clientY - event.touches[1].clientY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    const scaleChange = distance / lastTouchDistance;
    const newScale = model.userData.initialScale * scaleChange;
    model.scale.set(newScale, newScale, newScale);

    const newAngle = Math.atan2(dy, dx);
    const angleDelta = newAngle - lastAngle;
    model.rotation.y += angleDelta;
    lastTouchDistance = distance;
    lastAngle = newAngle;
  }
}

function onTouchEnd(event) {
  if (placedModels.length > 0) {
    placedModels[placedModels.length - 1].userData.initialScale = placedModels[placedModels.length - 1].scale.x;
  }
}

window.addEventListener("DOMContentLoaded", () => {
  init();
});

export default App;
