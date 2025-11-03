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
    
    // Color mode
    this.colorMode = false;
    this.selectedMaterial = null;
    this.selectedMaterialName = '';

    // Ensure FontAwesome is loaded
    this.ensureFontAwesomeLoaded();
    
    // Create overlays: loading overlay (for product/model loading) and upload overlay
    this.createLoadingOverlay();

    // Set up THREE.LoadingManager (progress updates are no longer displayed).
    this.loadingManager = new THREE.LoadingManager(() => {});
    this.loadingManager.onStart = () => {
      const progressBar = document.getElementById('progress-bar');
      if (progressBar) progressBar.style.width = '0%';
    };
    this.loadingManager.onProgress = (url, loaded, total) => {
      const progress = (loaded / total) * 100;
      const progressBar = document.getElementById('progress-bar');
      if (progressBar) progressBar.style.width = `${progress}%`;
    };
    this.loadingManager.onLoad = () => {
      const loadingOverlay = document.getElementById('loading-overlay');
      if (loadingOverlay) loadingOverlay.style.display = 'none';
    };
    
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
    this.renderer.xr.addEventListener('sessionstart', this.onXRSessionStart.bind(this));
    
    // AR session end listener
    this.renderer.xr.addEventListener('sessionend', () => {
      console.log("XR session ended");
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

  createLoadingOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'loading-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
    overlay.style.display = 'none';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '10000';
    overlay.style.flexDirection = 'column';

    const message = document.createElement('p');
    message.textContent = 'Loading...';
    message.style.color = 'white';
    message.style.marginBottom = '10px';

    const progressBarContainer = document.createElement('div');
    progressBarContainer.style.width = '200px';
    progressBarContainer.style.height = '20px';
    progressBarContainer.style.background = '#ddd';
    progressBarContainer.style.borderRadius = '10px';
    progressBarContainer.style.overflow = 'hidden';

    const progressBar = document.createElement('div');
    progressBar.id = 'progress-bar';
    progressBar.style.height = '100%';
    progressBar.style.background = '#d00024';
    progressBar.style.width = '0%';
    progressBar.style.transition = 'width 0.3s ease';

    progressBarContainer.appendChild(progressBar);
    overlay.appendChild(message);
    overlay.appendChild(progressBarContainer);
    document.body.appendChild(overlay);
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

  handleColorSelect(mesh) {
    this.selectedMaterial = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const matName = this.selectedMaterial.name || this.selectedMaterial.uuid;
    const modelName = mesh.parent.name || 'Model';
    this.selectedMaterialName = `${matName.charAt(0).toUpperCase() + matName.slice(1)} - ${modelName}`;

    if (!this.selectedMaterial.userData.originalColor) {
      this.selectedMaterial.userData.originalColor = '#' + this.selectedMaterial.color.getHexString();
    }

    this.showColorPickerModal();
  }

  showColorPickerModal() {
    if (!this.selectedMaterial) return;

    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '10000';

    const modal = document.createElement('div');
    modal.style.backgroundColor = 'white';
    modal.style.padding = '20px';
    modal.style.borderRadius = '8px';
    modal.style.width = '300px';

    const heading = document.createElement('h3');
    heading.textContent = `Color for ${this.selectedMaterialName}`;
    heading.style.marginTop = '0';

    // Color picker section
    const colorPickerWrapper = document.createElement('div');

    // Input for the color picker
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.style.padding = 'revert';
    colorInput.value = '#' + this.selectedMaterial.color.getHexString();
    colorInput.style.marginBottom = '15px';

    // Recent colors section
    const recentColorsHeading = document.createElement('h4');
    recentColorsHeading.textContent = 'Colors';
    recentColorsHeading.style.marginBottom = '10px';

    const recentColorsDiv = document.createElement('div');
    recentColorsDiv.style.display = 'flex';
    recentColorsDiv.style.flexWrap = 'wrap';
    recentColorsDiv.style.gap = '8px';
    recentColorsDiv.style.marginBottom = '15px';

    // Function to build the recent colors UI
    function updateRecentColorsUI(originalColor) {
      recentColorsDiv.innerHTML = '';
      
      // Add original color first
      if (originalColor) {
        const originalColorWrapper = document.createElement('div');
        originalColorWrapper.style.display = 'flex';
        originalColorWrapper.style.flexDirection = 'column';
        originalColorWrapper.style.alignItems = 'center';
        
        const originalColorBtn = document.createElement('button');
        originalColorBtn.style.width = '30px';
        originalColorBtn.style.height = '30px';
        originalColorBtn.style.backgroundColor = originalColor;
        originalColorBtn.style.border = '1px solid #ccc';
        originalColorBtn.style.borderRadius = '4px';
        originalColorBtn.style.cursor = 'pointer';
        
        const label = document.createElement('span');
        label.textContent = 'Original';
        label.style.fontSize = '10px';
        label.style.marginTop = '2px';
        
        originalColorBtn.addEventListener('click', () => {
          colorInput.value = originalColor;
          applyColor(originalColor);
        });
        
        originalColorWrapper.appendChild(originalColorBtn);
        originalColorWrapper.appendChild(label);
        recentColorsDiv.appendChild(originalColorWrapper);
      }
      
      // Then add recent colors
      const recentColors = getRecentColors();
      recentColors.forEach(color => {
        const colorBtn = document.createElement('button');
        colorBtn.style.width = '30px';
        colorBtn.style.height = '30px';
        colorBtn.style.backgroundColor = color;
        colorBtn.style.border = '1px solid #ccc';
        colorBtn.style.borderRadius = '4px';
        colorBtn.style.cursor = 'pointer';
        
        colorBtn.addEventListener('click', () => {
          colorInput.value = color;
          applyColor(color);
        });
        
        recentColorsDiv.appendChild(colorBtn);
      });
    }

    const originalColor = this.selectedMaterial.userData.originalColor;
    updateRecentColorsUI(originalColor);

    // Buttons container
    const buttonsDiv = document.createElement('div');
    buttonsDiv.style.display = 'flex';
    buttonsDiv.style.justifyContent = 'space-between';

    // Done button
    const doneBtn = document.createElement('button');
    doneBtn.textContent = 'Done';
    doneBtn.style.backgroundColor = '#d00024';
    doneBtn.style.color = 'white';
    doneBtn.style.border = 'none';
    doneBtn.style.borderRadius = '9999px';
    doneBtn.style.padding = '8px 24px';
    doneBtn.style.cursor = 'pointer';

    doneBtn.addEventListener('click', () => {
      const colorValue = colorInput.value;
      addRecentColor(colorValue);
      document.body.removeChild(overlay);
    });

    // Cancel button
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.backgroundColor = '#999';
    cancelBtn.style.color = 'white';
    cancelBtn.style.border = 'none';
    cancelBtn.style.borderRadius = '9999px';
    cancelBtn.style.padding = '8px 24px';
    cancelBtn.style.cursor = 'pointer';
    cancelBtn.style.marginRight = '15px';
    cancelBtn.addEventListener('click', () => {
      document.body.removeChild(overlay);
    });

    // Apply color function
    const applyColor = (colorValue) => {
      const color = new THREE.Color(colorValue);
      this.selectedMaterial.color.set(color);
    };

    // Live update
    colorInput.addEventListener('input', () => {
      applyColor(colorInput.value);
    });

    // Assemble the modal
    buttonsDiv.appendChild(cancelBtn);
    buttonsDiv.appendChild(doneBtn);

    colorPickerWrapper.appendChild(colorInput);

    modal.appendChild(heading);
    modal.appendChild(colorPickerWrapper);
    modal.appendChild(recentColorsHeading);
    modal.appendChild(recentColorsDiv);
    modal.appendChild(buttonsDiv);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  // Functions to manage recent colors
  getRecentColors() {
    try {
      const storedColors = localStorage.getItem('recentColors');
      return storedColors ? JSON.parse(storedColors) : [];
    } catch (e) {
      console.error('Error loading recent colors:', e);
      return [];
    }
  }

  addRecentColor(color) {
    try {
      let recentColors = this.getRecentColors();
      
      // Remove the color if it already exists
      recentColors = recentColors.filter(c => c !== color);
      
      // Add to the beginning
      recentColors.unshift(color);
      
      // Keep only the most recent 6
      recentColors = recentColors.slice(0, 6);
      
      localStorage.setItem('recentColors', JSON.stringify(recentColors));
    } catch (e) {
      console.error('Error saving recent colors:', e);
    }
  }

  init() {
    // Stub for init if needed
  }

  setupScene() {
    // Stub for scene setup
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera();
    this.renderer = new THREE.WebGLRenderer();
    // etc.
  }

  setupLights() {
    // Stub for lights
  }

  setupInitialControls() {
    // Stub for controls
  }

  clearExistingModels() {
    // Stub
  }

  loadModel(url, name) {
    return new Promise((resolve, reject) => {
      this.gltfLoader.load(
          url,
          (gltf) => {
              const container = new THREE.Group();
              container.name = name;
              container.add(gltf.scene);
              container.raycast = function(raycaster, intersects) {
                  const tempIntersects = [];
                  
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

  onXRSessionStart() {
    console.log("XR session started - entering XR mode");
    const session = this.renderer.xr.getSession();
    if (!session) return;

    let refSpaceType = 'local-floor';

    if (session.mode === 'immersive-ar') {
      this.isARMode = true;
      // AR specific setup
      this.scene.background = null;
      this.isPlacingProduct = true;
      this.productGroup.visible = false;
      if (this.placementMessage) this.placementMessage.style.display = 'block';
      if (this.placeAgainButton) this.placeAgainButton.style.display = 'none';

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
      }

      // Ensure rotation buttons are created
      if (!this.rotateLeftBtn || !this.rotateRightBtn) {
        this.createARRotationControls();
      }

      // Hide rotation buttons until model is placed
      if (this.rotateLeftBtn) this.rotateLeftBtn.style.display = 'none';
      if (this.rotateRightBtn) this.rotateRightBtn.style.display = 'none';

    } else if (session.mode === 'immersive-vr') {
      this.isARMode = false;
      // VR specific setup
      this.productGroup.position.set(0, 0, -2);
      this.productGroup.visible = true;
      if (this.floor) {
        this.floor.position.set(0, 0, 0);
        this.floor.visible = true;
      }
    }

    session.requestReferenceSpace(refSpaceType)
      .catch((err) => {
        console.warn("Preferred reference space unavailable, falling back to viewer:", err);
        return session.requestReferenceSpace('viewer');
      })
      .then((referenceSpace) => {
        if (this.isARMode) {
          return session.requestHitTestSource({ space: referenceSpace });
        }
      })
      .then((source) => {
        if (this.isARMode) {
          this.hitTestSource = source;
        }
      })
      .catch((err) => {
        console.error("Failed to obtain hit test source:", err);
      });

    if (this.isARMode) {
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
      if (this.renderer.xr.isPresenting && this.isARMode && this.isPlacingProduct && this.hitTestSource && frame) {
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
