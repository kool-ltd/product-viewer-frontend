import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { showConfirmationModal } from './modalManager.js';

// ---------------------------------------------------------------
// Compact UI detection
// ---------------------------------------------------------------
function shouldUseCompactUI() {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isSmall = window.innerWidth < 768;
  return isMobile || isSmall;
}
function updateButtonForCompactUI(btn, icon, tooltip) {
  btn.innerHTML = `<i class="${icon}"></i>`;
  btn.title = tooltip;
  btn.style.fontSize = 'larger';
  btn.style.padding = '20px';
  btn.style.minWidth = 'unset';
  btn.style.width = '42px';
  btn.style.height = '42px';
  btn.style.display = 'flex';
  btn.style.alignItems = 'center';
  btn.style.justifyContent = 'center';
}

// ---------------------------------------------------------------
// Recent colours (localStorage)
// ---------------------------------------------------------------
function getRecentColors() {
  try { return JSON.parse(localStorage.getItem('recentColors') || '[]'); }
  catch { return []; }
}
function addRecentColor(c) {
  let arr = getRecentColors().filter(x => x !== c);
  arr.unshift(c);
  arr = arr.slice(0, 6);
  localStorage.setItem('recentColors', JSON.stringify(arr));
}

// ---------------------------------------------------------------
// Colour picker modal (tap-to-select version)
// ---------------------------------------------------------------
export function showMaterialColorPicker(app) {
  if (!app.selectedMaterial) {
    alert('Tap a part on the model to select it first.');
    return;
  }

  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.top = '0'; overlay.style.left = '0';
  overlay.style.width = '100%'; overlay.style.height = '100%';
  overlay.style.background = 'rgba(0,0,0,0.5)';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.zIndex = '20000';

  const modal = document.createElement('div');
  modal.style.background = 'white';
  modal.style.padding = '20px';
  modal.style.borderRadius = '8px';
  modal.style.width = '320px';

  const title = document.createElement('h3');
  title.textContent = 'Edit Colour';
  title.style.margin = '0 0 15px';

  const picker = document.createElement('input');
  picker.type = 'color';
  picker.value = '#' + app.selectedMaterial.color.getHexString();
  picker.style.width = '100%';
  picker.style.height = '50px';
  picker.style.marginBottom = '15px';

  // Live preview
  picker.addEventListener('input', () => {
    const col = new THREE.Color(picker.value);
    app.selectedMaterial.color.set(col);
  });

  // Recent colours
  const recentHead = document.createElement('h4');
  recentHead.textContent = 'Recent';
  recentHead.style.margin = '10px 0 5px';

  const recentDiv = document.createElement('div');
  recentDiv.style.display = 'flex';
  recentDiv.style.gap = '6px';
  recentDiv.style.flexWrap = 'wrap';
  recentDiv.style.marginBottom = '15px';

  function fillRecent() {
    recentDiv.innerHTML = '';
    const orig = app.selectedMaterial.userData.originalColor;
    if (orig) {
      const b = document.createElement('button');
      b.style.width = b.style.height = '30px';
      b.style.background = orig;
      b.style.border = '1px solid #ccc';
      b.style.borderRadius = '4px';
      b.title = 'Original';
      b.onclick = () => picker.value = orig;
      recentDiv.appendChild(b);
    }
    getRecentColors().forEach(c => {
      const b = document.createElement('button');
      b.style.width = b.style.height = '30px';
      b.style.background = c;
      b.style.border = '1px solid #ccc';
      b.style.borderRadius = '4px';
      b.onclick = () => picker.value = c;
      recentDiv.appendChild(b);
    });
  }
  fillRecent();

  // Buttons
  const btns = document.createElement('div');
  btns.style.display = 'flex';
  btns.style.justifyContent = 'space-between';

  const cancel = document.createElement('button');
  cancel.textContent = 'Cancel';
  cancel.style.background = '#999';
  cancel.style.color = 'white';
  cancel.style.border = 'none';
  cancel.style.borderRadius = '9999px';
  cancel.style.padding = '8px 20px';
  cancel.onclick = () => {
    // revert
    const orig = app.selectedMaterial.userData.originalColor || '#ffffff';
    app.selectedMaterial.color.set(new THREE.Color(orig));
    app.selectedMaterial.emissive.copy(app.selectedMaterial.userData._tempEmissive);
    document.body.removeChild(overlay);
    app.selectedMaterial = null;
  };

  const apply = document.createElement('button');
  apply.textContent = 'Apply';
  apply.style.background = '#d00024';
  apply.style.color = 'white';
  apply.style.border = 'none';
  apply.style.borderRadius = '9999px';
  apply.style.padding = '8px 20px';
  apply.onclick = () => {
    addRecentColor(picker.value);
    app.selectedMaterial.userData.originalColor = picker.value;
    app.selectedMaterial.emissive.copy(app.selectedMaterial.userData._tempEmissive);
    document.body.removeChild(overlay);
    app.selectedMaterial = null;
  };

  btns.append(cancel, apply);
  modal.append(title, picker, recentHead, recentDiv, btns);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

// ---------------------------------------------------------------
// Colour button (toggles selection mode)
// ---------------------------------------------------------------
function createColorButton(app) {
  const btn = document.createElement('button');
  const compact = shouldUseCompactUI();
  if (compact) updateButtonForCompactUI(btn, 'fa-solid fa-palette', 'Select part to colour');
  else btn.textContent = 'Colour';

  btn.style.padding = compact ? '25px' : '8px 24px';
  btn.style.border = 'none';
  btn.style.borderRadius = '9999px';
  btn.style.backgroundColor = '#d00024';
  btn.style.color = 'white';
  btn.style.cursor = 'pointer';
  btn.style.transition = 'background 0.3s';

  btn.addEventListener('mouseover', () => btn.style.backgroundColor = '#b0001d');
  btn.addEventListener('mouseout', () => btn.style.backgroundColor = '#d00024');

  btn.addEventListener('click', () => {
    app.selectionMode = !app.selectionMode;
    if (compact) {
      btn.innerHTML = app.selectionMode ? '<i class="fa-solid fa-ban"></i>' : '<i class="fa-solid fa-palette"></i>';
      btn.title = app.selectionMode ? 'Cancel selection' : 'Select part to colour';
    } else {
      btn.textContent = app.selectionMode ? 'Cancel' : 'Colour';
    }
    if (app.selectionMode) showConfirmationModal('Tap a part on the model to change its colour.');
  });

  return btn;
}

// ---------------------------------------------------------------
// Full UI setup
// ---------------------------------------------------------------
export function setupUIControls(app) {
  const compact = shouldUseCompactUI();

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '10px';
  container.style.left = '10px';
  container.style.zIndex = '1000';
  container.style.display = 'flex';
  container.style.gap = compact ? '5px' : '10px';
  container.style.alignItems = 'center';

  // ---- Upload ----
  const uploadBtn = document.createElement('button');
  if (compact) updateButtonForCompactUI(uploadBtn, 'fa-solid fa-file-arrow-up', 'Open model');
  else uploadBtn.textContent = 'Open';
  uploadBtn.style.padding = compact ? '25px' : '8px 24px';
  uploadBtn.style.border = 'none';
  uploadBtn.style.borderRadius = '9999px';
  uploadBtn.style.backgroundColor = '#d00024';
  uploadBtn.style.color = 'white';
  uploadBtn.style.cursor = 'pointer';
  uploadBtn.style.transition = 'background 0.3s';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.glb,.gltf';
  fileInput.multiple = true;
  fileInput.style.display = 'none';
  uploadBtn.onclick = () => fileInput.click();
  container.appendChild(fileInput);
  container.appendChild(uploadBtn);

  // ---- Browse ----
  const browseBtn = document.createElement('button');
  if (compact) updateButtonForCompactUI(browseBtn, 'fa-solid fa-folder-open', 'Browse demos');
  else browseBtn.textContent = 'Browse';
  browseBtn.style.padding = compact ? '25px' : '8px 24px';
  browseBtn.style.border = 'none';
  browseBtn.style.borderRadius = '9999px';
  browseBtn.style.backgroundColor = '#d00024';
  browseBtn.style.color = 'white';
  browseBtn.style.cursor = 'pointer';
  browseBtn.style.transition = 'background 0.3s';
  browseBtn.onclick = () => app.showBrowseInterface();
  container.appendChild(browseBtn);

  // ---- Colour ----
  container.appendChild(createColorButton(app));

  // ---- Reset ----
  const resetBtn = document.createElement('button');
  if (compact) updateButtonForCompactUI(resetBtn, 'fa-solid fa-arrows-rotate', 'Reset');
  else resetBtn.textContent = 'Reset';
  resetBtn.style.padding = compact ? '25px' : '8px 24px';
  resetBtn.style.border = 'none';
  resetBtn.style.borderRadius = '9999px';
  resetBtn.style.backgroundColor = '#d00024';
  resetBtn.style.color = 'white';
  resetBtn.style.cursor = 'pointer';
  resetBtn.style.transition = 'background 0.3s';
  resetBtn.onclick = () => {
    if (app.productGroup) {
      app.productGroup.children.forEach(child => {
        child.position.set(0, 0, 0);
        child.rotation.set(0, 0, 0);
        child.scale.set(1, 1, 1);
      });
    }
    app.fitCameraToScene();
  };
  container.appendChild(resetBtn);

  // ---- XR (AR / VR) ----
  if ('xr' in navigator) {
    navigator.xr.isSessionSupported('immersive-ar').then(arOk => {
      navigator.xr.isSessionSupported('immersive-vr').then(vrOk => {
        if (arOk || vrOk) {
          const xrBtn = ARButton.createButton(app.renderer, {
            optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
            domOverlay: { root: document.body }
          });
          xrBtn.style.marginLeft = '8px';
          xrBtn.textContent = 'Enter XR';
          container.appendChild(xrBtn);
        }
      });
    });
  }

  document.body.appendChild(container);
}
