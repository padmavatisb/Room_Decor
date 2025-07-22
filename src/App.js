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
  let raycaster = new THREE.Raycaster();
  let pointer = new THREE.Vector2();

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

  // Gesture state
  let isDragging = false;
  let initialTouch = null;
  let initialDistance = null;
  let initialScale = 1;

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

    // Fallback Lights
    fallbackLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    fallbackLight.position.set(0, 1, 0);
    scene.add(fallbackLight);

    directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight.position.set(0, 4, 2);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Light estimation
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

    // Transform Controls (can be hidden if using gestures)
    transformControl = new TransformControls(camera, renderer.domElement);
    transformControl.addEventListener("dragging-changed", (event) => {
      renderer.xr.enabled = !event.value;
    });
    scene.add(transformControl);

    // Load Models
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

    // Reticle
    reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x00ff00 })
    );
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    // Keyboard Transform Mode
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

    // Gesture Listeners
    myCanvas.addEventListener("touchstart", onTouchStart, false);
    myCanvas.addEventListener("touchmove", onTouchMove, false);
    myCanvas.addEventListener("touchend", onTouchEnd, false);
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
    }
  }

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
        itemSelectedIndex = i;
        for (let j = 0; j < models.length; j++) {
          const el2 = document.querySelector(`#item` + j);
          el2.classList.remove("clicked");
        }
        e.target.classList.add("clicked");
      });
    }
  }

  function onTouchStart(event) {
    if (!selectedModel) return;
    if (event.touches.length === 1) {
      isDragging = true;
      initialTouch = event.touches[0];
    }
    if (event.touches.length === 2) {
      initialDistance = getDistance(event.touches[0], event.touches[1]);
      initialScale = selectedModel.scale.x;
    }
  }

  function onTouchMove(event) {
    if (!selectedModel) return;

    if (event.touches.length === 1 && isDragging) {
      moveModelToTouch(event.touches[0]);
    }

    if (event.touches.length === 2 && initialDistance !== null) {
      const newDistance = getDistance(event.touches[0], event.touches[1]);
      const scaleFactor = newDistance / initialDistance;
      selectedModel.scale.setScalar(initialScale * scaleFactor);
    }
  }

  function onTouchEnd(event) {
    isDragging = false;
    if (event.touches.length < 2) {
      initialDistance = null;
    }
  }

  function getDistance(touch1, touch2) {
    const dx = touch1.pageX - touch2.pageX;
    const dy = touch1.pageY - touch2.pageY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function moveModelToTouch(touch) {
    const x = (touch.clientX / window.innerWidth) * 2 - 1;
    const y = -(touch.clientY / window.innerHeight) * 2 + 1;

    pointer.set(x, y);
    raycaster.setFromCamera(pointer, camera);

    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -reticle.position.y);
    const intersection = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, intersection);

    if (intersection) {
      selectedModel.position.set(intersection.x, reticle.position.y, intersection.z);
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
          reticle.matrix.decompose(reticle.position, reticle.quaternion, reticle.scale);
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
