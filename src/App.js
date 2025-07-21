// Gesture-based AR Model Interaction Code with Gizmo Controls
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
let transformControl;

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
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    reticle = new THREE.Mesh(geometry, material);
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    let hitTestSource = null;
    let hitTestSourceRequested = false;

    // Add Transform Controls (Gizmo)
    transformControl = new TransformControls(camera, renderer.domElement);
    transformControl.addEventListener('dragging-changed', function (event) {
        renderer.xr.enabled = !event.value;
    });
    scene.add(transformControl);

    window.addEventListener('dblclick', () => {
        if (reticle.visible) {
            loader.load("/models/chair/scene.gltf", function (gltf) {
                if (model) {
                    scene.remove(model);
                    transformControl.detach();
                }
                model = gltf.scene;
                model.scale.set(0.3, 0.3, 0.3);
                model.position.setFromMatrixPosition(reticle.matrix);
                scene.add(model);
                transformControl.attach(model);
            });
        }
    });

    // Keyboard toggle between translate, rotate, and scale
    window.addEventListener('keydown', (event) => {
        switch (event.key.toLowerCase()) {
            case 't':
                transformControl.setMode('translate');
                break;
            case 'r':
                transformControl.setMode('rotate');
                break;
            case 's':
                transformControl.setMode('scale');
                break;
        }
    });

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

                hitTestSourceRequested = true;
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
}
