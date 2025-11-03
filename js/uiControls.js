// uiControls.js

import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { showConfirmationModal } from './modalManager.js';

// Function to detect if we should use compact UI with icons
function shouldUseCompactUI() {
  // Check if it's a mobile device
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  // Check if window is small (less than 768px width)
  const isSmallWindow = window.innerWidth < 768;
  
  return isMobile || isSmallWindow;
}
// Function to update button styles for compact UI
function updateButtonForCompactUI(button, iconClass, tooltip) {
  // Clear existing content and add icon
  button.innerHTML = `<i class="${iconClass}"></i>`;
  button.title = tooltip; // Add tooltip for accessibility
  
  // Make button more compact
  button.style.fontSize = 'larger';
  button.style.padding = '20px';
  button.style.minWidth = 'unset';
  button.style.width = '42px';
  button.style.height = '42px';
  button.style.display = 'flex';
  button.style.alignItems = 'center';
  button.style.justifyContent = 'center';
}

// Create color button
function createColorButton(app) {
  const colorButton = document.createElement('button');
  
  // Check if we should use compact UI
  const useCompactUI = shouldUseCompactUI();
  
  if (useCompactUI) {
    updateButtonForCompactUI(colorButton, "fa-solid fa-palette", "Change Color");
  } else {
    colorButton.textContent = 'Color';
  }
  
  colorButton.style.padding = useCompactUI ? '25px' : '8px 24px';
  colorButton.style.border = 'none';
  colorButton.style.outline = 'none';
  colorButton.style.borderRadius = '9999px';
  colorButton.style.backgroundColor = '#d00024';
  colorButton.style.color = 'white';
  colorButton.style.cursor = 'pointer';
  colorButton.style.transition = 'background-color 0.3s ease, color 0.3s ease';
  
  colorButton.addEventListener('mouseover', () => {
    colorButton.style.backgroundColor = '#b0001d';
  });
  colorButton.addEventListener('mouseout', () => {
    colorButton.style.backgroundColor = app.colorMode ? '#008000' : '#d00024';
  });
  
  colorButton.addEventListener('click', () => {
    app.colorMode = !app.colorMode;
    if (app.colorMode) {
      colorButton.style.backgroundColor = '#008000';
      showConfirmationModal('Click on a part to change its color.');
    } else {
      colorButton.style.backgroundColor = '#d00024';
    }
  });
  
  return colorButton;
}

// Create the UI controls and attach them to the app.
export function setupUIControls(app) {
  // Determine if we should use compact UI (icons instead of text)
  const useCompactUI = shouldUseCompactUI();

  // Create a container for the controls.
  const controlsContainer = document.createElement('div');
  controlsContainer.style.position = 'fixed';
  controlsContainer.style.top = '10px';
  controlsContainer.style.left = '10px';
  controlsContainer.style.zIndex = '1000';
  controlsContainer.style.display = 'flex';
  controlsContainer.style.alignItems = 'center';
  controlsContainer.style.gap = useCompactUI ? '5px' : '10px';

  // ------------------------------
  // Create the Upload button.
  // ------------------------------
  const uploadButton = document.createElement('button');
  if (useCompactUI) {
    updateButtonForCompactUI(uploadButton, "fa-solid fa-file-arrow-up", "Open Model");
  } else {
    uploadButton.textContent = 'Open';
  }
  uploadButton.style.padding = useCompactUI ? '25px' : '8px 24px';
  uploadButton.style.border = 'none';
  uploadButton.style.outline = 'none';
  uploadButton.style.borderRadius = '9999px';
  uploadButton.style.backgroundColor = '#d00024';
  uploadButton.style.color = 'white';
  uploadButton.style.cursor = 'pointer';
  uploadButton.style.transition = 'background-color 0.3s ease, color 0.3s ease';
  
  uploadButton.addEventListener('mouseover', () => {
    uploadButton.style.backgroundColor = '#b0001d';
  });
  uploadButton.addEventListener('mouseout', () => {
    uploadButton.style.backgroundColor = '#d00024';
  });
  
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.glb,.gltf';
  fileInput.style.display = 'none';
  fileInput.multiple = true;
  
  uploadButton.onclick = () => fileInput.click();
  
  // ------------------------------
  // Create the Browse button.
  // ------------------------------
  const browseButton = document.createElement('button');
  if (useCompactUI) {
    updateButtonForCompactUI(browseButton, "fa-solid fa-folder-open", "Browse Models");
  } else {
    browseButton.textContent = 'Browse';
  }
  browseButton.style.padding = useCompactUI ? '25px' : '8px 24px';
  browseButton.style.border = 'none';
  browseButton.style.outline = 'none';
  browseButton.style.borderRadius = '9999px';
  browseButton.style.backgroundColor = '#d00024';
  browseButton.style.color = 'white';
  browseButton.style.cursor = 'pointer';
  browseButton.style.transition = 'background-color 0.3s ease, color 0.3s ease';

  browseButton.addEventListener('mouseover', () => {
    browseButton.style.backgroundColor = '#b0001d';
  });
  browseButton.addEventListener('mouseout', () => {
    browseButton.style.backgroundColor = '#d00024';
  });

  // When clicked, trigger the function that shows the browse interface.
  browseButton.addEventListener('click', () => {
    // Assume app.showBrowseInterface is defined (as in our modified app.js)
    if (app.showBrowseInterface) {
      app.showBrowseInterface();
    } else {
      console.log("Browse interface is not available.");
    }
  });
  
  // ------------------------------
  // Create the Color button
  // ------------------------------
  const colorButton = createColorButton(app);
  
  // ------------------------------
  // Create a Reset button.
  // ------------------------------
  const resetButton = document.createElement('button');
  if (useCompactUI) {
    updateButtonForCompactUI(resetButton, "fa-solid fa-arrows-rotate", "Reset Model");
  } else {
    resetButton.textContent = 'Reset';
  }
  resetButton.style.padding = useCompactUI ? '25px' : '8px 24px';
  resetButton.style.border = 'none';
  resetButton.style.outline = 'none';
  resetButton.style.borderRadius = '9999px';
  resetButton.style.backgroundColor = '#d00024';
  resetButton.style.color = 'white';
  resetButton.style.cursor = 'pointer';
  resetButton.style.transition = 'background-color 0.3s ease, color 0.3s ease';
  
  resetButton.addEventListener('mouseover', () => {
    resetButton.style.backgroundColor = '#b0001d';
  });
  resetButton.addEventListener('mouseout', () => {
    resetButton.style.backgroundColor = '#d00024';
  });
  
  resetButton.onclick = () => {
    // Reset the transformation (position, rotation, and scale) of all parts.
    if (app.productGroup) {
      app.productGroup.children.forEach((child) => {
        child.position.set(0, 0, 0);
        child.rotation.set(0, 0, 0);
        // Reset to the stored original scale or default to (1, 1, 1)
        if (child.children.length > 0 && child.children[0].userData.originalScale) {
          child.scale.copy(child.children[0].userData.originalScale);
        } else {
          child.scale.set(1, 1, 1);
        }
      });
    }
    // Reset the camera/viewport to its initial state.
    if (typeof app.fitCameraToScene === 'function') {
      app.fitCameraToScene();
    }
  };
  
  controlsContainer.appendChild(fileInput);
  controlsContainer.appendChild(uploadButton);
  controlsContainer.appendChild(browseButton);
  controlsContainer.appendChild(colorButton);
  controlsContainer.appendChild(resetButton);

  // ------------------------------
  // Optional: AR and VR Buttons (if supported).
  // ------------------------------
  if ('xr' in navigator) {
    navigator.xr.isSessionSupported('immersive-ar').then(supported => {
      if (supported) {
        const arButton = ARButton.createButton(app.renderer, {
          requiredFeatures: ['hit-test'],
          optionalFeatures: ['dom-overlay'],
          domOverlay: { root: document.body }
        });
        controlsContainer.appendChild(arButton);
      }
    });

    navigator.xr.isSessionSupported('immersive-vr').then(supported => {
      if (supported) {
        const vrButton = VRButton.createButton(app.renderer);
        controlsContainer.appendChild(vrButton);
      }
    });
  }
  
  document.body.appendChild(controlsContainer);
}
