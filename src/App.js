import "./App.css";
import * as THREE from "three";
import { ARButton } from "three/examples/jsm/webxr/ARButton";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { XREstimatedLight } from "three/examples/jsm/webxr/XREstimatedLight";

let camera, scene, renderer;
let controller, reticle;
let selectedModel = null;
let gltfModels = [
  "./dylan_armchair_yolk_yellow.glb",
  "./ivan_armchair_mineral_blue.glb",
  "./marble_coffee_table.glb",
];

let currentModelURL = gltfModels[0];

init();
animate();

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

  controller = renderer.xr.getController(0);
  controller.addEventListener('select', onSelect);
  scene.add(controller);

  const loader = new GLTFLoader();

  function onSelect() {
    if (reticle.visible) {
      loader.load(currentModelURL, function (gltf) {
        const model = gltf.scene;
        model.position.setFromMatrixPosition(reticle.matrix);
        model.scale.set(0.5, 0.5, 0.5);
        model.userData.selectable = true;
        scene.add(model);
      });
    }
  }

  const geometry = new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({ color: 0x0fff0f });
  reticle = new THREE.Mesh(geometry, material);
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  const hitTestSource = { requested: false, source: null };

  renderer.setAnimationLoop(function (timestamp, frame) {
    if (frame) {
      const referenceSpace = renderer.xr.getReferenceSpace();
      const session = renderer.xr.getSession();

      if (!hitTestSource.requested) {
        session.requestReferenceSpace('viewer').then((referenceSpace) => {
          session.requestHitTestSource({ space: referenceSpace }).then((source) => {
            hitTestSource.source = source;
          });
        });

        session.addEventListener('end', () => {
          hitTestSource.requested = false;
          hitTestSource.source = null;
        });

        hitTestSource.requested = true;
      }

      if (hitTestSource.source) {
        const hitTestResults = frame.getHitTestResults(hitTestSource.source);

        if (hitTestResults.length) {
          const hit = hitTestResults[0];
          reticle.visible = true;
          reticle.matrix.fromArray(hit.getPose(referenceSpace).transform.matrix);
        } else {
          reticle.visible = false;
        }
      }
    }

    renderer.render(scene, camera);
  });

  addGestureControls(renderer.domElement);
}

function addGestureControls(domElement) {
  let isDragging = false;
  let lastX = 0;
  let lastY = 0;

  domElement.addEventListener("touchstart", (event) => {
    if (event.touches.length === 1) {
      const touch = event.touches[0];
      const x = (touch.clientX / window.innerWidth) * 2 - 1;
      const y = -(touch.clientY / window.innerHeight) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera({ x, y }, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);

      for (let intersect of intersects) {
        if (intersect.object.parent.userData.selectable) {
          selectedModel = intersect.object.parent;
          break;
        }
      }
    }
  });

  domElement.addEventListener("touchmove", (event) => {
    if (!selectedModel) return;

    if (event.touches.length === 2) {
      // Move model
      let dx = event.touches[0].clientX - lastX;
      let dy = event.touches[0].clientY - lastY;

      selectedModel.position.x += dx * 0.001;
      selectedModel.position.z += dy * 0.001;

      lastX = event.touches[0].clientX;
      lastY = event.touches[0].clientY;
    } else if (event.touches.length === 1 && isDragging) {
      // Rotate model
      let dx = event.touches[0].clientX - lastX;
      selectedModel.rotation.y += dx * 0.01;

      lastX = event.touches[0].clientX;
    }
  });

  domElement.addEventListener("touchend", () => {
    isDragging = false;
  });

  domElement.addEventListener("touchstart", (event) => {
    if (event.touches.length === 1) {
      lastX = event.touches[0].clientX;
      lastY = event.touches[0].clientY;
      isDragging = true;
    }
  });
}

// UI: Allow changing models
const buttonsContainer = document.createElement("div");
buttonsContainer.style.position = "absolute";
buttonsContainer.style.top = "10px";
buttonsContainer.style.left = "10px";
buttonsContainer.style.zIndex = "10";
buttonsContainer.style.display = "flex";
buttonsContainer.style.flexDirection = "column";

gltfModels.forEach((url, index) => {
  const btn = document.createElement("button");
  btn.textContent = `Model ${index + 1}`;
  btn.style.marginBottom = "8px";
  btn.style.padding = "8px";
  btn.onclick = () => {
    currentModelURL = url;
  };
  buttonsContainer.appendChild(btn);
});

document.body.appendChild(buttonsContainer);
