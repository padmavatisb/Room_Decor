import "./App.css";
import * as THREE from "three";
import { ARButton } from "three/examples/jsm/webxr/ARButton";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { XREstimatedLight } from "three/examples/jsm/webxr/XREstimatedLight";

function App() {
  let reticle;
  let hitTestSource = null;
  let hitTestSourceRequested = false;

  let scene, camera, renderer;
  let xrLight;
  let fallbackLight, directionalLight;

  let models = [
    "./dylan_armchair_yolk_yellow.glb",
    "./ivan_armchair_mineral_blue.glb",
    "./marble_coffee_table.glb",
    "./flippa_functional_coffee_table_w._storagewalnut.glb",
    "./frame_armchairpetrol_velvet_with_gold_frame.glb",
    "./elnaz_nesting_side_tables_brass__green_marble.glb",
    "standing_lamp.glb",
    "plant_decor.glb",
    "little_bookcase.glb",
    "dining_set.glb",
  ];

  let modelScaleFactor = [0.01, 0.01, 0.005, 0.01, 0.01, 0.01, 0.1, 1, 1, 1];
  let items = [];
  let itemSelectedIndex = 0;
  let selectedModel = null;

  let lastTouchDistance = 0;
  let isDoubleTap = false;
  let lastTap = 0;

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
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.xr.enabled = true;

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
      if (xrLight.environment) {
        scene.environment = xrLight.environment;
      }
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

    for (let i = 0; i < models.length; i++) {
      const loader = new GLTFLoader();
      loader.load(models[i], function (glb) {
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

    renderer.domElement.addEventListener("touchstart", handleTouchStart, false);
    renderer.domElement.addEventListener("touchmove", handleTouchMove, false);
  }

  function handleTouchStart(event) {
    const now = new Date().getTime();
    if (event.touches.length === 1) {
      if (now - lastTap < 300) {
        isDoubleTap = true;
        insertModel();
      }
      lastTap = now;
    }

    if (event.touches.length === 2) {
      const dx = event.touches[0].clientX - event.touches[1].clientX;
      const dy = event.touches[0].clientY - event.touches[1].clientY;
      lastTouchDistance = Math.sqrt(dx * dx + dy * dy);
    }
  }

  function handleTouchMove(event) {
    if (!selectedModel) return;

    if (event.touches.length === 1) {
      const deltaX = event.touches[0].movementX || 0;
      const deltaY = event.touches[0].movementY || 0;
      selectedModel.rotation.y += deltaX * 0.01;
      selectedModel.rotation.x += deltaY * 0.01;
    }

    if (event.touches.length === 2) {
      const dx = event.touches[0].clientX - event.touches[1].clientX;
      const dy = event.touches[0].clientY - event.touches[1].clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const scaleFactor = distance / lastTouchDistance;
      selectedModel.scale.multiplyScalar(scaleFactor);
      lastTouchDistance = distance;
    }
  }

  function insertModel() {
    if (!reticle || !reticle.visible) return;
    let newModel = items[itemSelectedIndex].clone();
    newModel.visible = true;

    reticle.matrix.decompose(
      newModel.position,
      newModel.quaternion,
      newModel.scale
    );

    let scaleFactor = modelScaleFactor[itemSelectedIndex];
    newModel.scale.set(scaleFactor, scaleFactor, scaleFactor);

    scene.add(newModel);
    selectedModel = newModel;
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

  return <div className="App"></div>;
}

export default App;
