import "./App.css";
import * as THREE from "three";
import { ARButton } from "three/examples/jsm/webxr/ARButton";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { XREstimatedLight } from "three/examples/jsm/webxr/XREstimatedLight";

function App() {
  let reticle, scene, camera, renderer;
  let xrLight, fallbackLight, directionalLight;
  let controller;
  let hitTestSource = null;
  let hitTestSourceRequested = false;

  let models = [ /* ... model paths ... */ ];
  let modelScaleFactor = [0.01, 0.01, 0.005, 0.01, 0.01, 0.01, 0.1, 1, 1, 1];
  let items = [];
  let itemSelectedIndex = 0;
  let selectedModel = null;

  // Gesture tracking
  let isTouching = false;
  let previousTouches = [];

  init();
  setupFurnitureSelection();
  animate();

  function init() {
    let myCanvas = document.getElementById("canvas");
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(70, myCanvas.innerWidth / myCanvas.innerHeight, 0.01, 20);

    renderer = new THREE.WebGLRenderer({
      canvas: myCanvas,
      antialias: true,
      alpha: true,
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(myCanvas.innerWidth, myCanvas.innerHeight);
    renderer.xr.enabled = true;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Light setup
    fallbackLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    fallbackLight.position.set(0, 1, 0);
    scene.add(fallbackLight);

    directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight.position.set(0, 4, 2);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    xrLight = new XREstimatedLight(renderer);
    xrLight.addEventListener("estimationstart", () => {
      scene.add(xrLight);
      if (xrLight.light) {
        xrLight.light.castShadow = true;
        xrLight.light.intensity = 1;
      }
      scene.remove(fallbackLight);
      scene.remove(directionalLight);
      if (xrLight.environment) scene.environment = xrLight.environment;
    });

    xrLight.addEventListener("estimationend", () => {
      scene.remove(xrLight);
      scene.add(fallbackLight);
      scene.add(directionalLight);
      scene.environment = null;
    });

    const arButton = ARButton.createButton(renderer, {
      requiredFeatures: ["hit-test"],
      optionalFeatures: ["light-estimation", "dom-overlay"],
      domOverlay: { root: document.body },
    });
    arButton.style.bottom = "20%";
    document.body.appendChild(arButton);

    // Load models
    for (let i = 0; i < models.length; i++) {
      const loader = new GLTFLoader();
      loader.load(models[i], (glb) => {
        let model = glb.scene;
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        items[i] = model;
      });
    }

    controller = renderer.xr.getController(0);
    controller.addEventListener("select", onSelect);
    scene.add(controller);

    reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x00ff00 })
    );
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    // Touch events
    renderer.domElement.addEventListener("touchstart", handleTouchStart, false);
    renderer.domElement.addEventListener("touchmove", handleTouchMove, false);
    renderer.domElement.addEventListener("touchend", handleTouchEnd, false);
  }

  function onSelect() {
    if (reticle.visible) {
      let newModel = items[itemSelectedIndex].clone();
      newModel.visible = true;
      reticle.matrix.decompose(newModel.position, newModel.quaternion, newModel.scale);
      let scaleFactor = modelScaleFactor[itemSelectedIndex];
      newModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
      scene.add(newModel);
      selectedModel = newModel;
    }
  }

  const onClicked = (e, selectItem, index) => {
    itemSelectedIndex = index;
    for (let i = 0; i < models.length; i++) {
      const el = document.querySelector(`#item` + i);
      el.classList.remove("clicked");
    }
    e.target.classList.add("clicked");
  };

  function setupFurnitureSelection() {
    for (let i = 0; i < models.length; i++) {
      const el = document.querySelector(`#item` + i);
      el.addEventListener("beforexrselect", (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      el.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClicked(e, items[i], i);
      });
    }
  }

  function handleTouchStart(e) {
    if (!selectedModel) return;
    isTouching = true;
    previousTouches = [...e.touches];
  }

  function handleTouchMove(e) {
    if (!isTouching || !selectedModel) return;
    e.preventDefault();
    const touches = e.touches;

    if (touches.length === 1 && previousTouches.length === 1) {
      const dx = touches[0].clientX - previousTouches[0].clientX;
      const dy = touches[0].clientY - previousTouches[0].clientY;
      const movementScale = 0.001;
      selectedModel.position.x += dx * movementScale;
      selectedModel.position.z += dy * movementScale;
    }

    if (touches.length === 2 && previousTouches.length === 2) {
      const [prev1, prev2] = previousTouches;
      const [curr1, curr2] = touches;

      const prevDx = prev2.clientX - prev1.clientX;
      const prevDy = prev2.clientY - prev1.clientY;
      const prevDist = Math.sqrt(prevDx ** 2 + prevDy ** 2);

      const currDx = curr2.clientX - curr1.clientX;
      const currDy = curr2.clientY - curr1.clientY;
      const currDist = Math.sqrt(currDx ** 2 + currDy ** 2);

      const scaleChange = currDist / prevDist;
      selectedModel.scale.multiplyScalar(scaleChange);

      const prevAngle = Math.atan2(prevDy, prevDx);
      const currAngle = Math.atan2(currDy, currDx);
      selectedModel.rotation.y += currAngle - prevAngle;
    }

    previousTouches = [...touches];
  }

  function handleTouchEnd() {
    isTouching = false;
    previousTouches = [];
  }

  function animate() {
    renderer.setAnimationLoop(render);
  }

  function render(timestamp, frame) {
    if (frame) {
      const referenceSpace = renderer.xr.getReferenceSpace();
      const session = renderer.xr.getSession();

      if (!hitTestSourceRequested) {
        session.requestReferenceSpace("viewer").then((refSpace) => {
          session.requestHitTestSource({ space: refSpace }).then((source) => {
            hitTestSource = source;
          });
        });

        session.addEventListener("end", () => {
          hitTestSourceRequested = false;
          hitTestSource = null;
        });

        hitTestSourceRequested = true;
      }

      if (hitTestSource) {
        const hitTestResults = frame.getHitTestResults(hitTestSource);
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
  }

  return <div className="App"><canvas id="canvas" /></div>;
}

export default App;
