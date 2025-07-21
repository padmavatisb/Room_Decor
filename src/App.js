// Full AR + Gesture Integration using THREE.js + Hammer.js
// Feature: Double Tap to Place, One Finger Drag to Move, Rotate with One Finger (Trackpad), Pinch to Scale

import "./App.css";
import * as THREE from "three";
import { ARButton } from "three/examples/jsm/webxr/ARButton";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import Hammer from "hammerjs";

let camera, scene, renderer;
let controller;
let reticle;
let selectedModelUrl = null;
let model = null;
let currentModel = null;
let isModelPlaced = false;
let initialScale = 1;

init();

function init() {
  const container = document.createElement("div");
  document.body.appendChild(container);

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  container.appendChild(renderer.domElement);

  document.body.appendChild(ARButton.createButton(renderer, { requiredFeatures: ['hit-test'] }));

  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
  light.position.set(0.5, 1, 0.25);
  scene.add(light);

  const loader = new GLTFLoader();
  const urls = {
    chair: 'models/chair.glb',
    table: 'models/table.glb',
    lamp: 'models/lamp.glb'
  };

  // Assign model buttons
  Object.keys(urls).forEach(id => {
    document.getElementById(id).addEventListener('click', () => {
      selectedModelUrl = urls[id];
      console.log('Selected model:', selectedModelUrl);
    });
  });

  controller = renderer.xr.getController(0);
  controller.addEventListener('select', onSelect);
  scene.add(controller);

  const geometry = new THREE.RingGeometry(0.05, 0.06, 32).rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({ color: 0x0fff00 });
  reticle = new THREE.Mesh(geometry, material);
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  const hitTestSourcePromise = new Promise(resolve => {
    renderer.xr.addEventListener("sessionstart", async () => {
      const session = renderer.xr.getSession();
      const viewerSpace = await session.requestReferenceSpace("viewer");
      const hitTestSource = await session.requestHitTestSource({ space: viewerSpace });

      renderer.setAnimationLoop(timestamp => {
        if (renderer.xr.isPresenting) {
          const frame = renderer.xr.getFrame();
          const referenceSpace = renderer.xr.getReferenceSpace();
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
        renderer.render(scene, camera);
      });

      resolve();
    });
  });

  // Hammer.js gesture handling
  const hammer = new Hammer(document.body);
  hammer.get('pan').set({ direction: Hammer.DIRECTION_ALL });
  hammer.get('pinch').set({ enable: true });
  hammer.get('rotate').set({ enable: true });

  let lastPan = { x: 0, y: 0 };
  let lastRotation = 0;

  hammer.on("panmove", ev => {
    if (!currentModel) return;
    const deltaX = ev.deltaX - lastPan.x;
    const deltaY = ev.deltaY - lastPan.y;

    currentModel.position.x += deltaX * 0.0005;
    currentModel.position.z += deltaY * 0.0005;

    lastPan = { x: ev.deltaX, y: ev.deltaY };
  });

  hammer.on("panend", () => {
    lastPan = { x: 0, y: 0 };
  });

  hammer.on("pinchmove", ev => {
    if (!currentModel) return;
    currentModel.scale.setScalar(initialScale * ev.scale);
  });

  hammer.on("pinchend", ev => {
    if (!currentModel) return;
    initialScale = currentModel.scale.x;
  });

  hammer.on("rotatemove", ev => {
    if (!currentModel) return;
    currentModel.rotation.y += THREE.MathUtils.degToRad(ev.rotation - lastRotation);
    lastRotation = ev.rotation;
  });

  hammer.on("rotateend", () => {
    lastRotation = 0;
  });

  // Double tap to place model
  hammer.on("doubletap", () => {
    if (selectedModelUrl && reticle.visible && !isModelPlaced) {
      loader.load(selectedModelUrl, gltf => {
        model = gltf.scene;
        model.position.setFromMatrixPosition(reticle.matrix);
        model.quaternion.setFromRotationMatrix(reticle.matrix);
        model.scale.set(0.5, 0.5, 0.5);

        currentModel = model;
        scene.add(model);
        isModelPlaced = true;
        initialScale = 0.5;
      });
    }
  });
}

function onSelect() {
  // Disable default tap-to-place
}
