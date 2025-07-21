// Gesture-based AR Model Interaction Code
import "./App.css";
import * as THREE from "three";
import { ARButton } from "three/examples/jsm/webxr/ARButton";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { XREstimatedLight } from "three/examples/jsm/webxr/XREstimatedLight";
import { TransformControls } from 'three/examples/jsm/controls/TransformControls';

let camera, scene, renderer;
let controller;
let reticle;
let model = null;
let mixer;
let gestureStart = null;
let previousTouchDistance = null;
let modelPosition = null;

let allowTranslate = false;

init();

function init() {
    const container = document.createElement("div");
    document.body.appendChild(container);

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    container.appendChild(renderer.domElement);

    document.body.appendChild(ARButton.createButton(renderer, { requiredFeatures: ['hit-test'] }));

    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
    light.position.set(0.5, 1, 0.25);
    scene.add(light);

    const loader = new GLTFLoader();

    controller = renderer.xr.getController(0);
    scene.add(controller);

    const geometry = new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial();
    reticle = new THREE.Mesh(geometry, material);
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    const hitTestSourceRequested = false;
    let hitTestSource = null;

    renderer.setAnimationLoop((timestamp, frame) => {
        if (frame) {
            const referenceSpace = renderer.xr.getReferenceSpace();
            const session = renderer.xr.getSession();

            if (!hitTestSourceRequested) {
                session.requestReferenceSpace('viewer').then((referenceSpace) => {
                    session.requestHitTestSource({ space: referenceSpace }).then((source) => {
                        hitTestSource = source;
                    });
                });

                session.addEventListener('end', () => {
                    hitTestSourceRequested = false;
                    hitTestSource = null;
                });
            }

            if (hitTestSource) {
                const hitTestResults = frame.getHitTestResults(hitTestSource);
                if (hitTestResults.length > 0) {
                    const hit = hitTestResults[0];
                    reticle.visible = true;
                    reticle.matrix.fromArray(hit.getPose(referenceSpace).transform.matrix);
                } else {
                    reticle.visible = false;
                }
            }
        }

        if (mixer) mixer.update(0.01);

        renderer.render(scene, camera);
    });

    window.addEventListener('touchstart', onTouchStart, false);
    window.addEventListener('touchmove', onTouchMove, false);
    window.addEventListener('touchend', onTouchEnd, false);

    function onTouchStart(event) {
        if (event.touches.length === 1) {
            gestureStart = {
                x: event.touches[0].clientX,
                y: event.touches[0].clientY,
                time: Date.now()
            };
        } else if (event.touches.length === 2) {
            previousTouchDistance = getTouchDistance(event);
        }
    }

    function onTouchMove(event) {
        if (!model) return;

        if (event.touches.length === 1 && gestureStart) {
            const dx = event.touches[0].clientX - gestureStart.x;
            const dy = event.touches[0].clientY - gestureStart.y;

            if (allowTranslate) {
                model.position.x += dx * 0.0005;
                model.position.z += dy * 0.0005;
            } else {
                model.rotation.y += dx * 0.01;
                model.rotation.x += dy * 0.01;
            }

            gestureStart = {
                x: event.touches[0].clientX,
                y: event.touches[0].clientY,
                time: Date.now()
            };
        }

        if (event.touches.length === 2) {
            const newDistance = getTouchDistance(event);
            const scaleFactor = newDistance / previousTouchDistance;

            model.scale.multiplyScalar(scaleFactor);
            previousTouchDistance = newDistance;
        }
    }

    function onTouchEnd(event) {
        // Detect L gesture for inserting model
        if (gestureStart && Date.now() - gestureStart.time < 1000) {
            const dx = event.changedTouches[0].clientX - gestureStart.x;
            const dy = event.changedTouches[0].clientY - gestureStart.y;

            if (Math.abs(dx) > 50 && Math.abs(dy) > 50 && dx > 0 && dy > 0) {
                if (reticle.visible) {
                    if (model) {
                        modelPosition = model.position.clone();
                    }
                    loader.load("/models/chair/scene.gltf", function (gltf) {
                        model = gltf.scene;
                        model.scale.set(0.3, 0.3, 0.3);
                        model.position.setFromMatrixPosition(reticle.matrix);
                        scene.add(model);
                    });
                }
            }
        }

        allowTranslate = false;
        gestureStart = null;
    }

    function getTouchDistance(event) {
        const dx = event.touches[0].clientX - event.touches[1].clientX;
        const dy = event.touches[0].clientY - event.touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }
}
