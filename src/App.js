import React, { useEffect } from "react";
import "./App.css";
import * as THREE from "three";
import { ARButton } from "three/examples/jsm/webxr/ARButton";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { XREstimatedLight } from "three/examples/jsm/webxr/XREstimatedLight";

function App() {
  useEffect(() => {
    let container, camera, scene, renderer, controller, reticle, model = null;
    let initialDistance = null;
    let currentTouches = [], isDragging = false, previousTouch = null;
    let lastTouchCenter = null, holdTimeout = null;
    let allowTranslation = false, gesturePath = [], gestureStartTime = null;

    init();

    function init() {
      container = document.createElement("div");
      document.body.appendChild(container);

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.xr.enabled = true;
      container.appendChild(renderer.domElement);

      const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
      light.position.set(0.5, 1, 0.25);
      scene.add(light);

      const loader = new GLTFLoader();
      loader.load("models/chair/scene.gltf", function (gltf) {
        model = gltf.scene;
        model.scale.set(0.5, 0.5, 0.5);
        model.visible = false;
        scene.add(model);
      });

      reticle = new THREE.Mesh(
        new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x007bff })
      );
      reticle.matrixAutoUpdate = false;
      reticle.visible = false;
      scene.add(reticle);

      controller = renderer.xr.getController(0);
      scene.add(controller);

      document.body.appendChild(ARButton.createButton(renderer, { requiredFeatures: ["hit-test"] }));

      const session = renderer.xr.getSession();
      session.addEventListener("selectstart", () => isDragging = true);
      session.addEventListener("selectend", () => isDragging = false);

      renderer.domElement.addEventListener("touchstart", onTouchStart, false);
      renderer.domElement.addEventListener("touchmove", onTouchMove, false);
      renderer.domElement.addEventListener("touchend", onTouchEnd, false);

      renderer.setAnimationLoop(render);
    }

    function render(timestamp, frame) {
      renderer.render(scene, camera);
    }

    function getTouchDistance(touches) {
      const dx = touches[0].pageX - touches[1].pageX;
      const dy = touches[0].pageY - touches[1].pageY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    function getTouchCenter(touches) {
      return {
        x: (touches[0].pageX + touches[1].pageX) / 2,
        y: (touches[0].pageY + touches[1].pageY) / 2,
      };
    }

    function recognizeLShape(gesture) {
      if (gesture.length < 5) return false;
      const cornerIndex = Math.floor(gesture.length / 2);
      const corner = gesture[cornerIndex];
      const beforeCorner = gesture[0];
      const afterCorner = gesture[gesture.length - 1];
      const horizontal = Math.abs(corner.x - beforeCorner.x) > 50 && Math.abs(corner.y - beforeCorner.y) < 30;
      const vertical = Math.abs(afterCorner.y - corner.y) > 50 && Math.abs(afterCorner.x - corner.x) < 30;
      return horizontal && vertical;
    }

    function onTouchStart(event) {
      currentTouches = event.touches;
      if (event.touches.length === 1) {
        previousTouch = event.touches[0];
        holdTimeout = setTimeout(() => {
          allowTranslation = true;
        }, 2000);
        gesturePath = [{ x: event.touches[0].pageX, y: event.touches[0].pageY }];
        gestureStartTime = Date.now();
      } else if (event.touches.length === 2) {
        initialDistance = getTouchDistance(event.touches);
        lastTouchCenter = getTouchCenter(event.touches);
      }
    }

    function onTouchMove(event) {
      if (event.touches.length === 1 && previousTouch) {
        const deltaX = event.touches[0].pageX - previousTouch.pageX;
        const deltaY = event.touches[0].pageY - previousTouch.pageY;

        gesturePath.push({ x: event.touches[0].pageX, y: event.touches[0].pageY });

        if (allowTranslation && model) {
          model.position.x += deltaX * 0.005;
          model.position.y -= deltaY * 0.005;
        } else if (model) {
          model.rotation.y += deltaX * 0.005;
          model.rotation.x += deltaY * 0.005;
        }

        previousTouch = event.touches[0];
      } else if (event.touches.length === 2 && model) {
        const newDistance = getTouchDistance(event.touches);
        const scale = newDistance / initialDistance;
        model.scale.set(scale * 0.5, scale * 0.5, scale * 0.5);

        const newCenter = getTouchCenter(event.touches);
        const deltaX = (newCenter.x - lastTouchCenter.x) / window.innerWidth;
        const deltaY = (newCenter.y - lastTouchCenter.y) / window.innerHeight;
        model.position.x += deltaX * 2;
        model.position.y -= deltaY * 2;
        lastTouchCenter = newCenter;
      }
    }

    function onTouchEnd(event) {
      currentTouches = event.touches;
      clearTimeout(holdTimeout);

      if (gesturePath.length > 0 && Date.now() - gestureStartTime < 2000) {
        if (!model || !model.visible) {
          if (recognizeLShape(gesturePath)) {
            const referenceSpace = renderer.xr.getReferenceSpace();
            const frame = renderer.xr.getFrame();
            const hitTestResults = frame.getHitTestResults(controller);
            if (hitTestResults.length > 0) {
              const hit = hitTestResults[0];
              const pose = hit.getPose(referenceSpace);
              if (model) {
                model.visible = true;
                model.position.set(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z);
              }
            }
          }
        }
      }

      allowTranslation = false;
      gesturePath = [];

      if (event.touches.length < 2) {
        initialDistance = null;
        lastTouchCenter = null;
      }
      if (event.touches.length === 0) {
        previousTouch = null;
      }
    }
  }, []);

  return <div className="App" />;
}

export default App;
