/**
 * FilterManager - Manages graph filtering and view presets
 * 
 * Handles two types of filtering:
 * 1. Parent visibility: Show/hide entire parent groups
 * 2. Isolated nodes: Remove nodes with no edges (degree = 0)
 * 
 * Also manages:
 * - Parent sidebar with checkboxes and color swatches
 * - Color customization per parent
 * - Filter presets saved to localStorage
 * 
 * The cache-rebuild-restore cycle:
 * Every filter operation follows this pattern to preserve node positions:
 * 1. Cache current positions (state.cacheNodePositions)
 * 2. Rebuild graph with new filters (state.rebuildFilteredGraph)
 * 3. Restore cached positions (state.restoreNodePositions)
 * 4. Refresh renderer
 * 
 * This ensures smooth transitions when toggling filters.
 * 
 * @class
 */
class FilterManager {
  /**
   * @param {GraphState} state - Shared graph state instance
   * @param {RenderManager} renderManager - Render manager for refresh operations
   */
  constructor(state, renderManager) {
    this.state = state;
    this.renderManager = renderManager;
    
    /** @type {string} localStorage key for filter presets */
    this.presetsStorageKey = 'filterPresets';
  }

  /**
   * Bind filter-related UI controls
   * 
   * Sets up:
   * - Remove isolated nodes checkbox
   * - Preset selector, save, and delete buttons
   * - Select all / Deselect all buttons
   */
  bindControls() {
    this.bindIsolatedNodesFilter();
    this.bindPresetControls();
    this.bindSelectAllControls();
  }

  /**
   * Bind the "Remove isolated nodes" checkbox
   * 
   * When toggled, rebuilds the graph with or without isolated nodes.
   * Uses epicenter-based positioning for newly visible nodes.
   */
  bindIsolatedNodesFilter() {
    const removeIsolatedCheckbox = document.getElementById('remove-isolated');
    if (!removeIsolatedCheckbox) return;
    
    removeIsolatedCheckbox.addEventListener('change', () => {
      if (!this.state.graph) return;
      
      // Cache current positions
      this.state.cacheNodePositions();
      
      // Rebuild graph with current filters
      const removeIsolated = removeIsolatedCheckbox.checked;
      this.state.rebuildFilteredGraph(removeIsolated);
      
      // Initialize positions for nodes that don't have them
      // Using epicenter method based on parent
      this.state.forEachNode((node, attrs) => {
        if (attrs.x === undefined || attrs.y === undefined) {
          const position = this.calculateEpicenterPosition(attrs.parent);
          this.state.setNodeAttribute(node, 'x', position.x);
          this.state.setNodeAttribute(node, 'y', position.y);
        }
      });
      
      // Restore cached positions for existing nodes
      this.state.restoreNodePositions();
      
      // Cache the new positions
      this.state.cacheNodePositions();
      
      this.renderManager.refresh();
    });
  }

  /**
   * Bind the Select All / Deselect All buttons
   * 
   * Provides quick controls to show or hide all parent groups at once.
   */
  bindSelectAllControls() {
    const selectAllBtn = document.getElementById('select-all-parents');
    const deselectAllBtn = document.getElementById('deselect-all-parents');
    
    if (selectAllBtn) {
      selectAllBtn.addEventListener('click', () => {
        this.selectAllParents();
      });
    }
    
    if (deselectAllBtn) {
      deselectAllBtn.addEventListener('click', () => {
        this.deselectAllParents();
      });
    }
  }

  /**
   * Select (show) all parent groups
   */
  selectAllParents() {
    if (!this.state.graph) return;
    
    const parents = this.state.getParents();
    parents.forEach(parent => {
      this.state.visibleParents.add(parent);
    });
    
    this.rebuildAndRefresh();
  }

  /**
   * Deselect (hide) all parent groups
   */
  deselectAllParents() {
    if (!this.state.graph) return;
    
    this.state.visibleParents.clear();
    this.rebuildAndRefresh();
  }

  /**
   * Helper method to rebuild graph and refresh display
   * Used by select/deselect all operations
   */
  rebuildAndRefresh() {
    this.state.cacheNodePositions();
    
    const removeIsolatedCheckbox = document.getElementById('remove-isolated');
    const removeIsolated = removeIsolatedCheckbox ? removeIsolatedCheckbox.checked : false;
    this.state.rebuildFilteredGraph(removeIsolated);
    
    this.state.restoreNodePositions();
    this.renderManager.refresh();
    this.populateParentSidebar();
  }

  /**
   * Calculate epicenter position for a parent
   * 
   * Parents are arranged in a circle around the origin. Each parent's
   * epicenter is a point on this circle. New nodes get placed near their
   * parent's epicenter with a small random offset.
   * 
   * @param {string} parent - Parent name
   * @returns {{x: number, y: number}} Position near parent's epicenter
   */
  calculateEpicenterPosition(parent) {
    const parents = this.state.getParents();
    const parentIndex = parents.indexOf(parent);
    
    if (parentIndex === -1) {
      // Unknown parent: place at origin
      return { x: 0, y: 0 };
    }
    
    const parentCount = parents.length;
    const radius = 100; // Distance of epicenters from origin
    const angle = (2 * Math.PI * parentIndex) / parentCount;
    
    const epicenterX = radius * Math.cos(angle);
    const epicenterY = radius * Math.sin(angle);
    
    // Add small random offset to avoid exact overlap
    const offset = 10;
    return {
      x: epicenterX + (Math.random() - 0.5) * offset,
      y: epicenterY + (Math.random() - 0.5) * offset
    };
  }

  /**
   * Populate the parent sidebar with toggles and color swatches
   * 
   * For each parent, displays:
   * - Checkbox for visibility toggle
   * - Color swatch (clickable to change color)
   * - Parent name
   * - Node count (from fullGraph, not filtered count)
   */
  populateParentSidebar() {
    const parentList = document.getElementById('parent-list');
    if (!parentList) return;
    
    const parents = this.state.getParents();
    const parentColorMap = this.state.getParentColorMap();
    
    // Count nodes per parent from fullGraph (total count, not filtered)
    const parentCounts = {};
    parents.forEach(parent => parentCounts[parent] = 0);
    
    this.state.forEachFullGraphNode((node, attrs) => {
      if (attrs.parent && parentCounts[attrs.parent] !== undefined) {
        parentCounts[attrs.parent]++;
      }
    });
    
    // Clear existing content
    parentList.innerHTML = '';
    
    // Create parent items
    parents.forEach(parent => {
      const item = this.createParentItem(parent, parentColorMap[parent] || '#666666', parentCounts[parent] || 0);
      parentList.appendChild(item);
    });
  }

  /**
   * Create a single parent sidebar item
   * 
   * @param {string} parent - Parent name
   * @param {string} color - Hex color for this parent
   * @param {number} count - Number of nodes in this parent
   * @returns {HTMLElement} DOM element for the parent item
   */
  createParentItem(parent, color, count) {
    const item = document.createElement('div');
    item.className = 'parent-item';
    
    // Checkbox for visibility toggle
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'parent-checkbox';
    checkbox.checked = this.state.visibleParents.has(parent);
    checkbox.title = 'Toggle visibility';
    checkbox.addEventListener('change', () => {
      this.toggleParentVisibility(parent, checkbox.checked);
    });
    
    // Color swatch (clickable)
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch';
    swatch.style.backgroundColor = color;
    swatch.title = 'Click to change color';
    swatch.addEventListener('click', () => {
      this.openColorPicker(parent, color);
    });
    
    // Parent info (name and count)
    const info = document.createElement('div');
    info.className = 'parent-info';
    
    const name = document.createElement('div');
    name.className = 'parent-name';
    name.textContent = parent;
    
    const countLabel = document.createElement('div');
    countLabel.className = 'parent-count';
    countLabel.textContent = `${count} node${count !== 1 ? 's' : ''}`;
    
    info.appendChild(name);
    info.appendChild(countLabel);
    
    item.appendChild(checkbox);
    item.appendChild(swatch);
    item.appendChild(info);
    
    return item;
  }

  /**
   * Toggle visibility of a parent group
   * 
   * Follows the cache-rebuild-restore cycle to preserve positions.
   * The force layout (if running) continues automatically with the new graph.
   * 
   * @param {string} parent - Parent to toggle
   * @param {boolean} visible - Whether to show (true) or hide (false)
   */
  toggleParentVisibility(parent, visible) {
    this.state.toggleParentVisibility(parent, visible);
    
    // Cache-rebuild-restore cycle
    this.state.cacheNodePositions();
    
    const removeIsolatedCheckbox = document.getElementById('remove-isolated');
    const removeIsolated = removeIsolatedCheckbox ? removeIsolatedCheckbox.checked : false;
    this.state.rebuildFilteredGraph(removeIsolated);
    
    this.state.restoreNodePositions();
    
    this.renderManager.refresh();
    
    // Update parent counts in sidebar (visible node counts may have changed)
    this.populateParentSidebar();
  }

  /**
   * Open native color picker for a parent
   * 
   * Creates a temporary hidden <input type="color"> element, triggers it,
   * and updates the parent color if the user selects a new one.
   * 
   * @param {string} parent - Parent to change color for
   * @param {string} currentColor - Current hex color
   */
  openColorPicker(parent, currentColor) {
    const input = document.createElement('input');
    input.type = 'color';
    input.value = currentColor;
    input.style.position = 'absolute';
    input.style.opacity = '0';
    document.body.appendChild(input);
    
    input.addEventListener('change', (e) => {
      const newColor = e.target.value;
      this.updateParentColor(parent, newColor);
      document.body.removeChild(input);
    });
    
    input.addEventListener('blur', () => {
      // Clean up if user cancels
      setTimeout(() => {
        if (document.body.contains(input)) {
          document.body.removeChild(input);
        }
      }, 100);
    });
    
    input.click();
  }

  /**
   * Update color for all nodes of a parent
   * 
   * @param {string} parent - Parent to update
   * @param {string} newColor - New hex color
   */
  updateParentColor(parent, newColor) {
    // Update the color map
    const parentColorMap = this.state.getParentColorMap();
    parentColorMap[parent] = newColor;
    this.state.setParentColorMap(parentColorMap);
    
    // Update all nodes with this parent
    this.state.forEachNode((node, attrs) => {
      if (attrs.parent === parent) {
        this.state.setNodeAttribute(node, 'color', newColor);
      }
    });
    
    this.renderManager.refresh();
    
    // Update the sidebar display
    this.populateParentSidebar();
  }

  /**
   * Bind preset management controls
   * 
   * Presets store:
   * - visibleParents: Array of visible parent names
   * - removeIsolated: Boolean for isolated node filter
   * - timestamp: ISO string for when preset was saved
   */
  bindPresetControls() {
    const presetSelect = document.getElementById('preset-select');
    const presetName = document.getElementById('preset-name');
    const saveBtn = document.getElementById('save-preset');
    const deleteBtn = document.getElementById('delete-preset');
    
    if (!presetSelect || !presetName || !saveBtn || !deleteBtn) return;
    
    // Load presets into dropdown
    this.refreshPresetList();
    
    // Load preset when selected
    presetSelect.addEventListener('change', () => {
      if (presetSelect.value) {
        this.loadPreset(presetSelect.value);
        // Put the preset name in the input field for easy editing
        presetName.value = presetSelect.value;
      }
    });
    
    // Save current filter state as preset
    saveBtn.addEventListener('click', () => {
      const name = presetName.value.trim();
      if (!name) {
        alert('Please enter a preset name');
        return;
      }
      this.savePreset(name);
    });
    
    // Delete selected preset
    deleteBtn.addEventListener('click', () => {
      if (presetSelect.value) {
        if (confirm(`Delete preset "${presetSelect.value}"?`)) {
          this.deletePreset(presetSelect.value);
        }
      }
    });
  }

  /**
   * Refresh the preset dropdown list
   */
  refreshPresetList() {
    const presetSelect = document.getElementById('preset-select');
    if (!presetSelect) return;
    
    const presets = this.getPresets();
    
    // Clear and repopulate
    presetSelect.innerHTML = '<option value="">-- Select Preset --</option>';
    Object.keys(presets).sort().forEach(name => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      presetSelect.appendChild(option);
    });
  }

  /**
   * Save current filter state as a preset
   * 
   * Preset schema:
   * {
   *   visibleParents: string[],
   *   removeIsolated: boolean,
   *   timestamp: string (ISO)
   * }
   * 
   * @param {string} name - Preset name
   */
  savePreset(name) {
    const presets = this.getPresets();
    const removeIsolatedCheckbox = document.getElementById('remove-isolated');
    
    presets[name] = {
      visibleParents: Array.from(this.state.visibleParents),
      removeIsolated: removeIsolatedCheckbox ? removeIsolatedCheckbox.checked : true,
      timestamp: new Date().toISOString()
    };
    
    localStorage.setItem(this.presetsStorageKey, JSON.stringify(presets));
    this.refreshPresetList();
    
    // Select the newly saved preset
    const presetSelect = document.getElementById('preset-select');
    if (presetSelect) {
      presetSelect.value = name;
    }
  }

  /**
   * Load a preset and apply its filter state
   * 
   * @param {string} name - Preset name
   */
  loadPreset(name) {
    const presets = this.getPresets();
    const preset = presets[name];
    if (!preset) return;
    
    // Update visible parents
    this.state.visibleParents = new Set(preset.visibleParents);
    
    // Update remove isolated checkbox
    const removeIsolatedCheckbox = document.getElementById('remove-isolated');
    if (removeIsolatedCheckbox) {
      removeIsolatedCheckbox.checked = preset.removeIsolated !== undefined ? preset.removeIsolated : true;
    }
    
    // Cache-rebuild-restore cycle
    this.state.cacheNodePositions();
    this.state.rebuildFilteredGraph(preset.removeIsolated);
    this.state.restoreNodePositions();
    
    this.renderManager.refresh();
    
    // Update sidebar checkboxes
    this.populateParentSidebar();
  }

  /**
   * Delete a preset
   * 
   * @param {string} name - Preset name
   */
  deletePreset(name) {
    const presets = this.getPresets();
    delete presets[name];
    localStorage.setItem(this.presetsStorageKey, JSON.stringify(presets));
    this.refreshPresetList();
  }

  /**
   * Get all presets from localStorage
   * 
   * @returns {Object.<string, Object>} Map of preset names to preset objects
   */
  getPresets() {
    const stored = localStorage.getItem(this.presetsStorageKey);
    return stored ? JSON.parse(stored) : {};
  }

  /**
   * Apply initial filter state after graph load
   * 
   * This is called during initialization to respect the checkbox state
   * for removing isolated nodes.
   */
  applyInitialFilters() {
    const removeIsolatedCheckbox = document.getElementById('remove-isolated');
    if (removeIsolatedCheckbox && removeIsolatedCheckbox.checked) {
      this.state.rebuildFilteredGraph(true);
      this.renderManager.refresh();
    }
  }
}
