// uiControls.js

import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
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

// Extract all materials from loaded models
function getMaterialsByName(app) {
  const materialMap = new Map();
  
  if (!app.productGroup) return materialMap;
  
  // Traverse through all loaded models
  app.loadedModels.forEach((modelGroup, modelName) => {
    modelGroup.traverse((child) => {
      if (child.isMesh && child.material) {
        let materials = Array.isArray(child.material) ? child.material : [child.material];
        
        materials.forEach(material => {
          // Use a meaningful name: modelName + materialName or material.uuid if no name
          const matName = material.name || material.uuid;
          const fullName = `${matName.charAt(0).toUpperCase()
            + matName.slice(1)} - ${modelName}`;
          
          // Store original color if not already stored
          if (!material.userData.originalColor) {
            material.userData.originalColor = '#' + material.color.getHexString();
          }
          
          // Store with reference to the mesh and material for later updating
          materialMap.set(fullName, {
            model: modelName,
            mesh: child,
            material: material
          });
        });
      }
    });
  });
  
  return materialMap;
}

// Color picker modal
function showMaterialColorPicker(app) {
  // Get materials
  const materialMap = getMaterialsByName(app);
  if (materialMap.size === 0) {
    alert('No colorable parts found in the current model.');
    return;
  }
  
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
  heading.textContent = 'Select Part to Color';
  heading.style.marginTop = '0';
  
  // Create dropdown for materials
  const materialSelect = document.createElement('select');
  materialSelect.style.width = '100%';
  materialSelect.style.padding = '8px';
  materialSelect.style.margin = '15px 0px';
  materialSelect.style.borderRadius = '4px';
  materialSelect.style.border = '1px solid #ccc';
  
  // Add options for all materials
  materialMap.forEach((value, key) => {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = key;
    materialSelect.appendChild(option);
  });
  
  // Color picker section
  const colorPickerWrapper = document.createElement('div');
  
  // Input for the color picker
  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.style.padding = 'revert';
  // colorInput.style.width = '100%';
  colorInput.value = '#ff0000'; // Default red
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
  function updateRecentColorsUI() {
    recentColorsDiv.innerHTML = '';
    
    // Get the current material and its original color
    const selectedMaterialKey = materialSelect.value;
    const materialData = materialMap.get(selectedMaterialKey);
    const originalColor = materialData?.material?.userData?.originalColor;
    
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
      });
      
      recentColorsDiv.appendChild(colorBtn);
    });
  }
  
  // Buttons container
  const buttonsDiv = document.createElement('div');
  buttonsDiv.style.display = 'flex';
  buttonsDiv.style.justifyContent = 'space-between';
  
  // Apply button
  const applyBtn = document.createElement('button');
  applyBtn.textContent = 'Apply';
  applyBtn.style.backgroundColor = '#d00024';
  applyBtn.style.color = 'white';
  applyBtn.style.border = 'none';
  applyBtn.style.borderRadius = '9999px';
  applyBtn.style.padding = '8px 24px';
  applyBtn.style.cursor = 'pointer';
  
  applyBtn.addEventListener('click', () => {
    const selectedMaterialKey = materialSelect.value;
    const colorValue = colorInput.value;
    
    // Apply the color
    applyColorToMaterial(app, materialMap, selectedMaterialKey, colorValue);
    
    // Save to recent colors
    addRecentColor(colorValue);
    
    // Close the modal
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
  
  cancelBtn.addEventListener('click', () => {
    document.body.removeChild(overlay);
  });
  
  // Assemble the modal
  buttonsDiv.appendChild(cancelBtn);
  buttonsDiv.appendChild(applyBtn);
  
  colorPickerWrapper.appendChild(colorInput);
  
  modal.appendChild(heading);
  modal.appendChild(materialSelect);
  modal.appendChild(colorPickerWrapper);
  modal.appendChild(recentColorsHeading);
  modal.appendChild(recentColorsDiv);
  modal.appendChild(buttonsDiv);
  
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  
  // Set the initial color based on the selected material
  updateColorFromSelectedMaterial(materialMap, materialSelect, colorInput);
  
  // Update recent colors UI initially
  updateRecentColorsUI();
  
  // Update when material changes
  materialSelect.addEventListener('change', () => {
    updateColorFromSelectedMaterial(materialMap, materialSelect, colorInput);
    updateRecentColorsUI();
  });
}

// Function to update color input based on selected material
function updateColorFromSelectedMaterial(materialMap, materialSelect, colorInput) {
  const selectedMaterialKey = materialSelect.value;
  const materialData = materialMap.get(selectedMaterialKey);
  
  if (materialData && materialData.material && materialData.material.color) {
    // Convert Three.js color to hex
    const color = '#' + materialData.material.color.getHexString();
    colorInput.value = color;
  }
}

// Function to apply color to selected material
function applyColorToMaterial(app, materialMap, materialKey, colorValue) {
  const materialData = materialMap.get(materialKey);
  
  if (materialData && materialData.material) {
    // Convert hex to RGB
    const color = new THREE.Color(colorValue);
    materialData.material.color.set(color);
  }
}

// Functions to manage recent colors
function getRecentColors() {
  try {
    const storedColors = localStorage.getItem('recentColors');
    return storedColors ? JSON.parse(storedColors) : [];
  } catch (e) {
    console.error('Error loading recent colors:', e);
    return [];
  }
}

function addRecentColor(color) {
  try {
    let recentColors = getRecentColors();
    
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
    colorButton.style.backgroundColor = '#d00024';
  });
  
  colorButton.addEventListener('click', () => {
    showMaterialColorPicker(app);
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
  // Optional: AR Button (if supported).
  // ------------------------------
  if ('xr' in navigator) {
    const arButton = ARButton.createButton(app.renderer, {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: document.body }
    });
    arButton.style.position = 'fixed';
    controlsContainer.appendChild(arButton);
  }
  
  document.body.appendChild(controlsContainer);
}