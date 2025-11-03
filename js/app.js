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
    this.highlightHelper = null;
    this.selectedMesh = null;
    this.colorPanel = null;

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

    // XR session start listener for tap‑to‑place integration
    this.renderer.xr.addEventListener('sessionstart', this.onXRSessionStart.bind(this));
    
    // XR session end listener
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

  setupScene() {
    this.container = document.getElementById('scene-container');
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xc0c0c1);
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 1.6, 3);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.xr.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    this.productGroup = new THREE.Group();
    this.scene.add(this.productGroup);

    const floorGeometry = new THREE.PlaneGeometry(10, 10);
    const shadowMaterial = new THREE.ShadowMaterial({ opacity: 0.2 });
    this.floor = new THREE.Mesh(floorGeometry, shadowMaterial);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);

    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  setupLights() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 3));

    const directionalLight = new THREE.DirectionalLight(0xffffff, 3);
    directionalLight.position.set(0, 20, 0);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    this.scene.add(directionalLight);
  }

  setupInitialControls() {
    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.05;
    this.orbitControls.screenSpacePanning = false;
    this.orbitControls.minDistance = 1;
    this.orbitControls.maxDistance = 500;
    this.orbitControls.maxPolarAngle = Math.PI / 2;
  }

  clearExistingModels() {
    this.loadedModels.forEach((model) => {
      this.productGroup.remove(model);
    });
    this.loadedModels.clear();
    this.draggableObjects = [];
    this.interactionManager.setDraggableObjects([]);
  }

  fitCameraToScene() {
    if (!this.productGroup.children.length) return;

    const box = new THREE.Box3().setFromObject(this.productGroup);
    const size = box.getSize(new THREE.Vector3()).length();
    const center = box.getCenter(new THREE.Vector3());

    this.camera.position.copy(center);
    this.camera.position.x += size / 2.0;
    this.camera.position.y += size / 5.0;
    this.camera.position.z += size / 2.0;
    this.camera.lookAt(center);

    this.orbitControls.target.copy(center);
    this.orbitControls.update();
  }

  toggleColorMode(enabled) {
    if (enabled) {
      showConfirmationModal('Click on a part to select and color it.');
      this.createColorPanel();
      this.container.style.height = '70vh';
      this.onWindowResize();
      this.fitCameraToScene();
    } else {
      if (this.colorPanel) {
        document.body.removeChild(this.colorPanel);
        this.colorPanel = null;
      }
      this.removeHighlight();
      this.container.style.height = '100vh';
      this.onWindowResize();
      this.fitCameraToScene();
    }
  }

  createColorPanel() {
    this.colorPanel = document.createElement('div');
    this.colorPanel.style.position = 'fixed';
    this.colorPanel.style.bottom = '0';
    this.colorPanel.style.left = '0';
    this.colorPanel.style.width = '100%';
    this.colorPanel.style.height = '30vh';
    this.colorPanel.style.backgroundColor = 'white';
    this.colorPanel.style.zIndex = '1000';
    this.colorPanel.style.display = 'flex';
    this.colorPanel.style.flexDirection = 'column';
    this.colorPanel.style.alignItems = 'center';
    this.colorPanel.style.justifyContent = 'center';

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.style.width = '100px';
    colorInput.style.height = '100px';
    colorInput.style.border = 'none';
    colorInput.style.background = 'transparent';
    colorInput.style.cursor = 'pointer';

    colorInput.addEventListener('input', () => {
      if (this.selectedMaterial) {
        const color = new THREE.Color(colorInput.value);
        this.selectedMaterial.color.set(color);
      }
    });

    const recentColorsDiv = document.createElement('div');
    recentColorsDiv.style.display = 'flex';
    recentColorsDiv.style.gap = '10px';
    recentColorsDiv.style.marginTop = '20px';

    this.updateRecentColors(recentColorsDiv, colorInput);

    this.colorPanel.appendChild(colorInput);
    this.colorPanel.appendChild(recentColorsDiv);
    document.body.appendChild(this.colorPanel);
  }

  updateRecentColors(recentColorsDiv, colorInput) {
    recentColorsDiv.innerHTML = '';

    if (this.selectedMaterial && this.selectedMaterial.userData.originalColor) {
      const originalBtn = document.createElement('button');
      originalBtn.style.backgroundColor = this.selectedMaterial.userData.originalColor;
      originalBtn.style.width = '30px';
      originalBtn.style.height = '30px';
      originalBtn.style.border = '1px solid #ccc';
      originalBtn.style.borderRadius = '50%';
      originalBtn.addEventListener('click', () => {
        colorInput.value = this.selectedMaterial.userData.originalColor;
        const color = new THREE.Color(this.selectedMaterial.userData.originalColor);
        this.selectedMaterial.color.set(color);
      });
      recentColorsDiv.appendChild(originalBtn);
    }

    const recentColors = this.getRecentColors();
    recentColors.forEach(color => {
      const btn = document.createElement('button');
      btn.style.backgroundColor = color;
      btn.style.width = '30px';
      btn.style.height = '30px';
      btn.style.border = '1px solid #ccc';
      btn.style.borderRadius = '50%';
      btn.addEventListener('click', () => {
        colorInput.value = color;
        const threeColor = new THREE.Color(color);
        if (this.selectedMaterial) {
          this.selectedMaterial.color.set(threeColor);
        }
      });
      recentColorsDiv.appendChild(btn);
    });
  }

  handleColorSelect(mesh) {
    this.removeHighlight();
    this.selectedMesh = mesh;
    this.selectedMaterial = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;

    // Create highlight
    const boxHelper = new THREE.BoxHelper(mesh, 0xff0000);
    boxHelper.name = 'highlight';
    this.scene.add(boxHelper);
    this.highlightHelper = boxHelper;

    if (this.colorPanel) {
      const colorInput = this.colorPanel.querySelector('input[type="color"]');
      colorInput.value = '#' + this.selectedMaterial.color.getHexString();
      const recentColorsDiv = this.colorPanel.querySelector('div');
      this.updateRecentColors(recentColorsDiv, colorInput);
    }
  }

  removeHighlight() {
    if (this.highlightHelper) {
      this.scene.remove(this.highlightHelper);
      this.highlightHelper = null;
    }
    this.selectedMesh = null;
    this.selectedMaterial = null;
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

  async showBrowseInterface() {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) loadingOverlay.style.display = 'flex';

    try {
      const response = await fetch('./assets/files.json');
      const data = await response.json();
      let files = data.files;
      if (!files || !Array.isArray(files)) {
        files = [];
      }

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

      const box = document.createElement('div');
      box.style.backgroundColor = 'white';
      box.style.padding = '20px';
      box.style.borderRadius = '8px';
      box.style.width = '300px';
      box.style.maxHeight = '80%';
      box.style.overflowY = 'auto';

      const title = document.createElement('h3');
      title.textContent = 'Demo Models';
      box.appendChild(title);

      files.forEach(file => {
        const button = document.createElement('button');
        button.textContent = file.replace('.glb', '').replace('.gltf', '');
        button.style.display = 'block';
        button.style.width = '100%';
        button.style.margin = '10px 0';
        button.style.padding = '10px';
        button.style.backgroundColor = '#d00024';
        button.style.color = 'white';
        button.style.border = 'none';
        button.style.borderRadius = '9999px';
        button.style.cursor = 'pointer';

        button.addEventListener('click', async () => {
          document.body.removeChild(overlay);
          await this.loadModel(`./assets/${file}`, file.replace('.glb', '').replace('.gltf', ''));
        });
        box.appendChild(button);
      });

      const closeButton = document.createElement('button');
      closeButton.textContent = 'Close';
      closeButton.style.width = '100%';
      closeButton.style.marginTop = '20px';
      closeButton.style.padding = '10px';
      closeButton.style.backgroundColor = '#999';
      closeButton.style.color = 'white';
      closeButton.style.border = 'none';
      closeButton.style.borderRadius = '9999px';
      closeButton.style.cursor = 'pointer';
      closeButton.addEventListener('click', () => {
        document.body.removeChild(overlay);
      });
      box.appendChild(closeButton);

      overlay.appendChild(box);
      document.body.appendChild(overlay);
    } catch (error) {
      console.error('Error fetching demo files:', error);
    } finally {
      if (loadingOverlay) loadingOverlay.style.display = 'none';
    }
  }

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
              opacity: 0.2 // Increased opacity
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

  onTouchStart(event) {
    // Stub - add logic if needed
  }

  onTouchMove(event) {
    // Stub - add logic if needed
  }

  onTouchEnd(event) {
    // Stub - add logic if needed
  }

  handlePointerMove(event) {
    // Stub - add logic if needed
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

      if (this.highlightHelper) {
        this.highlightHelper.update();
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
