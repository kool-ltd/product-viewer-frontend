import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

export class InteractionManager {
  constructor(scene, camera, renderer, domElement) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.domElement = domElement;

    this.isXRSessionActive = false;
    this.rotationMode = false;
    this.startControllerQuaternion = new THREE.Quaternion();
    this.startObjectQuaternion = new THREE.Quaternion();

    this.selectedObject = null;
    this.activeController = null;
    this.lastControllerPosition = new THREE.Vector3();

    this.raycaster = new THREE.Raycaster();
    this.draggableObjects = [];
    this.isDragging = false;

    this.mouse = new THREE.Vector2();
    this.lastMousePosition = new THREE.Vector2();
    this.lastDragPoint = null;

    this.originalOrbitHandlers = {};

    this.setupOrbitControls();
    this.setupXRControllers();
    this.setupMouseTouchEvents();

    if (this.renderer) {
      this.renderer.xr.addEventListener('sessionstart', () => {
        this.isXRSessionActive = true;
        if (this.controller1) this.controller1.visible = true;
        if (this.controller2) this.controller2.visible = true;
        if (this.controllerGrip1) this.controllerGrip1.visible = true;
        if (this.controllerGrip2) this.controllerGrip2.visible = true;
      });
      this.renderer.xr.addEventListener('sessionend', () => {
        this.isXRSessionActive = false;
        this.rotationMode = false;
      });
    }
  }

  // ... (the rest of the file you already had – no changes needed) ...
}
