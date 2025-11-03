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
    // ----- Core state -----
    this.loadedModels = new Map();
    this.draggableObjects = [];
    this.isARMode = false;
    this.isVRMode = false;
    this.isXRMode = false;
    this.isPlacingProduct = false;
    this.selectionMode = false;
    this.selectedMaterial = null;
    this.mouse = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();

    // AR/VR UI
    this.placementReticle = null;
    this.placementMessage = null;
    this.placeAgainButton = null;
    this.exitXRButton = null;
    this.hitTestSource = null;

    // Touch fallback
    this.touchStartX = null;
    this.touchStartY = null;

    // FontAwesome
    this.ensureFontAwesomeLoaded();

    // Loading overlay
    this.createLoadingOverlay();

    // Loaders
    this.loadingManager = new THREE.LoadingManager();
    this.loadingManager.onProgress = (url, loaded, total) => {
      const fill = document.querySelector('#loading-overlay .progress-fill');
      if (fill) fill.style.width = `${(loaded / total) * 100}%`;
    };
    this.loadingManager.onLoad = () => {
      const overlay = document.getElementById('loading-overlay');
      if (overlay) overlay.style.display = 'none';
    };

    this.gltfLoader = new GLTFLoader(this.loadingManager);
    this.rgbeLoader = new RGBELoader(this.loadingManager);

    // Initialize scene
    this.init();
    this.setupScene();        // FIXED: Added
    this.setupLights();
    this.setupInitialControls();

    // UI
    setupUIControls(this);

    // File input
    const fileInput = document.querySelector('input[type="file"][accept=".glb,.gltf"]');
    if (fileInput) {
      fileInput.onchange = async (event) => {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.style.display = 'flex';

        const files = event.target.files;
        if (!files || files.length === 0) {
          if (overlay) overlay.style.display = 'none';
          return;
        }

        this.clearExistingModels();

        for (let file of files) {
          try {
            const url = URL.createObjectURL(file);
            const name = file.name.replace(/\.glb$|\.gltf$/i, '');
            await this.loadModel(url, name);
          } catch (e) { console.error(e); }
        }
        if (overlay) overlay.style.display = 'none';
      };
    }

    // Interaction
    this.interactionManager = new InteractionManager(
      this.scene, this.camera, this.renderer, this.renderer.domElement
    );
    window.app = this;

    // Tap-to-select
    this.renderer.domElement.addEventListener('click', this.onPointerSelect.bind(this));

    // XR events
    this.renderer.xr.addEventListener('sessionstart', this.onXRSessionStart.bind(this));
    this.renderer.xr.addEventListener('sessionend', this.onXRSessionEnd.bind(this));

    // Start
    this.showLandingOverlay();
    this.animate();
  }

  // -------------------------------------------------------------------------
  // Core Setup
  // -------------------------------------------------------------------------
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
    overlay.style.top = '0'; overlay.style.left = '0';
    overlay.style.width = '100%'; overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.6)';
    overlay.style.display = 'none';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.flexDirection = 'column';
    overlay.style.color = 'white';
    overlay.style.fontSize = '1.2rem';
    overlay.style.zIndex = '20000';

    overlay.innerHTML = `
      <div>Loading model...</div>
      <div class="progress-bar" style="width:250px;height:12px;background:#555;border-radius:6px;margin-top:12px;">
        <div class="progress-fill" style="width:0;height:100%;background:#d00024;border-radius:6px;"></div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  init() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xc0c0c1);

    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.set(0, 1.6, 3);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.xr.enabled = true;
    this.renderer.shadowMap.enabled = true;
    document.getElementById('scene-container').appendChild(this.renderer.domElement);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  setupScene() {
    this.productGroup = null;
    this.floor = null;

    const floorGeometry = new THREE.PlaneGeometry(20, 20);
    const floorMaterial = new THREE.ShadowMaterial({ opacity: 0.07 });
    this.floor = new THREE.Mesh(floorGeometry, floorMaterial);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.floor.visible = false;
    this.scene.add(this.floor);
  }

  setupLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(5, 10, 7);
    dirLight.castShadow = true;
    this.scene.add(dirLight);
  }

  setupInitialControls() {
    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.05;
  }

  // -------------------------------------------------------------------------
  // Model Loading
  // -------------------------------------------------------------------------
  async loadModel(url, name) {
    return new Promise((resolve, reject) => {
      this.gltfLoader.load(
        url,
        (gltf) => {
          const model = gltf.scene;
          model.name = name;

          model.traverse(child => {
            if (child.isMesh && !child.material.userData.originalColor) {
              child.material.userData.originalColor = '#' + child.material.color.getHexString();
            }
          });

          const container = new THREE.Group();
          container.name = name;
          container.add(model);
          container.userData.originalScale = new THREE.Vector3(1, 1, 1);

          container.raycast = function (raycaster, intersects) {
            const temp = [];
            this.children.forEach(child => {
              child.traverse(obj => {
                if (obj.isMesh) {
                  const old = obj.matrixAutoUpdate;
                  obj.matrixAutoUpdate = true;
                  obj.updateMatrixWorld(true);
                  obj.raycast(raycaster, temp);
                  obj.matrixAutoUpdate = old;
                }
              });
            });
            if (temp.length) {
              intersects.push({
                distance: temp[0].distance,
                point: temp[0].point.clone(),
                object: this
              });
            }
          };

          this.draggableObjects.push(container);
          this.productGroup = container;
          this.scene.add(container);
          this.loadedModels.set(name, container);

          if (this.interactionManager) {
            this.interactionManager.setDraggableObjects(Array.from(this.loadedModels.values()));
          }

          this.fitCameraToScene();
          resolve(container);
        },
        undefined,
        reject
      );
    });
  }

  clearExistingModels() {
    if (this.productGroup) {
      this.scene.remove(this.productGroup);
      this.productGroup = null;
    }
    this.loadedModels.clear();
    this.draggableObjects = [];
    if (this.interactionManager) this.interactionManager.setDraggableObjects([]);
  }

  fitCameraToScene() {
    if (!this.productGroup) return;
    const box = new THREE.Box3().setFromObject(this.productGroup);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim * 2.5;
    const direction = new THREE.Vector3()
      .subVectors(this.camera.position, center)
      .normalize()
      .multiplyScalar(distance);

    this.camera.position.copy(center).add(direction);
    this.orbitControls.target.copy(center);
    this.orbitControls.update();
  }

  // -------------------------------------------------------------------------
  // Tap-to-Select Color
  // -------------------------------------------------------------------------
  onPointerSelect(event) {
    if (!this.selectionMode) return;
    event.preventDefault();

    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const hits = this.raycaster.intersectObjects(this.scene.children, true);

    if (hits.length && hits[0].object.isMesh && hits[0].object.material) {
      const mat = hits[0].object.material;
      this.selectedMaterial = mat;

      mat.userData._tempEmissive = mat.emissive.clone();
      mat.emissive.set(0x555555);

      import('./uiControls.js').then(mod => mod.showMaterialColorPicker(this));
    }
  }

  // -------------------------------------------------------------------------
  // XR Session Handling
  // -------------------------------------------------------------------------
  onXRSessionStart() {
    const session = this.renderer.xr.getSession();
    this.isXRMode = true;
    this.isARMode = session.mode === 'immersive-ar';
    this.isVRMode = session.mode === 'immersive-vr';

    this.scene.background = null;

    if (this.isARMode) {
      this.isPlacingProduct = true;
      if (this.productGroup) this.productGroup.visible = false;
      this.createPlacementUI();
      this.placementMessage.style.display = 'block';
    } else {
      if (this.productGroup) this.productGroup.visible = true;
    }

    if (!this.exitXRButton) this.createExitXRButton();
    this.exitXRButton.style.display = 'block';
    this.exitXRButton.textContent = this.isARMode ? 'Exit AR' : 'Exit VR';

    if (this.isARMode && !this.hitTestSource) {
      session.requestReferenceSpace('local-floor')
        .catch(() => session.requestReferenceSpace('viewer'))
        .then(refSpace => session.requestHitTestSource({ space: refSpace }))
        .then(src => this.hitTestSource = src);
    }

    if (this.isARMode) {
      this._selectBound = this.onSelectEvent.bind(this);
      session.addEventListener('select', this._selectBound);
    }
  }

  onXRSessionEnd() {
    this.isXRMode = false;
    this.isARMode = false;
    this.isVRMode = false;
    this.isPlacingProduct = false;

    this.scene.background = new THREE.Color(0xc0c0c1);
    this.renderer.setClearColor(0xc0c0c1, 1);

    if (this.productGroup) this.productGroup.visible = true;
    if (this.floor) this.floor.visible = false;
    if (this.placementReticle) this.placementReticle.visible = false;
    if (this.placementMessage) this.placementMessage.style.display = 'none';
    if (this.placeAgainButton) this.placeAgainButton.style.display = 'none';
    if (this.rotateLeftBtn) this.rotateLeftBtn.style.display = 'none';
    if (this.rotateRightBtn) this.rotateRightBtn.style.display = 'none';
    if (this.exitXRButton) this.exitXRButton.style.display = 'none';

    this.fitCameraToScene();
    this.orbitControls.enabled = true;
  }

  createExitXRButton() {
    this.exitXRButton = document.createElement('button');
    this.exitXRButton.style.position = 'absolute';
    this.exitXRButton.style.top = '20px';
    this.exitXRButton.style.right = '20px';
    this.exitXRButton.style.padding = '8px 16px';
    this.exitXRButton.style.border = 'none';
    this.exitXRButton.style.borderRadius = '4px';
    this.exitXRButton.style.background = '#fff';
    this.exitXRButton.style.color = '#000';
    this.exitXRButton.style.fontSize = '13px';
    this.exitXRButton.style.cursor = 'pointer';
    this.exitXRButton.style.zIndex = '10000';
    this.exitXRButton.style.display = 'none';
    this.exitXRButton.onclick = () => {
      const s = this.renderer.xr.getSession();
      if (s) s.end();
    };
    document.body.appendChild(this.exitXRButton);
  }

  // -------------------------------------------------------------------------
  // AR UI
  // -------------------------------------------------------------------------
  createPlacementUI() {
    // Reticle
    this.placementReticle = new THREE.Group();
    this.placementReticle.scale.set(0.3, 0.3, 0.3);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.15, 0.2, 32),
      new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    this.placementReticle.add(ring);
    const dot = new THREE.Mesh(
      new THREE.CircleGeometry(0.05, 32),
      new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide })
    );
    dot.rotation.x = -Math.PI / 2;
    this.placementReticle.add(dot);
    this.placementReticle.visible = false;
    this.scene.add(this.placementReticle);

    // Message
    this.placementMessage = document.createElement('div');
    this.placementMessage.textContent = 'Tap to place';
    this.placementMessage.style.position = 'absolute';
    this.placementMessage.style.bottom = '100px';
    this.placementMessage.style.left = '50%';
    this.placementMessage.style.transform = 'translateX(-50%)';
    this.placementMessage.style.color = 'white';
    this.placementMessage.style.fontSize = '20px';
    this.placementMessage.style.zIndex = '10000';
    this.placementMessage.style.display = 'none';
    document.body.appendChild(this.placementMessage);

    // Place again
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
    this.placeAgainButton.onclick = () => {
      if (this.productGroup) this.productGroup.visible = false;
      this.isPlacingProduct = true;
      this.placementMessage.style.display = 'block';
      this.placeAgainButton.style.display = 'none';
      if (this.rotateLeftBtn) this.rotateLeftBtn.style.display = 'none';
      if (this.rotateRightBtn) this.rotateRightBtn.style.display = 'none';
      const s = this.renderer.xr.getSession();
      if (s) {
        this._selectBound = this.onSelectEvent.bind(this);
        s.addEventListener('select', this._selectBound);
      }
    };
    document.body.appendChild(this.placeAgainButton);

    // Rotation buttons
    this.createARRotationControls();
  }

  createARRotationControls() {
    this.rotateLeftBtn = document.createElement('button');
    this.rotateLeftBtn.innerHTML = '<i class="fa-solid fa-rotate-left"></i>';
    this.rotateLeftBtn.style.position = 'absolute';
    this.rotateLeftBtn.style.bottom = '80px';
    this.rotateLeftBtn.style.right = 'calc(50% + 60px)';
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

    this.rotateRightBtn = document.createElement('button');
    this.rotateRightBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i>';
    this.rotateRightBtn.style.position = 'absolute';
    this.rotateRightBtn.style.bottom = '80px';
    this.rotateRightBtn.style.left = 'calc(50% + 60px)';
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

  rotateModel(axis, angle) {
    if (!this.productGroup) return;
    if (axis === 'y') this.productGroup.rotation.y += angle;
  }

  onSelectEvent(event) {
    if (!this.isPlacingProduct || !this.hitTestSource) return;
    const frame = event.frame;
    const refSpace = this.renderer.xr.getReferenceSpace();
    const hits = frame.getHitTestResults(this.hitTestSource);
    if (hits.length === 0) return;

    const hit = hits[0];
    const pose = hit.getPose(refSpace);
    const bbox = new THREE.Box3().setFromObject(this.productGroup);
    const offsetY = bbox.min.y;

    this.productGroup.visible = true;
    this.productGroup.position.set(
      pose.transform.position.x,
      pose.transform.position.y - offsetY,
      pose.transform.position.z
    );

    if (this.floor) {
      this.floor.position.copy(this.productGroup.position);
      this.floor.position.y = pose.transform.position.y;
      this.floor.visible = true;
    }

    this.isPlacingProduct = false;
    this.placementMessage.style.display = 'none';
    this.placementReticle.visible = false;
    this.placeAgainButton.style.display = 'block';
    this.rotateLeftBtn.style.display = 'block';
    this.rotateRightBtn.style.display = 'block';

    const session = this.renderer.xr.getSession();
    session.removeEventListener('select', this._selectBound);
  }

  // -------------------------------------------------------------------------
  // Browse Interface
  // -------------------------------------------------------------------------
  showBrowseInterface() {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0'; overlay.style.left = '0';
    overlay.style.width = '100%'; overlay.style.height = '100%';
    overlay.style.background = 'rgba(0,0,0,0.6)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '15000';

    const box = document.createElement('div');
    box.style.background = 'white';
    box.style.padding = '30px';
    box.style.borderRadius = '8px';
    box.style.maxWidth = '90%';
    box.style.textAlign = 'center';

    box.innerHTML = `<h3 style="margin-bottom:15px;">Browse Demo Models</h3>`;
    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(120px,1fr))';
    grid.style.gap = '15px';

    const demos = [
      { name: 'Damaged Helmet', url: 'https://threejs.org/examples/models/gltf/DamagedHelmet.glb' },
      { name: 'Fox', url: 'https://threejs.org/examples/models/gltf/Fox.glb' },
      { name: 'Flight Helmet', url: 'https://threejs.org/examples/models/gltf/FlightHelmet/glTF/FlightHelmet.gltf' },
    ];

    demos.forEach(d => {
      const card = document.createElement('div');
      card.style.cursor = 'pointer';
      card.style.padding = '10px';
      card.style.border = '1px solid #ddd';
      card.style.borderRadius = '6px';
      card.innerHTML = `<div style="font-weight:bold;">${d.name}</div>`;
      card.onclick = () => {
        this.clearExistingModels();
        this.loadModel(d.url, d.name);
        document.body.removeChild(overlay);
      };
      grid.appendChild(card);
    });

    box.appendChild(grid);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  // -------------------------------------------------------------------------
  // Landing Overlay
  // -------------------------------------------------------------------------
  showLandingOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'landing-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0'; overlay.style.left = '0';
    overlay.style.width = '100%'; overlay.style.height = '100%';
    overlay.style.backgroundColor = '#cccccc';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '10000';

    const box = document.createElement('div');
    box.style.background = 'white';
    box.style.padding = '30px';
    box.style.borderRadius = '8px';
    box.style.width = '320px';
    box.style.textAlign = 'center';

    box.innerHTML = `
      <h1 style="margin:0 0 10px;">3D Model Viewer</h1>
      <p style="font-size:16px;margin-bottom:20px;">Beta</p>
      <h3 style="margin:10px 0;">Explore 3D Models with Ease</h3>
      <p>Click <strong>Browse</strong> for demo models or <strong>Open</strong> to load your own GLB/GLTF.</p>
      <h3 style="margin:10px 0;">Features</h3>
      <p>Drag parts • Rotate view • Change colours • Reset • AR/VR</p>
      <div style="margin-top:20px;display:flex;gap:10px;justify-content:center;">
        <button id="browse-landing" style="padding:10px 20px;background:#d00024;color:white;border:none;border-radius:9999px;cursor:pointer;">Browse</button>
        <button id="open-landing" style="padding:10px 20px;background:#999;color:white;border:none;border-radius:9999px;cursor:pointer;">Open</button>
      </div>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    document.getElementById('browse-landing').onclick = () => {
      document.body.removeChild(overlay);
      this.showBrowseInterface();
    };
    document.getElementById('open-landing').onclick = () => {
      document.body.removeChild(overlay);
      const fi = document.querySelector('input[type="file"][accept=".glb,.gltf"]');
      if (fi) fi.click();
    };
  }

  // -------------------------------------------------------------------------
  // Animation Loop
  // -------------------------------------------------------------------------
  animate() {
    this.renderer.setAnimationLoop((time, frame) => {
      if (this.isARMode && this.isPlacingProduct && this.hitTestSource && frame) {
        const ref = this.renderer.xr.getReferenceSpace();
        const hits = frame.getHitTestResults(this.hitTestSource);
        if (hits.length) {
          const pose = hits[0].getPose(ref);
          this.placementReticle.visible = true;
          this.placementReticle.position.set(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z);
        } else {
          this.placementReticle.visible = false;
        }
      }

      if (!this.interactionManager.isDragging) this.orbitControls.update();
      this.interactionManager.update();
      this.renderer.render(this.scene, this.camera);
    });
  }
}

const app = new App();
export default app;
