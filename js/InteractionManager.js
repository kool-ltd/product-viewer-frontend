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
    this.lastDragPoint = null;   // <-- changed from const

    this.setupOrbitControls();
    this.enableOrbitControls();
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

  setupOrbitControls() {
    this.orbitControls = new OrbitControls(this.camera, this.domElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.05;
    this.orbitStartHandler = null;
    this.orbitChangeHandler = null;
    this.orbitEndHandler = null;
  }

  enableOrbitControls() {
    this.orbitControls.enabled = true;
    this.orbitStartHandler = () => {};
    this.orbitChangeHandler = () => {};
    this.orbitEndHandler = () => {};
    this.orbitControls.addEventListener('start', this.orbitStartHandler);
    this.orbitControls.addEventListener('change', this.orbitChangeHandler);
    this.orbitControls.addEventListener('end', this.orbitEndHandler);
  }

  disableOrbitControls() {
    this.orbitControls.enabled = false;
    if (this.orbitStartHandler) {
      this.orbitControls.removeEventListener('start', this.orbitStartHandler);
      this.orbitControls.removeEventListener('change', this.orbitChangeHandler);
      this.orbitControls.removeEventListener('end', this.orbitEndHandler);
    }
  }

  setupXRControllers() {
    const factory = new XRControllerModelFactory();
    this.controller1 = this.renderer.xr.getController(0);
    this.controller1.addEventListener('selectstart', this.onSelectStart.bind(this));
    this.controller1.addEventListener('selectend', this.onSelectEnd.bind(this));
    this.controller1.addEventListener('squeezestart', this.onSqueezeStart.bind(this));
    this.controller1.addEventListener('squeezeend', this.onSqueezeEnd.bind(this));
    this.scene.add(this.controller1);

    this.controllerGrip1 = this.renderer.xr.getControllerGrip(0);
    this.controllerGrip1.add(factory.createControllerModel(this.controllerGrip1));
    this.scene.add(this.controllerGrip1);

    this.controller2 = this.renderer.xr.getController(1);
    this.controller2.addEventListener('selectstart', this.onSelectStart.bind(this));
    this.controller2.addEventListener('selectend', this.onSelectEnd.bind(this));
    this.controller2.addEventListener('squeezestart', this.onSqueezeStart.bind(this));
    this.controller2.addEventListener('squeezeend', this.onSqueezeEnd.bind(this));
    this.scene.add(this.controller2);

    this.controllerGrip2 = this.renderer.xr.getControllerGrip(1);
    this.controllerGrip2.add(factory.createControllerModel(this.controllerGrip2));
    this.scene.add(this.controllerGrip2);

    this.controller1.visible = this.controller2.visible = false;
    this.controllerGrip1.visible = this.controllerGrip2.visible = false;
  }

  setupMouseTouchEvents() {
    this.domElement.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.domElement.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.domElement.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.domElement.addEventListener('touchstart', this.onTouchStart.bind(this));
    this.domElement.addEventListener('touchmove', this.onTouchMove.bind(this));
    this.domElement.addEventListener('touchend', this.onTouchEnd.bind(this));
  }

  onMouseDown(e) { if (e.button !== 0) return; this.onPointerDown(e.clientX, e.clientY); }
  onTouchStart(e) { if (e.touches.length !== 1) return; const t = e.touches[0]; this.onPointerDown(t.clientX, t.clientY); }

  onPointerDown(x, y) {
    if (this.isDragging) return;
    this.mouse.x = (x / window.innerWidth) * 2 - 1;
    this.mouse.y = -(y / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const hits = this.raycaster.intersectObjects(this.draggableObjects, true);
    if (hits.length) {
      let obj = hits[0].object;
      while (obj.parent && !this.draggableObjects.includes(obj.parent)) obj = obj.parent;
      if (this.draggableObjects.includes(obj)) {
        this.selectedObject = obj;
        this.isDragging = true;
        this.lastDragPoint = hits[0].point.clone();
        this.disableOrbitControls();
      }
    }
  }

  onMouseMove(e) { this.onPointerMove(e.clientX, e.clientY); }
  onTouchMove(e) { if (e.touches.length !== 1) return; const t = e.touches[0]; this.onPointerMove(t.clientX, t.clientY); }

  onPointerMove(x, y) {
    if (!this.isDragging || !this.selectedObject) return;
    this.mouse.x = (x / window.innerWidth) * 2 - 1;
    this.mouse.y = -(y / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0,1,0), this.selectedObject.position);
    const point = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(plane, point);
    const delta = point.clone().sub(this.lastDragPoint);
    this.selectedObject.position.add(delta);
    this.lastDragPoint = point.clone();
  }

  onMouseUp() { this.onPointerUp(); }
  onTouchEnd() { this.onPointerUp(); }
  onPointerUp() {
    if (this.isDragging) {
      this.isDragging = false;
      this.selectedObject = null;
      this.enableOrbitControls();
    }
  }

  onSelectStart(e) {
    const ctrl = e.target;
    this.activeController = ctrl;
    const hits = this.getIntersections(ctrl);
    if (hits.length) {
      let obj = hits[0].object;
      while (obj.parent && !this.draggableObjects.includes(obj.parent)) obj = obj.parent;
      if (this.draggableObjects.includes(obj)) {
        this.selectedObject = obj;
        this.lastControllerPosition.copy(ctrl.position);
      }
    }
  }

  onSelectEnd() { this.selectedObject = null; this.activeController = null; }

  onSqueezeStart(e) {
    if (this.selectedObject) {
      this.rotationMode = true;
      this.startControllerQuaternion.copy(e.target.quaternion);
      this.startObjectQuaternion.copy(this.selectedObject.quaternion);
    }
  }

  onSqueezeEnd() { this.rotationMode = false; }

  getIntersections(controller) {
    const temp = new THREE.Matrix4().identity().extractRotation(controller.matrixWorld);
    this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    this.raycaster.ray.direction.set(0,0,-1).applyMatrix4(temp);
    return this.raycaster.intersectObjects(this.draggableObjects, true);
  }

  update() {
    if (!this.isXRSessionActive) return;
    if (this.activeController && this.selectedObject) {
      const pos = this.activeController.position;
      const delta = new THREE.Vector3().subVectors(pos, this.lastControllerPosition);
      this.selectedObject.position.add(delta);
      this.lastControllerPosition.copy(pos);
    }
    if (this.rotationMode && this.selectedObject && this.activeController) {
      const cur = this.activeController.quaternion;
      const deltaQ = new THREE.Quaternion().copy(cur).multiply(this.startControllerQuaternion.clone().conjugate());
      this.selectedObject.quaternion.copy(this.startObjectQuaternion).multiply(deltaQ);
    }
    this.orbitControls.update();
  }

  setDraggableObjects(arr) { this.draggableObjects = arr; }
}
