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

  // -------------------------------------------------------------------------
  // Orbit Controls (Mouse/Touch)
  // -------------------------------------------------------------------------
  setupOrbitControls() {
    this.orbitControls = new OrbitControls(this.camera, this.domElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.05;

    // Store original handlers to restore later
    this.originalOrbitHandlers = {
      start: this.orbitControls._onMouseDown.bind(this.orbitControls),
      move: this.orbitControls._onMouseMove.bind(this.orbitControls),
      end: this.orbitControls._onMouseUp.bind(this.orbitControls)
    };
  }

  enableOrbitControls() {
    this.orbitControls.enabled = true;
    this.domElement.addEventListener('mousedown', this.originalOrbitHandlers.start);
    this.domElement.addEventListener('mousemove', this.originalOrbitHandlers.move);
    this.domElement.addEventListener('mouseup', this.originalOrbitHandlers.end);
    this.domElement.addEventListener('touchstart', this.originalOrbitHandlers.start);
    this.domElement.addEventListener('touchmove', this.originalOrbitHandlers.move);
    this.domElement.addEventListener('touchend', this.originalOrbitHandlers.end);
  }

  disableOrbitControls() {
    this.orbitControls.enabled = false;
    this.domElement.removeEventListener('mousedown', this.originalOrbitHandlers.start);
    this.domElement.removeEventListener('mousemove', this.originalOrbitHandlers.move);
    this.domElement.removeEventListener('mouseup', this.originalOrbitHandlers.end);
    this.domElement.removeEventListener('touchstart', this.originalOrbitHandlers.start);
    this.domElement.removeEventListener('touchmove', this.originalOrbitHandlers.move);
    this.domElement.removeEventListener('touchend', this.originalOrbitHandlers.end);
  }

  // -------------------------------------------------------------------------
  // XR Controllers
  // -------------------------------------------------------------------------
  setupXRControllers() {
    const controllerModelFactory = new XRControllerModelFactory();

    this.controller1 = this.renderer.xr.getController(0);
    this.controller1.addEventListener('selectstart', this.onSelectStart.bind(this));
    this.controller1.addEventListener('selectend', this.onSelectEnd.bind(this));
    this.controller1.addEventListener('squeezestart', this.onSqueezeStart.bind(this));
    this.controller1.addEventListener('squeezeend', this.onSqueezeEnd.bind(this));
    this.scene.add(this.controller1);

    this.controllerGrip1 = this.renderer.xr.getControllerGrip(0);
    this.controllerGrip1.add(controllerModelFactory.createControllerModel(this.controllerGrip1));
    this.scene.add(this.controllerGrip1);

    this.controller2 = this.renderer.xr.getController(1);
    this.controller2.addEventListener('selectstart', this.onSelectStart.bind(this));
    this.controller2.addEventListener('selectend', this.onSelectEnd.bind(this));
    this.controller2.addEventListener('squeezestart', this.onSqueezeStart.bind(this));
    this.controller2.addEventListener('squeezeend', this.onSqueezeEnd.bind(this));
    this.scene.add(this.controller2);

    this.controllerGrip2 = this.renderer.xr.getControllerGrip(1);
    this.controllerGrip2.add(controllerModelFactory.createControllerModel(this.controllerGrip2));
    this.scene.add(this.controllerGrip2);

    // Hide by default
    this.controller1.visible = false;
    this.controller2.visible = false;
    this.controllerGrip1.visible = false;
    this.controllerGrip2.visible = false;
  }

  // -------------------------------------------------------------------------
  // Mouse / Touch Events
  // -------------------------------------------------------------------------
  setupMouseTouchEvents() {
    this.domElement.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.domElement.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.domElement.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.domElement.addEventListener('touchstart', this.onTouchStart.bind(this));
    this.domElement.addEventListener('touchmove', this.onTouchMove.bind(this));
    this.domElement.addEventListener('touchend', this.onTouchEnd.bind(this));
  }

  onMouseDown(event) {
    if (event.button !== 0) return; // Left click only
    this.onPointerDown(event.clientX, event.clientY);
  }

  onTouchStart(event) {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    this.onPointerDown(touch.clientX, touch.clientY);
  }

  onPointerDown(clientX, clientY) {
    if (this.isDragging) return;

    this.mouse.x = (clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(clientY / window.innerHeight) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.draggableObjects, true);

    if (intersects.length > 0) {
      const obj = intersects[0].object;
      while (obj.parent && !this.draggableObjects.includes(obj.parent)) {
        obj = obj.parent;
      }
      if (this.draggableObjects.includes(obj)) {
        this.selectedObject = obj;
        this.isDragging = true;
        this.lastDragPoint = intersects[0].point.clone();
        this.disableOrbitControls();
      }
    }
  }

  onMouseMove(event) {
    this.onPointerMove(event.clientX, event.clientY);
  }

  onTouchMove(event) {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    this.onPointerMove(touch.clientX, touch.clientY);
  }

  onPointerMove(clientX, clientY) {
    if (!this.isDragging || !this.selectedObject) return;

    this.mouse.x = (clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(clientY / window.innerHeight) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      new THREE.Vector3(0, 1, 0),
      this.selectedObject.position
    );
    const intersectPoint = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(plane, intersectPoint);

    const delta = intersectPoint.clone().sub(this.lastDragPoint);
    this.selectedObject.position.add(delta);
    this.lastDragPoint = intersectPoint.clone();
  }

  onMouseUp() {
    this.onPointerUp();
  }

  onTouchEnd() {
    this.onPointerUp();
  }

  onPointerUp() {
    if (this.isDragging) {
      this.isDragging = false;
      this.selectedObject = null;
      this.enableOrbitControls();
    }
  }

  // -------------------------------------------------------------------------
  // XR Controller Events
  // -------------------------------------------------------------------------
  onSelectStart(event) {
    const controller = event.target;
    this.activeController = controller;

    const intersects = this.getIntersections(controller);
    if (intersects.length > 0) {
      const obj = intersects[0].object;
      let root = obj;
      while (root.parent && !this.draggableObjects.includes(root.parent)) {
        root = root.parent;
      }
      if (this.draggableObjects.includes(root)) {
        this.selectedObject = root;
        this.lastControllerPosition.copy(controller.position);
      }
    }
  }

  onSelectEnd() {
    this.selectedObject = null;
    this.activeController = null;
  }

  onSqueezeStart(event) {
    const controller = event.target;
    if (this.selectedObject) {
      this.rotationMode = true;
      this.startControllerQuaternion.copy(controller.quaternion);
      this.startObjectQuaternion.copy(this.selectedObject.quaternion);
    }
  }

  onSqueezeEnd() {
    this.rotationMode = false;
  }

  getIntersections(controller) {
    const tempMatrix = new THREE.Matrix4();
    tempMatrix.identity().extractRotation(controller.matrixWorld);

    this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

    return this.raycaster.intersectObjects(this.draggableObjects, true);
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------
  update() {
    if (!this.isXRSessionActive) return;

    if (this.activeController && this.selectedObject) {
      const controllerPos = this.activeController.position;
      const delta = new THREE.Vector3().subVectors(controllerPos, this.lastControllerPosition);
      this.selectedObject.position.add(delta);
      this.lastControllerPosition.copy(controllerPos);
    }

    if (this.rotationMode && this.selectedObject && this.activeController) {
      const currentQuat = this.activeController.quaternion;
      const deltaQuat = new THREE.Quaternion().copy(currentQuat).multiply(this.startControllerQuaternion.clone().conjugate());
      this.selectedObject.quaternion.copy(this.startObjectQuaternion).multiply(deltaQuat);
    }

    this.orbitControls.update();
  }

  // -------------------------------------------------------------------------
  // Public: Set draggable objects
  // -------------------------------------------------------------------------
  setDraggableObjects(objects) {
    this.draggableObjects = objects;
  }
}
