import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { ARButton } from "three/examples/jsm/webxr/ARButton";
import "./App.css";

let camera, scene, renderer;
let controller;
let reticle;
let model = null;
let selected = false;

let previousTouches = [];
let isDragging = false;
let dragStart = null;

init();
animate();

function init() {
  // SCENE SETUP
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera();

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  document.body.appendChild(ARButton.createButton(renderer, { requiredFeatures: ["hit-test"] }));

  // LIGHTING
  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
  scene.add(light);

  // CONTROLLER SETUP
  controller = renderer.xr.getController(0);
  scene.add(controller);

  // RETICLE FOR PLACEMENT
  const geometry = new THREE.RingGeometry(0.1, 0.15, 32).rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
  reticle = new THREE.Mesh(geometry, material);
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  // HIT TEST SOURCE
  let hitTestSource = null;
  let hitTestSourceRequested = false;

  renderer.xr.addEventListener("sessionstart", () => {
    const session = renderer.xr.getSession();

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
  });

  // LOAD MODEL
  const loader = new GLTFLoader();
  loader.load("/chair.glb", (gltf) => {
    model = gltf.scene;
    model.visible = false;
    scene.add(model);
  });

  // TOUCH EVENTS FOR MOVE, ROTATE, SCALE
  renderer.domElement.addEventListener("touchstart", onTouchStart, false);
  renderer.domElement.addEventListener("touchmove", onTouchMove, false);
  renderer.domElement.addEventListener("touchend", onTouchEnd, false);

  // ANIMATION LOOP
  function animateLoop() {
    renderer.setAnimationLoop(render);
  }
  animateLoop();

  function render(timestamp, frame) {
    if (frame) {
      const referenceSpace = renderer.xr.getReferenceSpace();
      const session = renderer.xr.getSession();

      const viewerPose = frame.getViewerPose(referenceSpace);

      if (hitTestSource && viewerPose) {
        const hitTestResults = frame.getHitTestResults(hitTestSource);
        if (hitTestResults.length > 0 && !model?.visible) {
          const hit = hitTestResults[0];
          const pose = hit.getPose(referenceSpace);
          reticle.visible = true;
          reticle.matrix.fromArray(pose.transform.matrix);
        }
      }
    }

    renderer.render(scene, camera);
  }
}

// TOUCH EVENTS
function onTouchStart(event) {
  if (event.touches.length === 1 && model && !model.visible && reticle.visible) {
    model.position.setFromMatrixPosition(reticle.matrix);
    model.visible = true;
  }

  if (event.touches.length === 1) {
    const touch = event.touches[0];
    const x = (touch.clientX / window.innerWidth) * 2 - 1;
    const y = -(touch.clientY / window.innerHeight) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera({ x, y }, camera);
    const intersects = raycaster.intersectObject(model, true);

    if (intersects.length > 0) {
      selected = true;
      dragStart = intersects[0].point;
      isDragging = true;
    }
  }

  previousTouches = [...event.touches];
}

function onTouchMove(event) {
  if (!selected || !model) return;

  if (event.touches.length === 1 && isDragging) {
    const touch = event.touches[0];
    const x = (touch.clientX / window.innerWidth) * 2 - 1;
    const y = -(touch.clientY / window.innerHeight) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera({ x, y }, camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -model.position.y);
    const point = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, point);

    if (point && dragStart) {
      const offset = point.clone().sub(dragStart);
      model.position.add(offset);
      dragStart = point;
    }
  }

  // Scale and Rotate with 2 fingers
  if (event.touches.length === 2 && previousTouches.length === 2) {
    const [prevTouch1, prevTouch2] = previousTouches;
    const [currTouch1, currTouch2] = event.touches;

    const prevDist = Math.hypot(
      prevTouch1.clientX - prevTouch2.clientX,
      prevTouch1.clientY - prevTouch2.clientY
    );
    const currDist = Math.hypot(
      currTouch1.clientX - currTouch2.clientX,
      currTouch1.clientY - currTouch2.clientY
    );

    const scaleChange = currDist / prevDist;
    model.scale.multiplyScalar(scaleChange);

    // Rotation
    const prevAngle = Math.atan2(
      prevTouch2.clientY - prevTouch1.clientY,
      prevTouch2.clientX - prevTouch1.clientX
    );
    const currAngle = Math.atan2(
      currTouch2.clientY - currTouch1.clientY,
      currTouch2.clientX - currTouch1.clientX
    );
    const angleDelta = currAngle - prevAngle;
    model.rotation.y += angleDelta;
  }

  previousTouches = [...event.touches];
}

function onTouchEnd(event) {
  if (event.touches.length === 0) {
    selected = false;
    isDragging = false;
  }
  previousTouches = [...event.touches];
}
