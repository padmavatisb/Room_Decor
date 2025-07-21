import "./App.css";
import * as THREE from "three";
import { ARButton } from "three/examples/jsm/webxr/ARButton";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { XREstimatedLight } from "three/examples/jsm/webxr/XREstimatedLight";
import { TransformControls } from "three/examples/jsm/controls/TransformControls";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { useEffect } from "react";

function App() {
  useEffect(() => {
    let selectedModel = null;
    let selectedTouchModel = null;
    let activeModel = null;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.01,
      20
    );
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    document.body.appendChild(renderer.domElement);
    document.body.appendChild(ARButton.createButton(renderer, { requiredFeatures: ["hit-test"] }));

    const controller = renderer.xr.getController(0);
    scene.add(controller);

    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
    scene.add(light);

    const loader = new GLTFLoader();
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    let reticle;
    const hitTestSourceRequested = false;
    let hitTestSource = null;

    // Estimated lighting
    const estimatedLight = new XREstimatedLight(renderer);
    scene.add(estimatedLight);

    // Transform controls (optional for dev)
    const transformControl = new TransformControls(camera, renderer.domElement);
    scene.add(transformControl);

    // Load furniture models
    const furnitureModels = {
      chair: "chair.glb",
      table: "table.glb",
      sofa: "sofa.glb"
    };

    const setupFurnitureSelection = () => {
      document.querySelectorAll("button.furniture").forEach(btn => {
        btn.onclick = () => {
          activeModel = btn.getAttribute("data-model");
        };
      });
    };

    const placeModel = (position, rotation) => {
      if (!activeModel) return;
      loader.load(furnitureModels[activeModel], gltf => {
        const model = gltf.scene;
        model.position.copy(position);
        model.rotation.copy(rotation);
        model.scale.set(0.2, 0.2, 0.2);
        scene.add(model);
        selectedModel = model;
        selectedTouchModel = model;
      });
    };

    // Tap-to-place model
    controller.addEventListener("select", () => {
      if (reticle && reticle.visible) {
        placeModel(reticle.position, reticle.rotation);
      }
    });

    // Add reticle
    const geometry = new THREE.RingGeometry(0.05, 0.06, 32).rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({ color: 0x0fff00 });
    reticle = new THREE.Mesh(geometry, material);
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    const session = renderer.xr.getSession();
    if (session) {
      session.addEventListener("end", () => {
        hitTestSource = null;
      });
    }

    let referenceSpace;
    renderer.xr.addEventListener("sessionstart", async () => {
      const session = renderer.xr.getSession();
      referenceSpace = await session.requestReferenceSpace("viewer");
      const hitTestSourceRequest = await session.requestHitTestSource({ space: referenceSpace });
      hitTestSource = hitTestSourceRequest;
    });

    // Gesture support
    let initialDistance = null;
    let initialScale = null;
    let lastRotation = 0;

    const getTouchDistance = touches => {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const getRotationAngle = touches => {
      const dx = touches[1].clientX - touches[0].clientX;
      const dy = touches[1].clientY - touches[0].clientY;
      return Math.atan2(dy, dx);
    };

    const onTouchMove = e => {
      if (!selectedTouchModel || e.touches.length === 0) return;

      if (e.touches.length === 1) {
        // Move
        const touch = e.touches[0];
        const x = (touch.clientX / window.innerWidth) * 2 - 1;
        const y = -(touch.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera({ x, y }, camera);
        const intersect = raycaster.intersectObject(reticle);
        if (intersect.length > 0) {
          selectedTouchModel.position.copy(intersect[0].point);
        }
      }

      if (e.touches.length === 2) {
        const currentDistance = getTouchDistance(e.touches);
        const currentRotation = getRotationAngle(e.touches);

        if (initialDistance === null) {
          initialDistance = currentDistance;
          initialScale = selectedTouchModel.scale.x;
          lastRotation = currentRotation;
        } else {
          const scaleFactor = currentDistance / initialDistance;
          selectedTouchModel.scale.setScalar(initialScale * scaleFactor);

          const rotationDelta = currentRotation - lastRotation;
          selectedTouchModel.rotation.y += rotationDelta;
          lastRotation = currentRotation;
        }
      }
    };

    const onTouchEnd = () => {
      initialDistance = null;
      lastRotation = 0;
    };

    // Tap to select model
    renderer.domElement.addEventListener("touchstart", event => {
      if (event.touches.length !== 1) return;

      const touch = event.touches[0];
      pointer.x = (touch.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -(touch.clientY / window.innerHeight) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);

      if (intersects.length > 0) {
        let target = intersects[0].object;
        while (target.parent && target.parent.type !== "Scene") {
          target = target.parent;
        }
        selectedModel = target;
        selectedTouchModel = target;
        transformControl.attach(target);
        console.log("Selected model:", target.name || target.uuid);
      }
    });

    window.addEventListener("touchmove", onTouchMove, false);
    window.addEventListener("touchend", onTouchEnd, false);

    const animate = () => {
      renderer.setAnimationLoop(render);
    };

    const render = (timestamp, frame) => {
      if (frame) {
        const referenceSpace = renderer.xr.getReferenceSpace();
        const viewerPose = frame.getViewerPose(referenceSpace);

        if (hitTestSource && viewerPose) {
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
    };

    setupFurnitureSelection();
    animate();
  }, []);

  return (
    <>
      <div className="controls">
        <button className="furniture" data-model="chair">Chair</button>
        <button className="furniture" data-model="table">Table</button>
        <button className="furniture" data-model="sofa">Sofa</button>
      </div>
    </>
  );
}

export default App;
