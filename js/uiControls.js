import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { showConfirmationModal } from './modalManager.js';

function isCompact() {
  return /Mobi|Android|iPhone|iPad|iPod/.test(navigator.userAgent) || window.innerWidth < 768;
}

function iconBtn(icon, title) {
  const b = document.createElement('button');
  b.innerHTML = `<i class="${icon}"></i>`;
  b.title = title;
  b.style.cssText = 'width:42px;height:42px;display:flex;align-items:center;justify-content:center;font-size:1.4rem;padding:0;border:none;border-radius:9999px;background:#d00024;color:white;cursor:pointer;';
  return b;
}

function textBtn(text) {
  const b = document.createElement('button');
  b.textContent = text;
  b.style.cssText = 'padding:8px 24px;border:none;border-radius:9999px;background:#d00024;color:white;cursor:pointer;';
  return b;
}

export function showMaterialColorPicker(app) {
  if (!app.selectedMaterial) { alert('Tap a part first.'); return; }
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:20000;';
  const modal = document.createElement('div');
  modal.style.cssText = 'background:white;padding:20px;border-radius:8px;width:320px;';

  const title = document.createElement('h3'); title.textContent = 'Edit Colour'; title.style.margin = '0 0 15px';
  const picker = document.createElement('input'); picker.type = 'color';
  picker.value = '#' + app.selectedMaterial.color.getHexString();
  picker.style.cssText = 'width:100%;height:50px;margin-bottom:15px;';
  picker.addEventListener('input', () => app.selectedMaterial.color.set(picker.value));

  const recentDiv = document.createElement('div');
  recentDiv.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:15px;';
  const orig = app.selectedMaterial.userData.originalColor;
  if (orig) {
    const ob = document.createElement('button');
    ob.style.cssText = 'width:30px;height:30px;background:'+orig+';border:1px solid #ccc;border-radius:4px;';
    ob.onclick = () => picker.value = orig;
    recentDiv.appendChild(ob);
  }
  JSON.parse(localStorage.getItem('recentColors')||'[]').forEach(c => {
    const rb = document.createElement('button');
    rb.style.cssText = 'width:30px;height:30px;background:'+c+';border:1px solid #ccc;border-radius:4px;';
    rb.onclick = () => picker.value = c;
    recentDiv.appendChild(rb);
  });

  const btns = document.createElement('div');
  btns.style.cssText = 'display:flex;justify-content:space-between;';
  const cancel = document.createElement('button');
  cancel.textContent = 'Cancel'; cancel.style.cssText = 'background:#999;color:white;border:none;border-radius:9999px;padding:8px 20px;';
  cancel.onclick = () => {
    app.selectedMaterial.color.set(app.selectedMaterial.userData.originalColor || '#ffffff');
    app.selectedMaterial.emissive.copy(app.selectedMaterial.userData._tempEmissive);
    document.body.removeChild(overlay);
    app.selectedMaterial = null;
  };
  const apply = document.createElement('button');
  apply.textContent = 'Apply'; apply.style.cssText = 'background:#d00024;color:white;border:none;border-radius:9999px;padding:8px 20px;';
  apply.onclick = () => {
    const arr = JSON.parse(localStorage.getItem('recentColors')||'[]').filter(x=>x!==picker.value);
    arr.unshift(picker.value); localStorage.setItem('recentColors', JSON.stringify(arr.slice(0,6)));
    app.selectedMaterial.userData.originalColor = picker.value;
    app.selectedMaterial.emissive.copy(app.selectedMaterial.userData._tempEmissive);
    document.body.removeChild(overlay);
    app.selectedMaterial = null;
  };
  btns.append(cancel, apply);
  modal.append(title, picker, document.createElement('h4').appendChild(document.createTextNode('Recent')), recentDiv, btns);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

function createColorButton(app) {
  const compact = isCompact();
  const btn = compact ? iconBtn('fa-solid fa-palette', 'Select part to colour') : textBtn('Colour');
  btn.onclick = () => {
    app.selectionMode = !app.selectionMode;
    if (compact) {
      btn.innerHTML = app.selectionMode ? '<i class="fa-solid fa-ban"></i>' : '<i class="fa-solid fa-palette"></i>';
      btn.title = app.selectionMode ? 'Cancel' : 'Select part to colour';
    } else {
      btn.textContent = app.selectionMode ? 'Cancel' : 'Colour';
    }
    if (app.selectionMode) showConfirmationModal('Tap a part to change its colour.');
  };
  return btn;
}

export function setupUIControls(app) {
  const compact = isCompact();
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;top:10px;left:10px;z-index:1000;display:flex;gap:'+(compact?'5px':'10px')+';align-items:center;';

  const uploadBtn = compact ? iconBtn('fa-solid fa-file-arrow-up', 'Open model') : textBtn('Open');
  const fileInput = document.createElement('input');
  fileInput.type = 'file'; fileInput.accept = '.glb,.gltf'; fileInput.multiple = true; fileInput.style.display = 'none';
  uploadBtn.onclick = () => fileInput.click();
  container.appendChild(fileInput);
  container.appendChild(uploadBtn);

  const browseBtn = compact ? iconBtn('fa-solid fa-folder-open', 'Browse demos') : textBtn('Browse');
  browseBtn.onclick = () => app.showBrowseInterface();
  container.appendChild(browseBtn);

  container.appendChild(createColorButton(app));

  const resetBtn = compact ? iconBtn('fa-solid fa-arrows-rotate', 'Reset') : textBtn('Reset');
  resetBtn.onclick = () => {
    if (app.productGroup) {
      app.productGroup.traverse(c => { c.position.set(0,0,0); c.rotation.set(0,0,0); c.scale.set(1,1,1); });
    }
    app.fitCameraToScene();
  };
  container.appendChild(resetBtn);

  if ('xr' in navigator) {
    navigator.xr.isSessionSupported('immersive-ar').then(ar => {
      navigator.xr.isSessionSupported('immersive-vr').then(vr => {
        if (ar || vr) {
          const xrBtn = ARButton.createButton(app.renderer, { optionalFeatures: ['local-floor','bounded-floor','hand-tracking'] });
          xrBtn.style.marginLeft = '8px';
          xrBtn.textContent = 'Enter XR';
          container.appendChild(xrBtn);
        }
      });
    });
  }

  document.body.appendChild(container);
}
