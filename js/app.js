import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { InteractionManager } from './InteractionManager.js';
import { setupUIControls } from './uiControls.js';
import { showConfirmationModal } from './modalManager.js';

class App {
  constructor() {
    // ----- Shared Variables -----
    this.loadedModels = new Map();
    this.draggableObjects = [];
    this.isARMode = false;
    this.isPlacingProduct = false;
    // For host pointer updates
    this.pointerNDC = new THREE.Vector2(0, 0);
    this.pointerActive = true;
    this.isDragging = false;
    // For handling two-finger pan/rotation gesture
    this.lastTouchAngle = null;
    
    // Variables for AR tap‑to‑place integration
    this.placementReticle = null;
    this.placementMessage = null;
    this.placeAgainButton = null;
    this.hitTestSource = null;
    
    // Touch rotation variables
    this.touchStartX = null;
    this.touchStartY = null;
    this.initialRotationY = 0;
    this.isSingleTouchRotating = false;
    this.arRotationControls = null;
    
    // Ensure FontAwesome is loaded
    this.ensureFontAwesomeLoaded();
    
    // Create overlays: loading overlay (for product/model loading) and upload overlay
    this.createLoadingOverlay();

    // Set up THREE.LoadingManager (progress updates are no longer displayed).
    this.loadingManager = new THREE.LoadingManager(() => {});
    this.loadingManager.onProgress = (url, loaded, total) => {};
    
    this.gltfLoader = new GLTFLoader(this.loadingManager);
    this.rgbeLoader = new RGBELoader(this.loadingManager);

    this.init();
    this.setupScene();
    this.setupLights();
    this.setupInitialControls();

    // Set up UI toggles
    setupUIControls(this);

    // --- File Upload Handling ---
    // The file input is created in uiControls.js.
    const fileInput = document.querySelector('input[type="file"][accept=".glb,.gltf"]');
    if (fileInput) {
      fileInput.onchange = async (event) => {
        // Show the loading overlay at the start of upload.
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) loadingOverlay.style.display = 'flex';
  
        const files = event.target.files;
        if (!files || files.length === 0) {
          if (loadingOverlay) loadingOverlay.style.display = 'none';
          return;
        }
  
        this.clearExistingModels();
  
        for (let file of files) {
          // For front-end only version, we'll use URL.createObjectURL instead of server upload
          try {
            const modelUrl = URL.createObjectURL(file);
            const name = file.name.replace('.glb', '').replace('.gltf', '');
            await this.loadModel(modelUrl, name);
          } catch (error) {
            console.error("File loading error:", error);
          }
        }
        if (loadingOverlay) loadingOverlay.style.display = 'none';
      };
    }

    // Create an InteractionManager instance.
    this.interactionManager = new InteractionManager(
      this.scene,
      this.camera,
      this.renderer,
      this.renderer.domElement
    );

    // Make app globally accessible for interactionManager
    window.app = this;

    // Listen for pointer movement
    window.addEventListener('pointermove', this.handlePointerMove.bind(this));
    
    // Add touch event listeners for model rotation
    document.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false });
    document.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });
    document.addEventListener('touchend', this.onTouchEnd.bind(this), { passive: false });

    // AR session start listener for tap‑to‑place integration
    this.renderer.xr.addEventListener('sessionstart', this.onARSessionStart.bind(this));
    
    // AR session end listener
    this.renderer.xr.addEventListener('sessionend', () => {
      console.log("AR session ended");
      this.isARMode = false;
      this.scene.background = new THREE.Color(0xc0c0c1);
      this.renderer.setClearColor(0xc0c0c1, 1);
      
      // Hide rotation buttons if they exist
      if (this.rotateLeftBtn) this.rotateLeftBtn.style.display = 'none';
      if (this.rotateRightBtn) this.rotateRightBtn.style.display = 'none';
    });
  
    // Instead of directly loading the default product, show the landing overlay.
    this.showLandingOverlay();

    this.animate();
  }

  // Ensure FontAwesome is loaded
  ensureFontAwesomeLoaded() {
    if (!document.querySelector('link[href*="font-awesome"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
      document.head.appendChild(link);
    }
  }

  // -----------------------------------------------------------------------------
  // AR Rotation Controls
  // -----------------------------------------------------------------------------
  createARRotationControls() {
    // Create left rotation button
    this.rotateLeftBtn = document.createElement('button');
    this.rotateLeftBtn.innerHTML = '<i class="fa-solid fa-rotate-left"></i>';
    this.rotateLeftBtn.style.position = 'absolute';
    this.rotateLeftBtn.style.bottom = '80px';
    this.rotateLeftBtn.style.right = 'calc(50% + 60px)'; // Position to the left of Place Again
    this.rotateLeftBtn.style.padding = '8px 16px';
    this.rotateLeftBtn.style.border = 'none';
    this.rotateLeftBtn.style.borderRadius = '4px';
    this.rotateLeftBtn.style.background = '#fff';
    this.rotateLeftBtn.style.color = '#000';
    this.rotateLeftBtn.style.fontSize = '13px';
    this.rotateLeftBtn.style.cursor = 'pointer';
    this.rotateLeftBtn.style.zIndex = '10000';
    this.rotateLeftBtn.style.display = 'none';
    this.rotateLeftBtn.onclick = () => this.rotateModel('y', -0.2);
    document.body.appendChild(this.rotateLeftBtn);
    
    // Create right rotation button
    this.rotateRightBtn = document.createElement('button');
    this.rotateRightBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i>';
    this.rotateRightBtn.style.position = 'absolute';
    this.rotateRightBtn.style.bottom = '80px';
    this.rotateRightBtn.style.left = 'calc(50% + 60px)'; // Position to the right of Place Again
    this.rotateRightBtn.style.padding = '8px 16px';
    this.rotateRightBtn.style.border = 'none';
    this.rotateRightBtn.style.borderRadius = '4px';
    this.rotateRightBtn.style.background = '#fff';
    this.rotateRightBtn.style.color = '#000';
    this.rotateRightBtn.style.fontSize = '13px';
    this.rotateRightBtn.style.cursor = 'pointer';
    this.rotateRightBtn.style.zIndex = '10000';
    this.rotateRightBtn.style.display = 'none';
    this.rotateRightBtn.onclick = () => this.rotateModel('y', 0.2);
    document.body.appendChild(this.rotateRightBtn);
  }

  // Method to handle rotation
  rotateModel(axis, angle) {
    if (!this.productGroup) return;
    
    switch(axis.toLowerCase()) {
        case 'y':
            this.productGroup.rotation.y += angle;
            break;
    }
  }

  // -----------------------------------------------------------------------------
  // Landing Overlay – Demo / Upload / Browse Options
  // -----------------------------------------------------------------------------
  showLandingOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'landing-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = '#cccccc';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '10000';

    const box = document.createElement('div');
    box.style.backgroundColor = 'white';
    box.style.padding = '30px';
    box.style.borderRadius = '8px';
    // box.style.textAlign = 'center';
    box.style.width = '300px';
    box.lineHeight = '24px'

    const title = document.createElement('h1');
    title.style.margin = '0 0 10px';
    title.innerHTML = '<h5>3D Model Viewer</h5> <p style="font-size: 16px; font-weight: normal;">Beta</p>';

    const description = document.createElement('p');
    description.style.fontSize = '14px';
    description.style.color = '#333';
    description.style.marginBottom = '20px';
    description.innerHTML = `
      <h3 style="margin:7px 0px">Explore 3D Models with Ease</h3>
          <p> Click the "Browse" button to explore our demo models.</p>
          <p> Click the "Open" button to load your GLB files.</p>

      <h3 style="margin:7px 0px">Interactive Features:</h3>
          <p>Drag components to reposition them as you wish.</p>
          <p>Drag the screen to rotate around the model.</p>
          <p>Click the "Color" button to modify any recognized materials.</p>
          <p>Click the "Reset" button to reset view and return all parts to their original positions.</p>

      <h3 style="margin:7px 0px">Augmented Reality:</h3>
      <p>If your device supports AR, simply click the "AR" button to view your model at real scale.</p>

      <h3 style="margin:7px 0px">Enhancing Product Development in the Virtual World.</h3>
    `
    const buttonsContainer = document.createElement('div');
    buttonsContainer.style.display = 'flex';
    buttonsContainer.style.justifyContent = 'space-around';

    const demoButton = document.createElement('button');
    demoButton.textContent = 'Browse';
    demoButton.style.backgroundColor = '#d00024';
    demoButton.style.color = 'white';
    demoButton.style.border = 'none';
    demoButton.style.borderRadius = '9999px';
    demoButton.style.padding = '10px 20px';
    demoButton.style.cursor = 'pointer';
    demoButton.style.width = '100px'
    demoButton.addEventListener('click', () => {
      document.body.removeChild(overlay);
      this.showBrowseInterface();
    });

    const uploadButton = document.createElement('button');
    uploadButton.textContent = 'Open';
    uploadButton.style.backgroundColor = '#999999';
    uploadButton.style.color = 'white';
    uploadButton.style.border = 'none';
    uploadButton.style.borderRadius = '9999px';
    uploadButton.style.padding = '10px 20px';
    uploadButton.style.cursor = 'pointer';
    uploadButton.style.width = '100px'
    uploadButton.addEventListener('click', () => {
      document.body.removeChild(overlay);
      const fileInput = document.querySelector('input[type="file"][accept=".glb,.gltf"]');
      if (fileInput) {
        fileInput.click();
      }
    });

    buttonsContainer.appendChild(demoButton);
    buttonsContainer.appendChild(uploadButton);
    box.appendChild(title);
    box.appendChild(description);
    box.appendChild(buttonsContainer);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  // ...(truncated 24272 characters)...       const tempIntersects = [];
                    
                    // Perform direct intersection test with actual meshes inside this container
                    this.children.forEach(child => {
                        child.traverse(object => {
                            if (object.isMesh) {
                                // Store original visibility of matrix auto update
                                const originalMatrixAutoUpdate = object.matrixAutoUpdate;
                                // Temporarily enable matrix auto update to ensure correct world matrix
                                object.matrixAutoUpdate = true;
                                object.updateMatrixWorld(true);
                                
                                // Use the mesh's own raycast method
                                object.raycast(raycaster, tempIntersects);
                                
                                // Restore original setting
                                object.matrixAutoUpdate = originalMatrixAutoUpdate;
                            }
                        });
                    });
                    
                    if (tempIntersects.length > 0) {
                        // If any mesh was hit, add the container as the intersected object
                        // but use the actual intersection point
                        intersects.push({
                            distance: tempIntersects[0].distance,
                            point: tempIntersects[0].point.clone(),
                            object: this  // Return this container as the hit object
                        });
                    }
                };

                this.draggableObjects.push(container);
                this.productGroup.add(container);
                this.loadedModels.set(name, container);
                
                // Only update InteractionManager
                if (this.interactionManager) {
                    this.interactionManager.setDraggableObjects(Array.from(this.loadedModels.values()));
                }
                
                this.fitCameraToScene();
                console.log(`Loaded model: ${name}`);
                resolve(container);
            },
            xhr => {},
            error => {
                console.error(`Error loading model ${name}:`, error);
                reject(error);
            }
        );
    });
  }

  onARSessionStart() {
    console.log("AR session started - entering tap-to-place mode");
    this.isARMode = true;
    this.isPlacingProduct = true;
    
    // Hide the productGroup until placement occurs
    if (this.productGroup) {
      this.productGroup.visible = false;
    }

    // Update the scene background to show the camera feed by setting it to null
    this.scene.background = null;

    // Update floor for AR mode
    if (this.floor) {
        // Remove the old floor
        this.scene.remove(this.floor);
        
        // Create a new floor with shadow material
        const floorGeometry = new THREE.PlaneGeometry(20, 20);
        const shadowMaterial = new THREE.ShadowMaterial({
            opacity: 0.07 // Subtle shadows only
        });
        
        this.floor = new THREE.Mesh(floorGeometry, shadowMaterial);
        this.floor.receiveShadow = true;
        this.floor.rotation.x = -Math.PI / 2;
        this.floor.visible = false; // Hide until placement
        this.scene.add(this.floor);
    }
    
    // Prepare the placement UI elements
    if (!this.placementReticle) {
      this.createPlacementUI();
      this.placementMessage.style.display = 'block';
    } else {
      this.placementMessage.style.display = 'block';
      this.placeAgainButton.style.display = 'none';
    }
    
    // Ensure rotation buttons are created
    if (!this.rotateLeftBtn || !this.rotateRightBtn) {
      this.createARRotationControls();
    }
    
    // Hide rotation buttons until model is placed
    if (this.rotateLeftBtn) this.rotateLeftBtn.style.display = 'none';
    if (this.rotateRightBtn) this.rotateRightBtn.style.display = 'none';
    
    // Optionally hide the AR button UI element
    const arButton = document.querySelector('.ar-button');
    if (arButton) {
      arButton.style.display = 'none';
    }
    
    // Get the current XR session
    const session = this.renderer.xr.getSession();
    
    if (session) {
      // Request the reference space using "local-floor" for consistent hit testing.
      session.requestReferenceSpace('local-floor')
        .catch((err) => {
          console.warn("local-floor reference space unavailable, falling back to viewer:", err);
          return session.requestReferenceSpace('viewer');
        })
        .then((referenceSpace) => {
          return session.requestHitTestSource({ space: referenceSpace });
        })
        .then((source) => {
          this.hitTestSource = source;
        })
        .catch((err) => {
          console.error("Failed to obtain hit test source:", err);
        });
    
      // Bind select events for tap-to-place functionality.
      this.onSelectEventBound = this.onSelectEvent.bind(this);
      session.addEventListener('select', this.onSelectEventBound);
      session.addEventListener('end', () => {
        this.hitTestSource = null;
      });
    }
  }

  createPlacementUI() {
    this.placementReticle = new THREE.Group();
    this.placementReticle.scale.set(0.3, 0.3, 0.3);
  
    const ringGeometry = new THREE.RingGeometry(0.15, 0.2, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide });
    const reticleRing = new THREE.Mesh(ringGeometry, ringMaterial);
    reticleRing.rotation.x = -Math.PI / 2;
    this.placementReticle.add(reticleRing);
  
    const dotGeometry = new THREE.CircleGeometry(0.05, 32);
    const dotMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide });
    const reticleDot = new THREE.Mesh(dotGeometry, dotMaterial);
    reticleDot.rotation.x = -Math.PI / 2;
    this.placementReticle.add(reticleDot);
  
    this.placementReticle.visible = false;
    this.scene.add(this.placementReticle);
  
    this.placementMessage = document.createElement('div');
    this.placementMessage.style.position = 'absolute';
    this.placementMessage.style.bottom = '100px';
    this.placementMessage.style.left = '50%';
    this.placementMessage.style.transform = 'translateX(-50%)';
    this.placementMessage.style.fontSize = '20px';
    this.placementMessage.style.color = 'white';
    this.placementMessage.style.zIndex = '10000';
    this.placementMessage.innerText = 'Please tap to place';
    this.placementMessage.style.display = 'none';
    document.body.appendChild(this.placementMessage);
  
    this.placeAgainButton = document.createElement('button');
    this.placeAgainButton.textContent = 'Place Again';
    this.placeAgainButton.style.position = 'absolute';
    this.placeAgainButton.style.bottom = '80px';
    this.placeAgainButton.style.left = '50%';
    this.placeAgainButton.style.transform = 'translateX(-50%)';
    this.placeAgainButton.style.padding = '8px 16px';
    this.placeAgainButton.style.border = 'none';
    this.placeAgainButton.style.borderRadius = '4px';
    this.placeAgainButton.style.background = '#fff';
    this.placeAgainButton.style.color = '#000';
    this.placeAgainButton.style.fontSize = '13px';
    this.placeAgainButton.style.cursor = 'pointer';
    this.placeAgainButton.style.zIndex = '10000';
    this.placeAgainButton.style.display = 'none';
    document.body.appendChild(this.placeAgainButton);
  
    this.placeAgainButton.addEventListener('click', () => {
      if (this.productGroup) {
        this.productGroup.visible = false;
      }
      this.isPlacingProduct = true;
      this.placementMessage.style.display = 'block';
      this.placeAgainButton.style.display = 'none';
      
      // Hide rotation buttons
      if (this.rotateLeftBtn) this.rotateLeftBtn.style.display = 'none';
      if (this.rotateRightBtn) this.rotateRightBtn.style.display = 'none';
      
      const session = this.renderer.xr.getSession();
      if (session) {
        this.onSelectEventBound = this.onSelectEvent.bind(this);
        session.addEventListener('select', this.onSelectEventBound);
      }
    });
  }

  onSelectEvent(event) {
    if (this.isPlacingProduct && this.hitTestSource) {
      const frame = event.frame;
      const referenceSpace = this.renderer.xr.getReferenceSpace();
      const hitTestResults = frame.getHitTestResults(this.hitTestSource);
      if (hitTestResults.length > 0) {
        const hit = hitTestResults[0];
        const pose = hit.getPose(referenceSpace);
  
        const bbox = new THREE.Box3().setFromObject(this.productGroup);
        const offsetY = bbox.min.y;
  
        this.productGroup.visible = true;
        this.productGroup.position.set(
          pose.transform.position.x,
          pose.transform.position.y - offsetY,
          pose.transform.position.z
        );

        // Position the floor at the hit point
        if (this.floor) {
          this.floor.position.set(
              pose.transform.position.x,
              pose.transform.position.y,
              pose.transform.position.z
          );
          this.floor.visible = true;
        }
        console.log("Product placed at:", pose.transform.position, "with vertical offset:", offsetY);
  
        this.isPlacingProduct = false;
        this.placementMessage.style.display = 'none';
        if (this.placementReticle) {
          this.placementReticle.visible = false;
        }
        this.placeAgainButton.style.display = 'block';
        
        // Show rotation buttons
        if (this.rotateLeftBtn) this.rotateLeftBtn.style.display = 'block';
        if (this.rotateRightBtn) this.rotateRightBtn.style.display = 'block';
        
        const session = this.renderer.xr.getSession();
        session.removeEventListener('select', this.onSelectEventBound);
      }
    }
  }

  animate() {
    this.renderer.setAnimationLoop((time, frame) => {
      // AR Tap-to-Place Reticle Update
      if (this.isARMode && this.isPlacingProduct && this.hitTestSource && frame) {
        const referenceSpace = this.renderer.xr.getReferenceSpace();
        const hitTestResults = frame.getHitTestResults(this.hitTestSource);
        if (hitTestResults.length > 0) {
          const hit = hitTestResults[0];
          const pose = hit.getPose(referenceSpace);
          if (this.placementReticle) {
            this.placementReticle.visible = true;
            this.placementReticle.position.set(
              pose.transform.position.x,
              pose.transform.position.y,
              pose.transform.position.z
            );
          }
        } else {
          if (this.placementReticle) {
            this.placementReticle.visible = false;
          }
        }
      }

      if (!this.isDragging) {
        this.orbitControls.update();
      }
      if (this.interactionManager) {
        this.interactionManager.update();
      }
      this.renderer.render(this.scene, this.camera);
    });
  }
}

// Create and export the app
const app = new App();
export default app;
