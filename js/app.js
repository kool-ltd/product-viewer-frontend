import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { InteractionManager } from './InteractionManager.js';
import { setupUIControls } from './uiControls.js';
import { showConfirmationModal } from './modalManager.js';

class App {
  constructor() {
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

    this.placementReticle = null;
    this.placementMessage = null;
    this.placeAgainButton = null;
    this.exitXRButton = null;
    this.hitTestSource = null;

    this.ensureFontAwesomeLoaded();
    this.createLoadingOverlay();

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

    this.init();
    this.setupScene();
    this.setupLights();
    this.setupInitialControls();

    setupUIControls(this);

    const fileInput = document.querySelector('input[type="file"][accept=".glb,.gltf"]');
    if (fileInput) {
      fileInput.onchange = async (e) => {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.style.display = 'flex';
        const files = e.target.files;
        if (!files?.length) { overlay.style.display = 'none'; return; }
        this.clearExistingModels();
        for (let f of files) {
          const url = URL.createObjectURL(f);
          const name = f.name.replace(/\.glb$|\.gltf$/i, '');
          await this.loadModel(url, name);
        }
        if (overlay) overlay.style.display = 'none';
      };
    }

    this.interactionManager = new InteractionManager(
      this.scene, this.camera, this.renderer, this.renderer.domElement
    );
    window.app = this;

    this.renderer.domElement.addEventListener('click', this.onPointerSelect.bind(this));

    this.renderer.xr.addEventListener('sessionstart', this.onXRSessionStart.bind(this));
    this.renderer.xr.addEventListener('sessionend', this.onXRSessionEnd.bind(this));

    this.showLandingOverlay();
    this.animate();
  }

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
          container.userData.originalScale = new THREE.Vector3(1,1,1);

          container.raycast = function(raycaster, intersects) {
            const temp = [];
            this.children.forEach(c => {
              c.traverse(obj => {
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
              intersects.push({ distance: temp[0].distance, point: temp[0].point.clone(), object: this });
            }
          };

          this.draggableObjects.push(container);
          this.productGroup = container;
          this.scene.add(container);
          this.loadedModels.set(name, container);
          this.interactionManager.setDraggableObjects(Array.from(this.loadedModels.values()));
          this.fitCameraToScene();
          resolve(container);
        },
        undefined,
        reject
      );
    });
  }

  clearExistingModels() {
    if (this.productGroup) this.scene.remove(this.productGroup);
    this.productGroup = null;
    this.loadedModels.clear();
    this.draggableObjects = [];
    this.interactionManager.setDraggableObjects([]);
  }

  fitCameraToScene() {
    if (!this.productGroup) return;
    const box = new THREE.Box3().setFromObject(this.productGroup);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim * 2.5;
    const dir = new THREE.Vector3().subVectors(this.camera.position, center).normalize().multiplyScalar(distance);
    this.camera.position.copy(center).add(dir);
    this.orbitControls.target.copy(center);
    this.orbitControls.update();
  }

  // Tap-to-select
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
      import('./uiControls.js').then(m => m.showMaterialColorPicker(this));
    }
  }

  // XR
  onXRSessionStart() {
    const s = this.renderer.xr.getSession();
    this.isXRMode = true;
    this.isARMode = s.mode === 'immersive-ar';
    this.isVRMode = s.mode === 'immersive-vr';
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
      s.requestReferenceSpace('local-floor')
        .catch(() => s.requestReferenceSpace('viewer'))
        .then(rs => s.requestHitTestSource({ space: rs }))
        .then(src => this.hitTestSource = src);
    }

    if (this.isARMode) {
      this._selectBound = this.onSelectEvent.bind(this);
      s.addEventListener('select', this._selectBound);
    }
  }

  onXRSessionEnd() {
    this.isXRMode = this.isARMode = this.isVRMode = this.isPlacingProduct = false;
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
    Object.assign(this.exitXRButton.style, {
      position: 'absolute', top: '20px', right: '20px',
      padding: '8px 16px', border: 'none', borderRadius: '4px',
      background: '#fff', color: '#000', fontSize: '13px',
      cursor: 'pointer', zIndex: '10000', display: 'none'
    });
    this.exitXRButton.onclick = () => {
      const s = this.renderer.xr.getSession();
      if (s) s.end();
    };
    document.body.appendChild(this.exitXRButton);
  }

  // AR UI
  createPlacementUI() {
    this.placementReticle = new THREE.Group();
    this.placementReticle.scale.set(0.3,0.3,0.3);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.15,0.2,32), new THREE.MeshBasicMaterial({color:0xff0000,side:THREE.DoubleSide}));
    ring.rotation.x = -Math.PI/2;
    this.placementReticle.add(ring);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.05,32), new THREE.MeshBasicMaterial({color:0xff0000,side:THREE.DoubleSide}));
    dot.rotation.x = -Math.PI/2;
    this.placementReticle.add(dot);
    this.placementReticle.visible = false;
    this.scene.add(this.placementReticle);

    this.placementMessage = document.createElement('div');
    Object.assign(this.placementMessage.style, {
      position:'absolute', bottom:'100px', left:'50%', transform:'translateX(-50%)',
      color:'white', fontSize:'20px', zIndex:'10000', display:'none'
    });
    this.placementMessage.textContent = 'Tap to place';
    document.body.appendChild(this.placementMessage);

    this.placeAgainButton = document.createElement('button');
    Object.assign(this.placeAgainButton.style, {
      position:'absolute', bottom:'80px', left:'50%', transform:'translateX(-50%)',
      padding:'8px 16px', border:'none', borderRadius:'4px',
      background:'#fff', color:'#000', fontSize:'13px', cursor:'pointer',
      zIndex:'10000', display:'none'
    });
    this.placeAgainButton.textContent = 'Place Again';
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

    this.createARRotationControls();
  }

  createARRotationControls() {
    this.rotateLeftBtn = document.createElement('button');
    this.rotateLeftBtn.innerHTML = '<i class="fa-solid fa-rotate-left"></i>';
    Object.assign(this.rotateLeftBtn.style, {
      position:'absolute', bottom:'80px', right:'calc(50% + 60px)',
      padding:'8px 16px', border:'none', borderRadius:'4px',
      background:'#fff', color:'#000', fontSize:'13px', cursor:'pointer',
      zIndex:'10000', display:'none'
    });
    this.rotateLeftBtn.onclick = () => this.rotateModel('y', -0.2);
    document.body.appendChild(this.rotateLeftBtn);

    this.rotateRightBtn = document.createElement('button');
    this.rotateRightBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i>';
    Object.assign(this.rotateRightBtn.style, {
      position:'absolute', bottom:'80px', left:'calc(50% + 60px)',
      padding:'8px 16px', border:'none', borderRadius:'4px',
      background:'#fff', color:'#000', fontSize:'13px', cursor:'pointer',
      zIndex:'10000', display:'none'
    });
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
    const ref = this.renderer.xr.getReferenceSpace();
    const hits = frame.getHitTestResults(this.hitTestSource);
    if (!hits.length) return;

    const hit = hits[0];
    const pose = hit.getPose(ref);
    const bbox = new THREE.Box3().setFromObject(this.productGroup);
    const offsetY = bbox.min.y;

    this.productGroup.visible = true;
    this.productGroup.position.set(pose.transform.position.x, pose.transform.position.y - offsetY, pose.transform.position.z);

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

    const s = this.renderer.xr.getSession();
    s.removeEventListener('select', this._selectBound);
  }

  // Browse (fixed URLs)
  showBrowseInterface() {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:15000;';
    const box = document.createElement('div');
    box.style.cssText = 'background:white;padding:30px;border-radius:8px;max-width:90%;text-align:center;';

    box.innerHTML = `<h3 style="margin-bottom:15px;">Browse Demo Models</h3>`;
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:15px;';

    const demos = [
      { name: 'Damaged Helmet', url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/DamagedHelmet/glTF-Binary/DamagedHelmet.glb' },
      { name: 'Fox', url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Fox/glTF-Binary/Fox.glb' },
      { name: 'Flight Helmet', url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/FlightHelmet/glTF/FlightHelmet.gltf' },
    ];

    demos.forEach(d => {
      const card = document.createElement('div');
      card.style.cssText = 'cursor:pointer;padding:10px;border:1px solid #ddd;border-radius:6px;';
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

  showLandingOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'landing-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#ccc;display:flex;align-items:center;justify-content:center;z-index:10000;';
    const box = document.createElement('div');
    box.style.cssText = 'background:white;padding:30px;border-radius:8px;width:320px;text-align:center;';

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
