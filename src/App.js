import "./App.css"; 
import * as THREE from "three";
import { ARButton } from "three/examples/jsm/webxr/ARButton";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { XREstimatedLight } from "three/examples/jsm/webxr/XREstimatedLight";
import { TransformControls } from "three/examples/jsm/controls/TransformControls";

import { TransformControls } from 'three/examples/jsm/controls/TransformControls';

// Inside your setup code:
const transformControls = new TransformControls(camera, renderer.domElement);
scene.add(transformControls);

// When user taps on a model
transformControls.attach(selectedModel);

// Set mode from dropdown
transformControls.setMode("translate"); // or "rotate" or "scale"

// Optional: to avoid conflict with OrbitControls
transformControls.addEventListener('dragging-changed', function (event) {
    orbitControls.enabled = !event.value;
});

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

  // === NEW === state for placed models array
  const placedModels = [];

  // === NEW === gesture state
  let activeMode = null; // "translate" | "rotate" | "scale" | null
  let lastTouchPoint = null;
  let pinchStartDist = null;
  let pinchStartScale = null;
  let rotateStartAngle = null;
  let rotateStartY = null;

  // === NEW === utilities reused across gestures
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // updated each move using reticle height


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

    // Fallback Lights (when AR light estimation is not available)
    fallbackLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    fallbackLight.position.set(0, 1, 0);
    scene.add(fallbackLight);

    directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight.position.set(0, 4, 2);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Light Estimation Setup
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

    // AR Button
    const arButton = ARButton.createButton(renderer, {
      requiredFeatures: ["hit-test"],
      optionalFeatures: ["light-estimation", "dom-overlay"],
      domOverlay: { root: document.body },
    });
    arButton.style.bottom = "20%";
    document.body.appendChild(arButton);

    // Transform Controls (still available via keyboard, but gestures drive transforms)
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
    // keep controller select for debug if wanted; L gesture will also insert
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

    // Transform Gizmo Keyboard Shortcuts
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

    // === NEW === Add model tap-selection + menu hookup
    renderer.domElement.addEventListener("pointerdown", handleModelPointerDown, false);

    // === NEW === Hook up mode menu buttons
    const menuEl = document.getElementById("mode-menu");
    if (menuEl) {
      menuEl.addEventListener("click", (ev) => {
        const btn = ev.target.closest("button[data-mode]");
        if (!btn) return;
        setActiveMode(btn.getAttribute("data-mode"));
      });
    }

    // === NEW === Add gesture listeners (for translate/rotate/scale modes)
    renderer.domElement.addEventListener("touchstart", handleTouchStart, { passive: false });
    renderer.domElement.addEventListener("touchmove", handleTouchMove, { passive: false });
    renderer.domElement.addEventListener("touchend", handleTouchEnd, { passive: false });
    renderer.domElement.addEventListener("touchcancel", handleTouchEnd, { passive: false });

    // === NEW === L gesture detection listeners (global)
    renderer.domElement.addEventListener("pointerdown", beginLGestureTrack, { passive: false });
    renderer.domElement.addEventListener("pointermove", trackLGesture, { passive: false });
    renderer.domElement.addEventListener("pointerup", endLGestureTrack, { passive: false });
  }

  function onSelect() {
    // controller tap placement (optional fallback)
    if (reticle.visible) {
      placeNewModelAtReticle();
    }
  }
  function onSelect(event) {
  const session = renderer.xr.getSession();
  const viewerPose = event.frame.getViewerPose(renderer.xr.getReferenceSpace());

  if (!viewerPose) return;

  const raycaster = new THREE.Raycaster();
  const screenPos = new THREE.Vector2(0, 0); // center of screen (controller ray)

  raycaster.setFromCamera(screenPos, camera);
  const intersects = raycaster.intersectObjects(scene.children, true);

  for (let i = 0; i < intersects.length; i++) {
    const obj = intersects[i].object;

    // Check if user tapped on an inserted model
    if (obj.parent && obj.parent.userData.isModel) {
      selectedModel = obj.parent;
      transformControl.attach(selectedModel);

      // Show TRS menu
      document.getElementById("mode-menu").classList.remove("hidden");
      return; // Don't add a new model
    }
  }

  // No model was tapped, so insert new model
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

    newModel.userData.isModel = true; // mark it as tappable model

    scene.add(newModel);
    selectedModel = newModel;
    transformControl.attach(selectedModel);

    // Show TRS menu when added
    document.getElementById("mode-menu").classList.remove("hidden");
  }
}


  function placeNewModelAtReticle() {
    let base = items[itemSelectedIndex];
    if (!base) return;
    let newModel = base.clone();
    newModel.visible = true;
    reticle.matrix.decompose(
      newModel.position,
      newModel.quaternion,
      newModel.scale
    );
    let scaleFactor = modelScaleFactor[itemSelectedIndex];
    newModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
    scene.add(newModel);
    placedModels.push(newModel);
    selectModel(newModel);
  }

  // === NEW === model selection from tap
  function handleModelPointerDown(evt) {
    // ignore if menu click overlay
    if (evt.target !== renderer.domElement) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;
    ndc.set(x, y);
    raycaster.setFromCamera(ndc, camera);
    const intersects = raycaster.intersectObjects(placedModels, true);
    if (intersects.length > 0) {
      let obj = intersects[0].object;
      while (obj.parent && obj.parent !== scene) obj = obj.parent;
      selectModel(obj);
    } else {
      // tapped empty space; hide menu
      showModeMenu(false);
      activeMode = null;
      selectedModel = null;
      transformControl.detach();
    }
  }

  // === NEW === selectModel helper
  function selectModel(model) {
    selectedModel = model;
    transformControl.attach(selectedModel); // still available (desktop)
    showModeMenu(true);
    highlightActiveModeButton();
  }

  // === NEW === mode menu show/hide
  function showModeMenu(show) {
    const m = document.getElementById("mode-menu");
    if (!m) return;
    if (show) m.classList.remove("hidden");
    else m.classList.add("hidden");
  }

  // === NEW === setActiveMode
  function setActiveMode(mode) {
    activeMode = mode; // 'translate' | 'rotate' | 'scale'
    highlightActiveModeButton();
    // also set transformControl for desktop fallback
    if (mode === "translate") transformControl.setMode("translate");
    if (mode === "rotate") transformControl.setMode("rotate");
    if (mode === "scale") transformControl.setMode("scale");
  }

  function highlightActiveModeButton() {
    const m = document.getElementById("mode-menu");
    if (!m) return;
    [...m.querySelectorAll("button[data-mode]")].forEach(btn => {
      const isActive = btn.getAttribute("data-mode") === activeMode;
      btn.classList.toggle("active", isActive);
    });
  }

  // === NEW === TOUCH GESTURE HANDLERS (Translate / Rotate / Scale)
  function handleTouchStart(e) {
    if (!selectedModel || !activeMode) return;
    if (e.touches.length === 1) {
      const t = e.touches[0];
      lastTouchPoint = new THREE.Vector2(t.clientX, t.clientY);
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDist = Math.sqrt(dx * dx + dy * dy);
      pinchStartScale = selectedModel.scale.x; // assume uniform
      rotateStartAngle = Math.atan2(
        e.touches[1].clientY - e.touches[0].clientY,
        e.touches[1].clientX - e.touches[0].clientX
      );
      rotateStartY = selectedModel.rotation.y;
    }
  }

  function handleTouchMove(e) {
    if (!selectedModel || !activeMode) return;
    // prevent browser gestures
    e.preventDefault();

    // keep groundPlane height at reticle Y (best-known floor)
    let planeHeight = 0;
    if (reticle && reticle.visible) {
      const p = new THREE.Vector3();
      const q = new THREE.Quaternion();
      const s = new THREE.Vector3();
      reticle.matrix.decompose(p, q, s);
      planeHeight = p.y;
    }
    groundPlane.constant = -planeHeight; // plane = (n·p)+constant=0 with n=(0,1,0)

    if (activeMode === "translate" && e.touches.length === 1 && lastTouchPoint) {
      const t = e.touches[0];
      const worldPrev = screenToWorld(lastTouchPoint.x, lastTouchPoint.y);
      const worldNow  = screenToWorld(t.clientX, t.clientY);
      if (worldPrev && worldNow) {
        const delta = worldNow.sub(worldPrev);
        selectedModel.position.add(delta);
      }
      lastTouchPoint.set(t.clientX, t.clientY);
    }

    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // pinch scale (active in translate or scale modes? We'll restrict to scale mode)
      if (activeMode === "scale" && pinchStartDist) {
        const factor = dist / pinchStartDist;
        const newS = pinchStartScale * factor;
        selectedModel.scale.set(newS, newS, newS);
      }

      // rotate mode (2-finger twist)
      if (activeMode === "rotate" && rotateStartAngle !== null) {
        const angleNow = Math.atan2(
          e.touches[1].clientY - e.touches[0].clientY,
          e.touches[1].clientX - e.touches[0].clientX
        );
        const delta = angleNow - rotateStartAngle;
        selectedModel.rotation.y = rotateStartY + delta;
      }
    }
  }

  function handleTouchEnd() {
    lastTouchPoint = null;
    pinchStartDist = null;
    pinchStartScale = null;
    rotateStartAngle = null;
    rotateStartY = null;
  }

  // === NEW === screenToWorld using raycast vs ground plane
  function screenToWorld(px, py) {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.x = ((px - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((py - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hit = new THREE.Vector3();
    const ok = raycaster.ray.intersectPlane(groundPlane, hit);
    return ok ? hit : null;
  }

  // === NEW === "L" Gesture Detection ===
  let lGestureActive = false;
  let lStart = null;
  let lPoints = [];
  const MIN_SEG_LEN = 40; // px
  const MAX_ANGLE_DEG = 110; // tolerance for ~right angle
  const MIN_ANGLE_DEG = 70;

  function beginLGestureTrack(e) {
    if (e.pointerType !== "touch") return;
    lGestureActive = true;
    lPoints = [];
    lStart = { x: e.clientX, y: e.clientY };
    lPoints.push(lStart);
  }

  function trackLGesture(e) {
    if (!lGestureActive) return;
    lPoints.push({ x: e.clientX, y: e.clientY });
  }

  function endLGestureTrack(e) {
    if (!lGestureActive) return;
    lGestureActive = false;
    lPoints.push({ x: e.clientX, y: e.clientY });
    if (detectLShape(lPoints)) {
      // insert model at reticle (preferred)
      if (reticle && reticle.visible) {
        placeNewModelAtReticle();
      } else {
        // fallback: raycast at end point to plane
        const hit = screenToWorld(e.clientX, e.clientY);
        if (hit) {
          placeNewModelAtPoint(hit);
        }
      }
    }
  }

  function detectLShape(pts) {
    if (pts.length < 3) return false;
    // simple: measure total bounding box vector; break into two main segments
    // Approach: find point where path turns most (max angle)
    let maxTurnIdx = 1;
    let maxTurnVal = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const c = pts[i + 1];
      const v1x = b.x - a.x;
      const v1y = b.y - a.y;
      const v2x = c.x - b.x;
      const v2y = c.y - b.y;
      const dot = v1x * v2x + v1y * v2y;
      const mag1 = Math.sqrt(v1x * v1x + v1y * v1y);
      const mag2 = Math.sqrt(v2x * v2x + v2y * v2y);
      if (mag1 < 1 || mag2 < 1) continue;
      const cos = dot / (mag1 * mag2);
      const ang = Math.acos(Math.min(Math.max(cos, -1), 1)); // radians
      if (ang > maxTurnVal) {
        maxTurnVal = ang;
        maxTurnIdx = i;
      }
    }

    const p0 = pts[0];
    const pk = pts[maxTurnIdx];
    const pN = pts[pts.length - 1];

    const seg1 = Math.hypot(pk.x - p0.x, pk.y - p0.y);
    const seg2 = Math.hypot(pN.x - pk.x, pN.y - pk.y);
    if (seg1 < MIN_SEG_LEN || seg2 < MIN_SEG_LEN) return false;

    // angle between p0->pk and pk->pN
    const v1x = pk.x - p0.x;
    const v1y = pk.y - p0.y;
    const v2x = pN.x - pk.x;
    const v2y = pN.y - pk.y;
    const dot = v1x * v2x + v1y * v2y;
    const mag1 = Math.sqrt(v1x * v1x + v1y * v1y);
    const mag2 = Math.sqrt(v2x * v2x + v2y * v2y);
    const cos = dot / (mag1 * mag2);
    const angDeg = THREE.MathUtils.radToDeg(Math.acos(Math.min(Math.max(cos, -1), 1)));
    return angDeg >= MIN_ANGLE_DEG && angDeg <= MAX_ANGLE_DEG;
  }

  function placeNewModelAtPoint(worldPos) {
    let base = items[itemSelectedIndex];
    if (!base) return;
    let newModel = base.clone();
    newModel.visible = true;
    newModel.position.copy(worldPos);
    // keep upright
    newModel.quaternion.copy(new THREE.Quaternion()); // identity
    let scaleFactor = modelScaleFactor[itemSelectedIndex];
    newModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
    scene.add(newModel);
    placedModels.push(newModel);
    selectModel(newModel);
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
