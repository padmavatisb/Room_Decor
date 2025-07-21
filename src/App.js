import "./App.css";
import * as THREE from "three";
import { ARButton } from "three/examples/jsm/webxr/ARButton";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { XREstimatedLight } from "three/examples/jsm/webxr/XREstimatedLight";
import { TransformControls } from "three/examples/jsm/controls/TransformControls";

function App() {
  // ... (keep all your existing variable declarations)

  // Add these new variables for gesture controls
  let touchStartPosition = new THREE.Vector2();
  let touchStartDistance = 0;
  let touchStartRotation = 0;
  let touchStartModelPosition = new THREE.Vector3();
  let touchStartModelScale = new THREE.Vector3();
  let touchStartModelQuaternion = new THREE.Quaternion();
  let isTwoFingerTouch = false;
  let isThreeFingerTouch = false;

  init();
  setupFurnitureSelection();
  animate();

  function init() {
    // ... (keep all your existing init code)

    // Add touch event listeners
    const canvas = renderer.domElement;
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });
  }

  // ... (keep all your existing functions until animate())

  function onTouchStart(event) {
    if (!selectedModel) return;
    
    event.preventDefault();
    
    const touches = event.touches;
    
    if (touches.length === 1) {
      // Single touch - prepare for translation
      touchStartPosition.set(touches[0].clientX, touches[0].clientY);
      touchStartModelPosition.copy(selectedModel.position);
      isTwoFingerTouch = false;
      isThreeFingerTouch = false;
    } 
    else if (touches.length === 2) {
      // Two touches - prepare for rotation/scale
      isTwoFingerTouch = true;
      isThreeFingerTouch = false;
      
      // Calculate initial distance between fingers (for scaling)
      touchStartDistance = Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY
      );
      
      // Calculate initial angle (for rotation)
      touchStartRotation = Math.atan2(
        touches[1].clientY - touches[0].clientY,
        touches[1].clientX - touches[0].clientX
      );
      
      touchStartModelScale.copy(selectedModel.scale);
      touchStartModelQuaternion.copy(selectedModel.quaternion);
    }
    else if (touches.length === 3) {
      // Three touches - prepare for translation in Y axis
      isThreeFingerTouch = true;
      touchStartPosition.set(touches[0].clientX, touches[0].clientY);
      touchStartModelPosition.copy(selectedModel.position);
    }
  }

  function onTouchMove(event) {
    if (!selectedModel) return;
    
    event.preventDefault();
    
    const touches = event.touches;
    
    if (touches.length === 1 && !isTwoFingerTouch && !isThreeFingerTouch) {
      // Single finger drag - translate in X/Z plane
      const touchCurrentPosition = new THREE.Vector2(touches[0].clientX, touches[0].clientY);
      const touchDelta = new THREE.Vector2().subVectors(touchCurrentPosition, touchStartPosition);
      
      // Convert screen delta to world movement (adjust sensitivity as needed)
      const movementX = touchDelta.x * 0.01;
      const movementZ = touchDelta.y * 0.01;
      
      // Move the model in X/Z plane (relative to camera)
      const cameraDirection = new THREE.Vector3();
      camera.getWorldDirection(cameraDirection);
      cameraDirection.y = 0;
      cameraDirection.normalize();
      
      const right = new THREE.Vector3();
      right.crossVectors(new THREE.Vector3(0, 1, 0), cameraDirection).normalize();
      
      selectedModel.position.copy(touchStartModelPosition);
      selectedModel.position.add(right.multiplyScalar(-movementX));
      selectedModel.position.add(cameraDirection.multiplyScalar(movementZ));
    }
    else if (touches.length === 2 && isTwoFingerTouch) {
      // Two finger gesture - rotate and scale
      const currentDistance = Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY
      );
      
      const currentRotation = Math.atan2(
        touches[1].clientY - touches[0].clientY,
        touches[1].clientX - touches[0].clientX
      );
      
      // Scale based on pinch gesture
      const scaleFactor = currentDistance / touchStartDistance;
      selectedModel.scale.set(
        touchStartModelScale.x * scaleFactor,
        touchStartModelScale.y * scaleFactor,
        touchStartModelScale.z * scaleFactor
      );
      
      // Rotate based on twist gesture
      const rotationDelta = currentRotation - touchStartRotation;
      selectedModel.quaternion.copy(touchStartModelQuaternion);
      selectedModel.rotateY(rotationDelta);
    }
    else if (touches.length === 3 && isThreeFingerTouch) {
      // Three finger drag - translate in Y axis
      const touchCurrentPosition = new THREE.Vector2(touches[0].clientX, touches[0].clientY);
      const touchDelta = touchStartPosition.y - touchCurrentPosition.y;
      
      // Move the model in Y axis
      selectedModel.position.y = touchStartModelPosition.y + (touchDelta * 0.01);
    }
  }

  function onTouchEnd(event) {
    isTwoFingerTouch = false;
    isThreeFingerTouch = false;
  }

  // ... (keep your existing animate() and render() functions)

  return <div className="App"></div>;
}

export default App;
