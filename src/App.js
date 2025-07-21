import "./App.css";
import * as THREE from "three";
import { ARButton } from "three/examples/jsm/webxr/ARButton";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";

let camera, scene, renderer;
let controller;
let reticle;
let selectedModel = null;

let touchStartDistance = 0;
let initialScale = 1;
let isScaling = false;
let isDragging = false;
let dragStart = new THREE.Vector2();
let initialPosition = new THREE.Vector3();

init();
animate();

function init() {
  const container = document.createElement("div");
  document.body.appendChild(container);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
  light.position.set(0.5, 1, 0.25);
  scene.add(light);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  container.appendChild(renderer.domElement);

  document.body.appendChild(ARButton.createButton(renderer, { requiredFeatures: ['hit-test'] }));

  const loader = new GLTFLoader();
  loader.load("/chair.glb", (gltf) => {
    selectedModel = gltf.scene;
    selectedModel.visible = false; // Don't show until placement
    scene.add(selectedModel);
  });

  const geometry = new THREE.RingGeometry(0.05, 0.06, 32).rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
  reticle = new THREE.Mesh(geometry, material);
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  controller = renderer.xr.getController(0);
  scene.add(controller);

  const session = renderer.xr.getSession();
  session.addEventListener("select", onSelect);

  const referenceSpace = renderer.xr.getReferenceSpace();
  session.requestReferenceSpace("viewer").then((refSpace) => {
    session.requestHitTestSource({ space: refSpace }).then((source) => {
      renderer.setAnimationLoop(() => {
        renderer.render(scene, camera);

        const frame = renderer.xr.getFrame();
        if (frame) {
          const hitTestResults = frame.getHitTestResults(source);
          if (hitTestResults.length) {
            const hit = hitTestResults[0];
            const pose = hit.getPose(referenceSpace);
            reticle.visible = true;
            reticle.matrix.fromArray(pose.transform.matrix);
          } else {
            reticle.visible = false;
          }
        }

        // Apply drag/scale/rotate
        if (isDragging && selectedModel) {
          const deltaX = dragStart.x - touchMove.x;
          const deltaY = dragStart.y - touchMove.y;
          selectedModel.position.x = initialPosition.x - deltaX;
          selectedModel.position.z = initialPosition.z + deltaY;
        }

        if (isScaling && selectedModel) {
          const currentDist = getTouchDistance();
          const scaleFactor = currentDist / touchStartDistance;
          selectedModel.scale.setScalar(initialScale * scaleFactor);
        }
      });
    });
  });

  window.addEventListener("touchstart", onTouchStart, false);
  window.addEventListener("touchmove", onTouchMove, false);
  window.addEventListener("touchend", onTouchEnd, false);
}

function onSelect() {
  if (reticle.visible && selectedModel) {
    selectedModel.position.setFromMatrixPosition(reticle.matrix);
    selectedModel.visible = true;
  }
}

function onTouchStart(event) {
  if (!selectedModel || !selectedModel.visible) return;

  if (event.touches.length === 1) {
    isDragging = true;
    dragStart.set(event.touches[0].clientX, event.touches[0].clientY);
    initialPosition.copy(selectedModel.position);
  } else if (event.touches.length === 2) {
    isScaling = true;
    touchStartDistance = getTouchDistance(event);
    initialScale = selectedModel.scale.x;
  }
}

function onTouchMove(event) {
  if (isDragging && event.touches.length === 1) {
    touchMove.set(event.touches[0].clientX, event.touches[0].clientY);
  } else if (isScaling && event.touches.length === 2) {
    const currentDist = getTouchDistance(event);
    const scaleFactor = currentDist / touchStartDistance;
    selectedModel.scale.setScalar(initialScale * scaleFactor);
  }
}

function onTouchEnd(event) {
  isDragging = false;
  isScaling = false;
}

function getTouchDistance(event) {
  if (event.touches.length < 2) return 0;
  const dx = event.touches[0].clientX - event.touches[1].clientX;
  const dy = event.touches[0].clientY - event.touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function animate() {
  renderer.setAnimationLoop(() => {
    renderer.render(scene, camera);
  });
}

const touchMove = new THREE.Vector2();
