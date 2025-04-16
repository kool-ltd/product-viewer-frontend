import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

export class InteractionManager {
    constructor(scene, camera, renderer, domElement) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.domElement = domElement;

        // Flag for XR session (AR or VR)
        this.isXRSessionActive = false;
        // Flag for whether rotation mode is active (when squeeze is pressed)
        this.rotationMode = false;
        // To store the controller's quaternion and object's quaternion at the start of a rotation
        this.startControllerQuaternion = new THREE.Quaternion();
        this.startObjectQuaternion = new THREE.Quaternion();

        this.selectedObject = null;
        this.activeController = null;
        this.lastControllerPosition = new THREE.Vector3();
        this.raycaster = new THREE.Raycaster();
        this.draggableObjects = [];
        this.isDragging = false;
        
        // Mouse/touch position tracking for non-XR dragging
        this.mouse = new THREE.Vector2();
        this.lastMousePosition = new THREE.Vector2();
        this.lastDragPoint = null;
        
        // Store original OrbitControls event handlers
        this.originalOrbitControlHandlers = {
            onMouseDown: null,
            onMouseMove: null,
            onMouseUp: null,
            onTouchStart: null,
            onTouchMove: null,
            onTouchEnd: null
        };

        this.setupOrbitControls();
        this.setupXRControllers();
        
        // Add event listeners for mouse/touch interaction
        this.setupMouseTouchEvents();
        
        if (this.renderer) {
            // Listen for session start/end events.
            this.renderer.xr.addEventListener('sessionstart', () => {
                console.log("XR session started");
                this.isXRSessionActive = true;
                // Ensure controllers are visible when XR is active.
                if (this.controller1) this.controller1.visible = true;
                if (this.controller2) this.controller2.visible = true;
                if (this.controllerGrip1) this.controllerGrip1.visible = true;
                if (this.controllerGrip2) this.controllerGrip2.visible = true;
            });
            
            this.renderer.xr.addEventListener('sessionend', () => {
                console.log("XR session ended");
                this.isXRSessionActive = false;
                this.rotationMode = false; // End any rotation mode.
            });
        }
    }

    setupOrbitControls() {
        // Check if we already have orbit controls from app
        if (window.app && window.app.orbitControls) {
            // Use the existing orbit controls
            this.orbitControls = window.app.orbitControls;
        } else {
            // Create new orbit controls if needed
            this.orbitControls = new OrbitControls(this.camera, this.domElement);
            this.orbitControls.rotateSpeed = 0.01;
            this.orbitControls.enableDamping = true;
            this.orbitControls.dampingFactor = 0.05;
        }
    }

    setupMouseTouchEvents() {
        // Add our event listeners with capture phase to intercept before orbit controls
        this.domElement.addEventListener('mousedown', this.onMouseDown.bind(this), true);
        this.domElement.addEventListener('mousemove', this.onMouseMove.bind(this), true);
        document.addEventListener('mouseup', this.onMouseUp.bind(this), true);
        
        // Touch events
        this.domElement.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false, capture: true });
        this.domElement.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false, capture: true });
        document.addEventListener('touchend', this.onTouchEnd.bind(this), { passive: false, capture: true });
        document.addEventListener('touchcancel', this.onTouchEnd.bind(this), { passive: false, capture: true });
    }
    
    onMouseDown(event) {
        if (this.isXRSessionActive) return; // Skip if in XR

        // Update mouse position
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        
        // Cast ray from mouse position
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.draggableObjects, true);
        
        if (intersects.length > 0) {
            // Find the top-level draggable parent of the intersected object
            let object = intersects[0].object;
            let topLevelDraggable = null;
            
            // Traverse up the parent hierarchy
            while (object) {
                // If this object is in our draggable list, it's a potential candidate
                if (this.draggableObjects.includes(object)) {
                    topLevelDraggable = object;
                }
                // Stop at scene level
                if (object === this.scene) break;
                object = object.parent;
            }
            
            if (topLevelDraggable) {
                // Explicitly disable OrbitControls by removing its event handlers
                this.disableOrbitControls();
                
                this.isDragging = true;
                this.selectedObject = topLevelDraggable;
                
                // Completely stop event propagation
                event.stopPropagation();
                event.preventDefault();
                
                // Store initial mouse position for calculating drag delta
                this.lastMousePosition.x = event.clientX;
                this.lastMousePosition.y = event.clientY;
                this.lastDragPoint = null; // Reset drag point reference
                
                console.log("Selected for drag:", this.selectedObject.name);
                return false; // Prevent default
            }
        }
    }
    
    onMouseMove(event) {
        // Update mouse position
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        
        if (this.isDragging && this.selectedObject) {
            // Explicitly stop event propagation to prevent orbit controls
            event.stopPropagation();
            event.preventDefault();
            
            this.handleDrag(event.clientX, event.clientY);
            return false;
        }
    }
    
    onMouseUp(event) {
        if (this.isDragging) {
            // Re-enable orbit controls
            this.enableOrbitControls();
            
            this.isDragging = false;
            this.selectedObject = null;
            this.lastDragPoint = null;
            
            // Stop propagation just in case
            event.stopPropagation();
            event.preventDefault();
            return false;
        }
    }
    
    onTouchStart(event) {
        if (this.isXRSessionActive) return; // Skip if in XR
        if (event.touches.length !== 1) return; // Only handle single touches
        
        const touch = event.touches[0];
        
        // Update mouse position for raycasting
        this.mouse.x = (touch.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(touch.clientY / window.innerHeight) * 2 + 1;
        
        // Cast ray
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.draggableObjects, true);
        
        if (intersects.length > 0) {
            // Find the top-level draggable parent
            let object = intersects[0].object;
            let topLevelDraggable = null;
            
            while (object) {
                if (this.draggableObjects.includes(object)) {
                    topLevelDraggable = object;
                }
                if (object === this.scene) break;
                object = object.parent;
            }
            
            if (topLevelDraggable) {
                // Explicitly disable OrbitControls
                this.disableOrbitControls();
                
                this.isDragging = true;
                this.selectedObject = topLevelDraggable;
                
                // Stop event propagation
                event.stopPropagation();
                event.preventDefault();
                
                // Store initial touch position
                this.lastMousePosition.x = touch.clientX;
                this.lastMousePosition.y = touch.clientY;
                this.lastDragPoint = null;
                
                console.log("Selected for drag (touch):", this.selectedObject.name);
                return false;
            }
        }
    }
    
    onTouchMove(event) {
        if (!this.isDragging || !this.selectedObject) return;
        if (event.touches.length !== 1) return;
        
        const touch = event.touches[0];
        
        // Update mouse position
        this.mouse.x = (touch.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(touch.clientY / window.innerHeight) * 2 + 1;
        
        // Stop event propagation
        event.stopPropagation();
        event.preventDefault();
        
        this.handleDrag(touch.clientX, touch.clientY);
        return false;
    }
    
    onTouchEnd(event) {
        if (this.isDragging) {
            // Re-enable orbit controls
            this.enableOrbitControls();
            
            this.isDragging = false;
            this.selectedObject = null;
            this.lastDragPoint = null;
            
            // Stop propagation
            event.stopPropagation();
            event.preventDefault();
            return false;
        }
    }
    
    disableOrbitControls() {
        // Completely disable our orbit controls instance
        if (this.orbitControls) {
            this.orbitControls.enabled = false;
            // Also disable specific features
            this.orbitControls.enableRotate = false;
            this.orbitControls.enablePan = false;
            this.orbitControls.enableZoom = false;
        }
        
        // Also disable the app's orbit controls if available
        if (window.app && window.app.orbitControls) {
            const controls = window.app.orbitControls;
            controls.enabled = false;
            controls.enableRotate = false;
            controls.enablePan = false;
            controls.enableZoom = false;
        }
    }
    
    enableOrbitControls() {
        // Re-enable our orbit controls
        if (this.orbitControls) {
            this.orbitControls.enabled = true;
            this.orbitControls.enableRotate = true;
            this.orbitControls.enablePan = true;
            this.orbitControls.enableZoom = true;
        }
        
        // Also re-enable the app's orbit controls
        if (window.app && window.app.orbitControls) {
            const controls = window.app.orbitControls;
            controls.enabled = true;
            controls.enableRotate = true;
            controls.enablePan = true;
            controls.enableZoom = true;
        }
    }
    
    handleDrag(clientX, clientY) {
        if (!this.selectedObject) return;
        
        // Calculate how far the mouse/touch has moved
        const deltaX = clientX - this.lastMousePosition.x;
        const deltaY = clientY - this.lastMousePosition.y;
        
        // Update last position
        this.lastMousePosition.x = clientX;
        this.lastMousePosition.y = clientY;
        
        // Create a raycaster
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        // Create a plane parallel to the camera
        const planeNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(this.camera.quaternion);
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
            planeNormal,
            this.selectedObject.position
        );
        
        // Calculate intersection
        const intersectionPoint = new THREE.Vector3();
        const rayIntersectsPlane = this.raycaster.ray.intersectPlane(plane, intersectionPoint);
        
        if (rayIntersectsPlane) {
            if (!this.lastDragPoint) {
                // First intersection - just store the point
                this.lastDragPoint = intersectionPoint.clone();
            } else {
                // Calculate delta movement
                const dragDelta = new THREE.Vector3().subVectors(intersectionPoint, this.lastDragPoint);
                this.selectedObject.position.add(dragDelta);
                
                // Preserve original scale
                if (this.selectedObject.userData.originalScale) {
                    this.selectedObject.scale.copy(this.selectedObject.userData.originalScale);
                }
                
                // Emit model transform event if we're host
                if (window.app && window.app.isHost && window.app.socket) {
                    window.app.socket.emit('model-transform', {
                        customId: this.selectedObject.name,
                        position: this.selectedObject.position.toArray(),
                        rotation: this.selectedObject.rotation.toArray(),
                        scale: this.selectedObject.scale.toArray()
                    });
                }
                
                // Update last drag point
                this.lastDragPoint.copy(intersectionPoint);
            }
        }
    }

    setupXRControllers() {
        if (!this.renderer) return;
        
        console.log("Setting up XR controllers");
        
        // Create visible controller rays.
        const rayGeometry = new THREE.BufferGeometry();
        rayGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, -10], 3));
        
        const rayMaterial = new THREE.LineBasicMaterial({
            color: 0xff0000,
            // Note: linewidth isn't widely supported.
        });
        
        const controllerModelFactory = new XRControllerModelFactory();
        
        // Controller 1 (right hand)
        this.controller1 = this.renderer.xr.getController(0);
        this.controller1.name = "controller-right";
        this.scene.add(this.controller1);
        const controllerRay1 = new THREE.Line(rayGeometry, rayMaterial);
        controllerRay1.name = "controller-ray";
        this.controller1.add(controllerRay1);
        this.controllerGrip1 = this.renderer.xr.getControllerGrip(0);
        this.controllerGrip1.add(controllerModelFactory.createControllerModel(this.controllerGrip1));
        this.scene.add(this.controllerGrip1);
        
        // Controller 2 (left hand)
        this.controller2 = this.renderer.xr.getController(1);
        this.controller2.name = "controller-left";
        this.scene.add(this.controller2);
        const controllerRay2 = new THREE.Line(rayGeometry, rayMaterial);
        controllerRay2.name = "controller-ray";
        this.controller2.add(controllerRay2);
        this.controllerGrip2 = this.renderer.xr.getControllerGrip(1);
        this.controllerGrip2.add(controllerModelFactory.createControllerModel(this.controllerGrip2));
        this.scene.add(this.controllerGrip2);
        
        // Set up controller event listeners for selection.
        this.controller1.addEventListener('selectstart', this.onControllerSelectStart.bind(this));
        this.controller1.addEventListener('selectend', this.onControllerSelectEnd.bind(this));
        this.controller2.addEventListener('selectstart', this.onControllerSelectStart.bind(this));
        this.controller2.addEventListener('selectend', this.onControllerSelectEnd.bind(this));
        
        // Set up squeeze event listeners for rotation.
        this.controller1.addEventListener('squeezestart', this.onControllerSqueezeStart.bind(this));
        this.controller1.addEventListener('squeezeend', this.onControllerSqueezeEnd.bind(this));
        this.controller2.addEventListener('squeezestart', this.onControllerSqueezeStart.bind(this));
        this.controller2.addEventListener('squeezeend', this.onControllerSqueezeEnd.bind(this));

        console.log("XR controllers initialized");
    }
    
    onControllerSelectStart(event) {
        const controller = event.target;
        console.log("Controller select start");
        
        // Configure the raycaster based on the controller's current orientation.
        const tempMatrix = new THREE.Matrix4();
        tempMatrix.identity().extractRotation(controller.matrixWorld);
        
        this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
        
        // First get potential intersections with all objects
        const allIntersects = [];
        this.raycaster.intersectObjects(this.scene.children, true, allIntersects);
        
        if (allIntersects.length > 0) {
            // Find the top-level draggable parent of the intersected object
            let object = allIntersects[0].object;
            let topLevelDraggable = null;
            
            // Traverse up the parent hierarchy
            while (object) {
                // If this object is in our draggable list, it's a potential candidate
                if (this.draggableObjects.includes(object)) {
                    topLevelDraggable = object;
                }
                // Stop at scene level
                if (object === this.scene) break;
                object = object.parent;
            }
            
            if (topLevelDraggable) {
                console.log("Selected object:", topLevelDraggable.name || topLevelDraggable.uuid);
                this.selectedObject = topLevelDraggable;
                this.activeController = controller;
                this.lastControllerPosition.setFromMatrixPosition(controller.matrixWorld);
            }
        }
    }
    
    onControllerSelectEnd() {
        console.log("Controller select end");
        this.selectedObject = null;
        this.activeController = null;
        this.rotationMode = false; // End any active rotation.
    }

    // Rotation event handlers.
    onControllerSqueezeStart(event) {
        const controller = event.target;
        console.log("Squeeze start");
        // Only enable rotation mode if an object is already selected.
        if (this.selectedObject) {
            this.rotationMode = true;
            // Save the starting orientations.
            this.startControllerQuaternion.copy(controller.quaternion);
            this.startObjectQuaternion.copy(this.selectedObject.quaternion);
        }
    }

    onControllerSqueezeEnd(event) {
        console.log("Squeeze end");
        this.rotationMode = false;
    }

    // Method to get currently draggable objects
    getDraggableObjects() {
        return [...this.draggableObjects];
    }

    // Method to set which objects are draggable
    setDraggableObjects(objects) {
        this.draggableObjects = objects;
    }

    update() {
        if (this.selectedObject && this.activeController && this.isXRSessionActive) {
            if (this.rotationMode) {
                // Update object's rotation based on the change in controller's orientation.
                const currentControllerQuaternion = this.activeController.quaternion;
                const deltaQuaternion = currentControllerQuaternion.clone();
                deltaQuaternion.multiply(this.startControllerQuaternion.clone().invert());
                const newObjectQuaternion = deltaQuaternion.multiply(this.startObjectQuaternion);
                this.selectedObject.quaternion.copy(newObjectQuaternion);
            } else {
                // Update position by computing difference between current and last controller positions.
                const currentPosition = new THREE.Vector3();
                currentPosition.setFromMatrixPosition(this.activeController.matrixWorld);
                let delta = new THREE.Vector3().subVectors(currentPosition, this.lastControllerPosition);
                
                // Optionally increase sensitivity on mobile devices.
                if (navigator.userAgent.match(/Mobi/)) {
                    delta.multiplyScalar(2.0);
                }
                
                this.selectedObject.position.add(delta);
                this.lastControllerPosition.copy(currentPosition);
            }
        }
        
        // Ensure orbit controls are updated when not in XR session.
        if (this.orbitControls && !this.isXRSessionActive) {
            this.orbitControls.update();
        }
    }
    
    onXRSessionStart() {
        this.isXRSessionActive = true;
        console.log("XR session started from interaction manager");
    }
    
    onXRSessionEnd() {
        this.isXRSessionActive = false;
        console.log("XR session ended from interaction manager");
    }
}