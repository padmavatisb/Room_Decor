import "./App.css";
import * as THREE from "three";
import { ARButton } from "three/examples/jsm/webxr/ARButton";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { XREstimatedLight } from "three/examples/jsm/webxr/XREstimatedLight";
import { TransformControls } from "three/examples/jsm/controls/TransformControls";

function App() {
  let reticle;
  let hitTestSource = null;
  let hitTestSourceRequested = false;

  let scene, camera, renderer;
  let transformControl;
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

  let controller;

  // Gesture state variables
  let isDragging = false;
  let previousTouch = null;
  let initialDistance = 0;
  let initialScale = 1;
  let currentRotationY = 0;

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

    transformControl = new TransformControls(camera, renderer.domElement);
    transformControl.addEventListener("dragging-changed", (event) => {
      renderer.xr.enabled = !event.value;
    });
    scene.add(transformControl);

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

    window.addEventListener("keydown", (e) => {
      switch (e.key.toLowerCase()) {
        case "t":
          transformControl.setMode("translate");
          break;
        case "r":
          transformControl.setMode("rotate");
          break;
        case "s":
          transformControl.setMode("scale");
          break;
      }
    });

    // 👇 Add gesture listeners
    renderer.domElement.addEventListener("touchstart", onTouchStart, false);
    renderer.domElement.addEventListener("touchmove", onTouchMove, false);
    renderer.domElement.addEventListener("touchend", onTouchEnd, false);
  }

  function onSelect() {
    if (reticle.visible) {
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
      transformControl.attach(selectedModel);

      currentRotationY = selectedModel.rotation.y;
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

  // 👇 Gesture handlers
  function getDistance(touch1, touch2) {
    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function onTouchStart(e) {
    if (!selectedModel) return;

    if (e.touches.length === 1) {
      isDragging = true;
      previousTouch = e.touches[0];
    } else if (e.touches.length === 2) {
      isDragging = false;
      initialDistance = getDistance(e.touches[0], e.touches[1]);
      initialScale = selectedModel.scale.x;
    }
  }

  function onTouchMove(e) {
    if (!selectedModel) return;

    if (e.touches.length === 1 && isDragging) {
      const deltaX = e.touches[0].clientX - previousTouch.clientX;
      const deltaY = e.touches[0].clientY - previousTouch.clientY;

      selectedModel.position.x += deltaX * 0.001;
      selectedModel.position.z += deltaY * 0.001;

      currentRotationY += deltaX * 0.01;
      selectedModel.rotation.y = currentRotationY;

      previousTouch = e.touches[0];
    } else if (e.touches.length === 2) {
      const newDistance = getDistance(e.touches[0], e.touches[1]);
      const scaleChange = newDistance / initialDistance;
      const newScale = initialScale * scaleChange;
      selectedModel.scale.set(newScale, newScale, newScale);
    }
  }

  function onTouchEnd(e) {
    isDragging = false;
    previousTouch = null;
  }

  return <div className="App"></div>;
}

export default App;
