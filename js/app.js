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
    box.style.width = '300px';

    const title = document.createElement('h1');
    title.style.margin = '0 0 10px';
    title.innerHTML = '<h5>3D Model Viewer</h5> <p style="font-size: 16px; font-weight: normal;">with AR</p>';

    const description = document.createElement('p');
    description.style.fontSize = '14px';
    description.style.color = '#333';
    description.style.marginBottom = '20px';
    description.innerHTML = `
      <h3>Explore 3D Models with Ease</h3>
      <ul>
          <li> Click the "Browse" button to explore our demo models.</li>
          <li> Use the "Open" button to load your own GLB files.</li>
      </ul>
      <br>

      <h3>Interactive Features:</h3>
      <ul>
          <li>Click the "Color" button to modify any recognized materials.</li>
          <li>Drag components to reposition them as you wish.</li>
          <li>Drag the screen to rotate around the model.</li>
          <li>Click the "Reset" button to reset view and return all parts to their original positions.</li>
      </ul>
      <br>

      <h3>Augmented Reality:</h3>
      <p>If your device supports AR, simply click the "AR" button to view your model at real scale.</p>
      <br>

      <h3>Enhancing Product Prototyping in the Virtual World.</h3>
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
    uploadButton.style.backgroundColor = '#d00024';
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

  // -----------------------------------------------------------------------------
  // Handle File Storage in the Browser (using IndexedDB)
  // -----------------------------------------------------------------------------
  initIndexedDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('3DModelViewer', 1);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('models')) {
          db.createObjectStore('models', { keyPath: 'name' });
        }
      };
      
      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };
      
      request.onerror = (event) => {
        console.error("IndexedDB error:", event.target.error);
        reject(event.target.error);
      };
    });
  }

  saveModelToIndexedDB(name, fileBlob) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("IndexedDB not initialized"));
        return;
      }
      
      const transaction = this.db.transaction(['models'], 'readwrite');
      const store = transaction.objectStore('models');
      const modelData = { name, data: fileBlob, date: new Date().toISOString() };
      
      const request = store.put(modelData);
      
      request.onsuccess = () => resolve();
      request.onerror = (event) => reject(event.target.error);
    });
  }

  getModelFromIndexedDB(name) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("IndexedDB not initialized"));
        return;
      }
      
      const transaction = this.db.transaction(['models'], 'readonly');
      const store = transaction.objectStore('models');
      const request = store.get(name);
      
      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result.data);
        } else {
          reject(new Error("Model not found"));
        }
      };
      
      request.onerror = (event) => reject(event.target.error);
    });
  }

  listModelsFromIndexedDB() {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("IndexedDB not initialized"));
        return;
      }
      
      const transaction = this.db.transaction(['models'], 'readonly');
      const store = transaction.objectStore('models');
      const request = store.getAll();
      
      request.onsuccess = () => {
        resolve(request.result.map(item => ({
          name: item.name,
          date: item.date
        })));
      };
      
      request.onerror = (event) => reject(event.target.error);
    });
  }

  deleteModelFromIndexedDB(name) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("IndexedDB not initialized"));
        return;
      }
      
      const transaction = this.db.transaction(['models'], 'readwrite');
      const store = transaction.objectStore('models');
      const request = store.delete(name);
      
      request.onsuccess = () => resolve();
      request.onerror = (event) => reject(event.target.error);
    });
  }

  // -----------------------------------------------------------------------------
  // Browser-Based File Browser (using IndexedDB)
  // -----------------------------------------------------------------------------
  async showBrowseInterface() {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) loadingOverlay.style.display = 'flex';
    
    try {
        // Add console.log to debug
        console.log('Fetching files.json...');
        const response = await fetch('./assets/files.json');
        console.log('Response:', response);
        const data = await response.json();
        console.log('Data:', data);
        const files = data.models;
        
        if (loadingOverlay) loadingOverlay.style.display = 'none';

        const modalOverlay = document.createElement('div');
        modalOverlay.style.position = 'fixed';
        modalOverlay.style.top = '0';
        modalOverlay.style.left = '0';
        modalOverlay.style.width = '100%';
        modalOverlay.style.height = '100%';
        modalOverlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
        modalOverlay.style.display = 'flex';
        modalOverlay.style.alignItems = 'center';
        modalOverlay.style.justifyContent = 'center';
        modalOverlay.style.zIndex = '10000';
        
        const modalContainer = document.createElement('div');
        modalContainer.style.backgroundColor = 'white';
        modalContainer.style.padding = '20px';
        modalContainer.style.borderRadius = '8px';
        modalContainer.style.minWidth = '300px';
        modalContainer.style.maxHeight = '80%';
        modalContainer.style.overflowY = 'auto';
        
        const title = document.createElement('h2');
        title.textContent = 'Browse Models';
        title.style.marginBottom = '10px';
        modalContainer.appendChild(title);

        const description = document.createElement('p');
        if (!files || files.length === 0) {
            description.textContent = 'No models found.';
        } else {
            description.textContent = `Found ${files.length} models. Select models to load:`;
        }
        modalContainer.appendChild(description);
        
        const fileList = document.createElement('div');
        fileList.style.marginTop = '10px';
        
        if (files && files.length > 0) {
            files.forEach(file => {
                const div = document.createElement('div');
                div.style.marginBottom = '10px';
                div.style.padding = '5px';
                div.style.borderRadius = '4px';
                div.style.backgroundColor = '#f5f5f5';
                
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = file.url;
                checkbox.id = file.name;
                
                const label = document.createElement('label');
                label.htmlFor = file.name;
                label.textContent = file.name;
                label.style.marginLeft = '8px';
                
                div.appendChild(checkbox);
                div.appendChild(label);
                fileList.appendChild(div);
            });
        }
        
        modalContainer.appendChild(fileList);
        
        const buttonsDiv = document.createElement('div');
        buttonsDiv.style.marginTop = '20px';
        buttonsDiv.style.textAlign = 'right';
        
        const loadButton = document.createElement('button');
        loadButton.textContent = 'Load Selected';
        loadButton.style.backgroundColor = '#d00024';
        loadButton.style.color = 'white';
        loadButton.style.border = 'none';
        loadButton.style.borderRadius = '9999px';
        loadButton.style.padding = '10px 20px';
        loadButton.style.cursor = 'pointer';



        
        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.style.backgroundColor = 'rgb(153, 153, 153)';
        cancelButton.style.color = 'white';
        cancelButton.style.border = 'none';
        cancelButton.style.borderRadius = '9999px';
        cancelButton.style.padding = '10px 20px';
        cancelButton.style.cursor = 'pointer';
        cancelButton.style.marginRight = '15px';


        
        buttonsDiv.appendChild(cancelButton);
        buttonsDiv.appendChild(loadButton);
        modalContainer.appendChild(buttonsDiv);
        modalOverlay.appendChild(modalContainer);
        document.body.appendChild(modalOverlay);
        
        loadButton.addEventListener('click', async () => {
            const selected = [];
            fileList.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
                selected.push({ url: cb.value, name: cb.id });
            });
            
            if(selected.length > 0) {
                document.body.removeChild(modalOverlay);
                
                if (loadingOverlay) loadingOverlay.style.display = 'flex';
                
                this.clearExistingModels();
                
                for(const file of selected) {
                    console.log('Loading model:', file.url);
                    await this.loadModel(file.url, file.name.replace('.glb', '').replace('.gltf', ''));
                }
                
                this.fitCameraToScene();
                
                if (loadingOverlay) loadingOverlay.style.display = 'none';
            } else {
                document.body.removeChild(modalOverlay);
            }
        });
        
        cancelButton.addEventListener('click', () => {
            document.body.removeChild(modalOverlay);
        });
        
    } catch (error) {
        if (loadingOverlay) loadingOverlay.style.display = 'none';
        console.error("Error fetching models:", error);
        console.log("Full error details:", error);
        alert("Error accessing models. Please check the console for details.");
    }
  }

  // -----------------------------------------------------------------------------
  // Pointer events 
  // -----------------------------------------------------------------------------
  handlePointerMove(event) {
    this.pointerNDC.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.pointerNDC.y = -(event.clientY / window.innerHeight) * 2 + 1;
  }

  // -----------------------------------------------------------------------------
  // Touch Events for Model Rotation
  // -----------------------------------------------------------------------------
  onTouchStart(e) {
    if (!this.isARMode) {
        // Use existing non-AR touch handling
        if (e.touches.length === 2 && this.productGroup && this.productGroup.visible) {
            const dx = e.touches[1].clientX - e.touches[0].clientX;
            const dy = e.touches[1].clientY - e.touches[0].clientY;
            this.lastTouchAngle = Math.atan2(dy, dx);
        }
        return;
    }
    
    // AR mode specific touch handling
    if (e.touches.length === 1) {
        // Single touch - track for Y-axis rotation
        this.touchStartX = e.touches[0].clientX;
        this.initialRotationY = this.productGroup ? this.productGroup.rotation.y : 0;
        this.isSingleTouchRotating = true;
    } 
    else if (e.touches.length === 2) {
        // Two finger touch - prepare for rotation
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        this.lastTouchAngle = Math.atan2(dy, dx);
    }
  }

  onTouchMove(e) {
    if (!this.isARMode) {
        // Use existing non-AR touch handling
        if (e.touches.length === 2 && this.lastTouchAngle !== null && 
            this.productGroup && this.productGroup.visible) {
            const dx = e.touches[1].clientX - e.touches[0].clientX;
            const dy = e.touches[1].clientY - e.touches[0].clientY;
            const currentAngle = Math.atan2(dy, dx);
            const angleDiff = currentAngle - this.lastTouchAngle;
            this.productGroup.rotation.y += angleDiff;
            this.lastTouchAngle = currentAngle;
            e.preventDefault();
        }
        return;
    }
    
    // AR mode touch handling
    if (this.productGroup && this.productGroup.visible) {
        if (this.isSingleTouchRotating && e.touches.length === 1) {
            // Single finger drag - rotate Y axis
            const touchX = e.touches[0].clientX;
            const touchDeltaX = touchX - this.touchStartX;
            
            // Scale the rotation (adjust sensitivity as needed)
            const rotationFactor = 0.01;
            this.productGroup.rotation.y = this.initialRotationY + (touchDeltaX * rotationFactor);
            
            e.preventDefault();
        } 
        else if (e.touches.length === 2 && this.lastTouchAngle !== null) {
            // Two finger gesture - handle rotation
            const dx = e.touches[1].clientX - e.touches[0].clientX;
            const dy = e.touches[1].clientY - e.touches[0].clientY;
            const currentAngle = Math.atan2(dy, dx);
            const angleDiff = currentAngle - this.lastTouchAngle;
            this.productGroup.rotation.y += angleDiff;
            this.lastTouchAngle = currentAngle;
            
            e.preventDefault();
        }
    }
  }

  onTouchEnd(e) {
    // Reset touch tracking variables
    if (e.touches.length < 2) {
        this.lastTouchAngle = null;
    }
    
    if (e.touches.length === 0) {
        this.isSingleTouchRotating = false;
    }
  }

  // -----------------------------------------------------------------------------
  // Loading Overlay (for both demo and upload)
  // -----------------------------------------------------------------------------
  createLoadingOverlay() {
    let overlay = document.getElementById('loading-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'loading-overlay';
      overlay.style.position = 'fixed';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100%';
      overlay.style.height = '100%';
      overlay.style.backgroundColor = '#cccccc';
      overlay.style.display = 'none';
      overlay.style.flexDirection = 'column';
      overlay.style.justifyContent = 'center';
      overlay.style.alignItems = 'center';
      overlay.style.zIndex = '9999';
      overlay.innerHTML = `
        <div id="loading-spinner" style="
          border: 11px solid #d00024;
          border-top: 11px solid #f3f3f3;
          border-radius: 50%;
          width: 84px;
          height: 84px;
          animation: spin 2s linear infinite;
        "></div>
        <div id="loading-text" style="
          color: #333;
          margin-top: 20px;
          font-size: 14px;
          font-family: sans-serif;
        ">
          Loading...
        </div>
      `;
      document.body.appendChild(overlay);

      if (!document.getElementById('loading-overlay-style')) {
        const style = document.createElement('style');
        style.id = 'loading-overlay-style';
        style.textContent = `
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `;
        document.head.appendChild(style);
      }
    }
  }

  // -----------------------------------------------------------------------------
  // Basic Initialization and Scene Setup
  // -----------------------------------------------------------------------------
  onWindowResize() {
    if (this.camera && this.renderer) {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
  }

  init() {
    this.container = document.getElementById('scene-container');
    this.scene = new THREE.Scene();

    // Group for products (models)
    this.productGroup = new THREE.Group();
    this.scene.add(this.productGroup);

    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true; // Enable shadow maps
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Use soft shadows
    this.renderer.xr.enabled = true;
    this.container.appendChild(this.renderer.domElement);
    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  setupScene() {
    this.scene.background = new THREE.Color(0xc0c0c1);
    this.createFloor(); // Add floor immediately
    this.rgbeLoader.load(
      './assets/brown_photostudio_02_2k.hdr',
      (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        this.scene.environment = texture;
        this.renderer.physicallyCorrectLights = true;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 0.5;
        this.renderer.outputEncoding = THREE.sRGBEncoding;
      }
    );
  }

  setupLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight.position.set(-5, 30, 5);
    directionalLight.castShadow = true; // Enable shadow casting
    
    // Improve shadow quality
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.1;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.intensity = 5;
    
    // Adjust shadow camera frustum to fit your scene
    const shadowSize = 10;
    directionalLight.shadow.camera.left = -shadowSize;
    directionalLight.shadow.camera.right = shadowSize;
    directionalLight.shadow.camera.top = shadowSize;
    directionalLight.shadow.camera.bottom = -shadowSize;
    
    // Fix shadow acne issues
    directionalLight.shadow.bias = -0.0005;
    directionalLight.shadow.normalBias = 0.02;

    this.scene.add(directionalLight);

    // Helper for debugging shadows (uncomment if needed)
    // const helper = new THREE.CameraHelper(directionalLight.shadow.camera);
    // this.scene.add(helper);

    window.sceneLight = {
      ambient: ambientLight,
      directional: directionalLight
    };
  }

  createFloor() {
    // Create a floor plane
    const floorGeometry = new THREE.PlaneGeometry(100, 100);
    const floorMaterial = new THREE.MeshStandardMaterial({
        color: 0xbbbbbb,
        roughness: 0.8,
        metalness: 0.2,
        transparent: this.isARMode, // Transparent only in AR mode
        opacity: this.isARMode ? 0.1 : 1.5 // Semi-transparent in AR mode
    });
    const browserFloorMaterial = new THREE.MeshStandardMaterial({
      color: 0xfafafa, // Match the background color
      roughness: 0.8,
      metalness: 0.2
    });
    
    this.floor = new THREE.Mesh(floorGeometry, 
      this.isARMode ? floorMaterial : browserFloorMaterial);
    this.floor.receiveShadow = true;
    this.floor.rotation.x = -Math.PI / 2; // Rotate to be horizontal
    
    this.scene.add(this.floor);
    return this.floor;
  }

  setupInitialControls() {
    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControls.rotateSpeed = 0.5;
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.05;
  }

  updateDragControls() {
    const draggableObjects = Array.from(this.loadedModels.values());
    if (this.interactionManager) {
        this.interactionManager.setDraggableObjects(draggableObjects);
    }
  }

  clearExistingModels() {
    this.loadedModels.forEach(model => {
      if (model.parent) {
        this.productGroup.remove(model);
      }
    });
    this.loadedModels.clear();
    this.draggableObjects.length = 0;
    this.updateDragControls();
  }

  async loadDefaultProduct() {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) {
      loadingOverlay.style.display = 'flex';
    }
    this.clearExistingModels();
    const parts = [
      { name: 'blade', file: './assets/kool-mandoline-blade.glb' },
      { name: 'frame', file: './assets/kool-mandoline-frame.glb' },
      { name: 'handguard', file: './assets/ool-mandoline-handguard.glb' },
      { name: 'handle', file: './assets/kool-mandoline-handletpe.glb' }
    ];
    
    for (const part of parts) {
      await new Promise((resolve, reject) => {
        this.gltfLoader.load(
          `assets/${part.file}`,
          (gltf) => {
            const model = gltf.scene;
            const container = new THREE.Group();
            container.name = part.name;
            container.userData.isDraggable = true;
            container.add(model);

            container.raycast = function (raycaster, intersects) {
              const box = new THREE.Box3().setFromObject(container);
              if (!box.isEmpty()) {
                const intersectionPoint = new THREE.Vector3();
                if (raycaster.ray.intersectBox(box, intersectionPoint)) {
                  const distance = raycaster.ray.origin.distanceTo(intersectionPoint);
                  intersects.push({
                    distance: distance,
                    point: intersectionPoint.clone(),
                    object: container
                  });
                }
              }
            };

            this.draggableObjects.push(container);
            this.productGroup.add(container);
            this.loadedModels.set(part.name, container);
            this.updateDragControls();
            if (this.interactionManager) {
              this.interactionManager.setDraggableObjects(Array.from(this.loadedModels.values()));
            }
            this.fitCameraToScene();
            resolve();
          },
          undefined,
          (error) => {
            console.error(`Error loading model ${part.file}:`, error);
            reject(error);
          }
        );
      });
    }
    if (loadingOverlay) {
      loadingOverlay.style.display = 'none';
    }
  }

  fitCameraToScene() {
    const box = new THREE.Box3().setFromObject(this.productGroup);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fovRadians = this.camera.fov * (Math.PI / 180);
    let distance = Math.abs(maxDim / Math.tan(fovRadians / 2));
    distance *= 1.2;
    
    const offsetAngle = Math.PI / 4;
    const xOffset = distance * Math.cos(offsetAngle);
    const zOffset = distance * Math.sin(offsetAngle);
    const yOffset = distance * 0.5;
    
    this.camera.position.set(center.x + xOffset, center.y + yOffset, center.z + zOffset);
    this.orbitControls.target.copy(center);
    this.camera.updateProjectionMatrix();
    this.orbitControls.update();
    
    // Also reset the InteractionManager's orbit controls if they exist
    if (this.interactionManager && this.interactionManager.orbitControls) {
        this.interactionManager.orbitControls.target.copy(center);
        this.interactionManager.orbitControls.update();
    }
  }

  async loadModel(url, name) {
    return new Promise((resolve, reject) => {
        // For file uploads, save to IndexedDB when loading
        if (url.startsWith('blob:')) {
            fetch(url)
                .then(response => response.blob())
                .then(blob => {
                    // Initialize IndexedDB if needed and save the model
                    if (!this.db) {
                        this.initIndexedDB()
                            .then(db => {
                                this.saveModelToIndexedDB(name, blob);
                            })
                            .catch(error => console.error("Error initializing IndexedDB:", error));
                    } else {
                        this.saveModelToIndexedDB(name, blob);
                    }
                })
                .catch(error => console.error("Error saving model to IndexedDB:", error));
        }
        
        this.gltfLoader.load(
            url,
            (gltf) => {
                const model = gltf.scene;
                // Set all meshes to cast shadows
                model.traverse(node => {
                  if (node.isMesh) {
                    node.castShadow = true;
                  }
                });
                const container = new THREE.Group();
                container.name = name;
                container.userData.isDraggable = true;
                container.add(model);

                // Custom raycast implementation
                container.raycast = function(raycaster, intersects) {
                    // Get all meshes inside this container
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

  onARSessionStart() {
    console.log("AR session started - entering tap-to-place mode");
    this.isARMode = true;
    this.isPlacingProduct = true;
    
    // Hide the productGroup until placement occurs
    if (this.productGroup) {
      this.productGroup.visible = false;
    }

    // Update floor for AR mode
    if (this.floor) {
        // Remove the old floor
        this.scene.remove(this.floor);
        
        // Create a new floor with shadow material
        const floorGeometry = new THREE.PlaneGeometry(20, 20);
        const shadowMaterial = new THREE.ShadowMaterial({
            opacity: 0.05 // Subtle shadows only
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