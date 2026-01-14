class GraphViewer {
  constructor() {
    this.renderer = null;
    this.camera = null;
    this.graph = null;
    this.fullGraph = null; // Complete backup with ALL nodes
    this.nodePositions = {}; // Position cache for all nodes (visible + hidden)
    this.visibleParents = new Set(); // Set of currently visible parent names
    this.searchQuery = ''; // Current search query
    this.searchDebounceTimer = null; // Debounce timer for search
    this.matchingNodes = new Set(); // Nodes matching current search
    this.layoutRunning = false;
    this.isInitialized = false;
    this.loadedFilename = null;
    this.completedIterations = 0;
    this.targetIterations = 0;
    this.forceLayout = new GraphForce();
    
    // Load theme preference, default to light mode
    const savedTheme = localStorage.getItem('theme');
    this.isDarkMode = savedTheme ? savedTheme === 'dark' : false;
    
    // Bind file selector and theme toggle immediately
    this.bindFileSelector();
    this.bindThemeToggle();
    this.bindStartButton();
    this.bindResetButton();
    this.bindPresetControls();
    this.bindSearchControls();
  }

  cleanState() {
    this.layoutRunning = false;
    this.completedIterations = 0;
    this.targetIterations = 0;
    
    if (this.renderer) {
      this.renderer.kill();
      this.renderer = null;
    }
    
    this.graph = null;
    this.fullGraph = null;
    this.nodePositions = {};
    this.visibleParents = new Set();
    this.searchQuery = '';
    this.matchingNodes = new Set();
    this.camera = null;
    
    this.updateUI('Loading...', 'Start');
  }

  async initialize(gexfContent) {
    try {
      // Clean up previous state if reloading
      if (this.isInitialized) {
        this.cleanState();
      }
      
      this.graph = GexfParser.parse(gexfContent);
      
      // Store a complete backup of the full graph
      this.fullGraph = this.graph.copy();
      
      // Initialize all parents as visible
      const parents = this.graph.getAttribute('parents') || [];
      this.visibleParents = new Set(parents);
      
      // Initialize nodes with random positions
      this.initializeNodePositions();
      
      // Cache initial positions
      this.cacheNodePositions();
      
      // Setup Sigma first so we can render during layout
      this.setupSigma(this.graph);
      
      if (!this.isInitialized) {
        this.bindControls();
        this.isInitialized = true;
      }
      
      this.bindHoverEvents();
      
      // Populate parent sidebar
      this.populateParentSidebar();
      
      // Apply initial filter state (remove isolated nodes if checkbox is checked)
      const removeIsolatedCheckbox = document.getElementById('remove-isolated');
      if (removeIsolatedCheckbox && removeIsolatedCheckbox.checked) {
        this.rebuildFilteredGraph();
        this.renderer.refresh();
      }
      
      // Clear search on new graph load
      const searchInput = document.getElementById('search-input');
      if (searchInput) {
        searchInput.value = '';
        this.performSearch('');
      }
      
      this.updateUI('Ready');
      
    } catch (error) {
      console.error('Failed to initialize graph viewer:', error);
      this.updateUI('Error loading file');
    }
  }

  initializeNodePositions() {
    const parents = this.graph.getAttribute('parents') || [];
    const parentCount = parents.length;
    
    if (parentCount === 0) {
      // Fallback to random if no parents
      const nodes = this.graph.nodes();
      nodes.forEach(node => {
        this.graph.setNodeAttribute(node, 'x', Math.random() * 200 - 100);
        this.graph.setNodeAttribute(node, 'y', Math.random() * 200 - 100);
      });
      return;
    }
    
    // Calculate epicenters in a circular arrangement
    const radius = 100; // Distance of epicenters from origin
    const epicenters = {};
    
    parents.forEach((parent, index) => {
      const angle = (2 * Math.PI * index) / parentCount;
      epicenters[parent] = {
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle)
      };
    });
    
    // Position nodes around their parent's epicenter
    const nodes = this.graph.nodes();
    const spreadRadius = 30; // How far nodes spread from epicenter
    
    nodes.forEach(node => {
      const attrs = this.graph.getNodeAttributes(node);
      const parent = attrs.parent || 'unknown';
      const epicenter = epicenters[parent] || { x: 0, y: 0 };
      
      // Random offset around epicenter
      const offsetAngle = Math.random() * 2 * Math.PI;
      const offsetDist = Math.random() * spreadRadius;
      
      this.graph.setNodeAttribute(node, 'x', epicenter.x + offsetDist * Math.cos(offsetAngle));
      this.graph.setNodeAttribute(node, 'y', epicenter.y + offsetDist * Math.sin(offsetAngle));
    });
  }

  removeIsolatedNodes(graph) {
    return GraphForce.removeIsolatedNodes(graph);
  }

  async applyForceLayout(graph, requestedIterations = 100) {
    this.layoutRunning = true;
    const startBtn = document.getElementById('start-layout');
    const counter = document.getElementById('iteration-counter');
    if (startBtn) startBtn.textContent = 'Stop';
    
    // If continuing from stopped state, use remaining iterations to previous target
    // If completed or first run, set new target
    let iterations;
    if (this.completedIterations < this.targetIterations) {
      // Continuing from stopped state - use remaining iterations
      iterations = this.targetIterations - this.completedIterations;
    } else {
      // Completed or first run - add to target
      iterations = requestedIterations;
      this.targetIterations = this.completedIterations + iterations;
    }
    
    const startIteration = this.completedIterations;
    
    // Apply force layout with callbacks
    const result = await this.forceLayout.apply(
      graph,
      iterations,
      startIteration,
      () => !this.layoutRunning,
      (iter, absoluteIter) => {
        if (counter) {
          counter.textContent = `Running: ${absoluteIter}/${this.targetIterations}`;
        }
      },
      async (positions) => {
        // Apply positions to graph
        Object.entries(positions).forEach(([node, pos]) => {
          graph.setNodeAttribute(node, 'x', pos.x);
          graph.setNodeAttribute(node, 'y', pos.y);
        });
        
        // Refresh renderer
        if (this.renderer) {
          this.renderer.refresh();
        }
        
        // Allow UI to update
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    );
    
    // Handle stopped vs completed
    if (result.stoppedAt !== undefined) {
      this.completedIterations = result.stoppedAt;
      if (counter) counter.textContent = `Stopped: ${result.stoppedAt}/${this.targetIterations}`;
      if (startBtn) startBtn.textContent = 'Continue';
    } else {
      this.completedIterations += iterations;
      if (counter) counter.textContent = `Completed: ${this.completedIterations}/${this.targetIterations}`;
      if (startBtn) startBtn.textContent = 'Continue';
    }
    
    this.layoutRunning = false;
  }

  bindThemeToggle() {
    const themeToggle = document.getElementById('theme-toggle');
    if (!themeToggle) return;
    
    this.applyTheme();
    
    themeToggle.addEventListener('click', () => {
      this.isDarkMode = !this.isDarkMode;
      localStorage.setItem('theme', this.isDarkMode ? 'dark' : 'light');
      this.applyTheme();
      
      if (this.renderer && this.graph) {
        this.updateRendererTheme();
      }
    });
  }
  
  applyTheme() {
    document.body.classList.toggle('dark-mode', this.isDarkMode);
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
      themeToggle.textContent = this.isDarkMode ? '☀️' : '🌙';
    }
  }
  
  updateRendererTheme() {
    const cameraState = this.camera.getState();
    this.renderer.kill();
    
    this.setupSigma(this.graph);
    this.camera.setState(cameraState);
    this.bindHoverEvents();
  }

  bindFileSelector() {
    const loadBtn = document.getElementById('load-file');
    const fileInput = document.getElementById('file-input');
    if (!loadBtn || !fileInput) return;
    
    loadBtn.addEventListener('click', () => {
      fileInput.click();
    });
    
    fileInput.addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      
      try {
        this.loadedFilename = file.name;
        const content = await file.text();
        await this.initialize(content);
        
        const filenameDisplay = document.getElementById('filename-display');
        if (filenameDisplay) filenameDisplay.textContent = file.name;
      } catch (error) {
        console.error('Failed to load file:', error);
        this.updateUI('Error loading file');
      }
      
      // Reset file input so the same file can be loaded again
      fileInput.value = '';
    });
  }

  setupSigma(graph) {
    const container = document.getElementById("sigma-container");
    const edgeColor = this.isDarkMode ? "#535353ff" : "#d4d4d4ff";
    const labelColor = this.isDarkMode ? "#e0e0e0" : "#000000";
    
    this.renderer = new Sigma(graph, container, {
      minCameraRatio: 0.08,
      maxCameraRatio: 3,
      defaultEdgeColor: edgeColor,
      labelColor: { color: labelColor },
    });
    
    this.camera = this.renderer.getCamera();
  }

  bindStartButton() {
    const startBtn = document.getElementById("start-layout");
    const maxIterationsInput = document.getElementById("max-iterations");
    if (!startBtn) return;

    startBtn.addEventListener("click", async () => {
      if (!this.graph) {
        const fileInput = document.getElementById('file-input');
        if (fileInput) fileInput.click();
        return;
      }
      
      if (this.layoutRunning) {
        this.layoutRunning = false;
      } else {
        const iterations = parseInt(maxIterationsInput.value) || 600;
        await this.applyForceLayout(this.graph, iterations);
      }
    });
  }

  bindResetButton() {
    const resetBtn = document.getElementById("reset-layout");
    if (!resetBtn) return;

    resetBtn.addEventListener("click", () => {
      if (!this.graph) return;
      
      // Stop the layout if running
      this.layoutRunning = false;
      
      // Reset iteration counters
      this.completedIterations = 0;
      this.targetIterations = 0;
      
      // Reinitialize positions with epicenter-based layout
      this.initializeNodePositions();
      
      // Cache the new positions
      this.cacheNodePositions();
      
      // Refresh renderer to show new positions
      if (this.renderer) {
        this.renderer.refresh();
      }
      
      // Update UI
      const startBtn = document.getElementById('start-layout');
      const counter = document.getElementById('iteration-counter');
      if (startBtn) startBtn.textContent = 'Start';
      if (counter) counter.textContent = 'Ready (0/0)';
    });
  }

  bindControls() {
    const zoomInBtn = document.getElementById("zoom-in");
    const zoomOutBtn = document.getElementById("zoom-out");
    const centerViewBtn = document.getElementById("center-view");
    const removeIsolatedCheckbox = document.getElementById("remove-isolated");

    zoomInBtn.addEventListener("click", () => {
      this.camera.animatedZoom({ duration: 600 });
    });
    
    zoomOutBtn.addEventListener("click", () => {
      this.camera.animatedUnzoom({ duration: 600 });
    });
    
    if (centerViewBtn) {
      centerViewBtn.addEventListener("click", () => {
        if (this.camera) {
          // Reset camera to default view
          this.camera.animate(
            { x: 0.5, y: 0.5, ratio: 1, angle: 0 },
            { duration: 600, easing: 'quadraticInOut' }
          );
        }
      });
    }
    
    removeIsolatedCheckbox.addEventListener("change", () => {
      if (!this.graph) return;
      
      // Cache current positions
      this.cacheNodePositions();
      
      // Rebuild graph with current filters (including isolated nodes setting)
      this.rebuildFilteredGraph();
      
      // Initialize positions for nodes that don't have them (using epicenter method)
      this.graph.forEachNode((node, attrs) => {
        if (attrs.x === undefined || attrs.y === undefined) {
          // Node doesn't have position, use parent epicenter
          const parent = attrs.parent;
          const parents = this.graph.getAttribute('parents') || [];
          const parentIndex = parents.indexOf(parent);
          
          if (parentIndex !== -1) {
            const parentCount = parents.length;
            const radius = 100;
            const angle = (2 * Math.PI * parentIndex) / parentCount;
            const epicenterX = radius * Math.cos(angle);
            const epicenterY = radius * Math.sin(angle);
            
            // Place near epicenter with small random offset
            const offset = 10;
            this.graph.setNodeAttribute(node, 'x', epicenterX + (Math.random() - 0.5) * offset);
            this.graph.setNodeAttribute(node, 'y', epicenterY + (Math.random() - 0.5) * offset);
          }
        }
      });
      
      // Restore cached positions for existing nodes
      this.restoreNodePositions();
      
      // Cache the new positions
      this.cacheNodePositions();
      
      if (this.renderer) {
        this.renderer.refresh();
      }
    });
  }

  bindHoverEvents() {
    const tooltip = document.getElementById('tooltip');
    
    this.renderer.on('enterNode', ({ node }) => {
      const attrs = this.graph.getNodeAttributes(node);
      const inDegree = this.graph.inDegree(node);
      const outDegree = this.graph.outDegree(node);
      
      console.log('Node hover:', node, 'attrs:', attrs); // Debug log
      
      let content = `<strong>${attrs.label || node}</strong><br>`;
      if (attrs.parent) {
        content += `Parent: <span style="color: ${attrs.color}">${attrs.parent}</span><br>`;
      }
      if (attrs.file) {
        content += `File: ${attrs.file}`;
        if (attrs.line) {
          content += ` (line ${attrs.line})`;
        }
        content += '<br>';
      }
      content += `Incoming edges: ${inDegree}<br>`;
      content += `Outgoing edges: ${outDegree}`;
      
      tooltip.innerHTML = content;
      tooltip.style.display = 'block';
    });
    
    this.renderer.on('leaveNode', () => {
      tooltip.style.display = 'none';
    });
    
    this.renderer.getMouseCaptor().on('mousemove', (e) => {
      if (tooltip.style.display === 'block') {
        tooltip.style.left = e.x + 10 + 'px';
        tooltip.style.top = e.y + 10 + 'px';
      }
    });
  }
  
  populateParentSidebar() {
    const parentList = document.getElementById('parent-list');
    if (!parentList) return;
    
    const parents = this.graph.getAttribute('parents') || [];
    const parentColorMap = this.graph.getAttribute('parentColorMap') || {};
    
    // Count nodes per parent from fullGraph (total count, not filtered)
    const parentCounts = {};
    parents.forEach(parent => parentCounts[parent] = 0);
    
    this.fullGraph.forEachNode((node, attrs) => {
      if (attrs.parent && parentCounts[attrs.parent] !== undefined) {
        parentCounts[attrs.parent]++;
      }
    });
    
    // Clear existing content
    parentList.innerHTML = '';
    
    // Create parent items
    parents.forEach(parent => {
      const color = parentColorMap[parent] || '#666666';
      const count = parentCounts[parent] || 0;
      
      const item = document.createElement('div');
      item.className = 'parent-item';
      
      const swatch = document.createElement('div');
      swatch.className = 'color-swatch';
      swatch.style.backgroundColor = color;
      swatch.title = 'Click to change color';
      
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
      item.appendChild(swatch);
      item.appendChild(info);
      
      // Add color picker functionality
      swatch.addEventListener('click', () => {
        this.openColorPicker(parent, color);
      });
      
      // Add checkbox for visibility toggle
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'parent-checkbox';
      checkbox.checked = this.visibleParents.has(parent);
      checkbox.title = 'Toggle visibility';
      
      checkbox.addEventListener('change', () => {
        this.toggleParentVisibility(parent, checkbox.checked);
      });
      
      // Insert checkbox at the beginning
      item.insertBefore(checkbox, swatch);
      
      parentList.appendChild(item);
    });
  }
  
  toggleParentVisibility(parent, visible) {
    if (visible) {
      this.visibleParents.add(parent);
    } else {
      this.visibleParents.delete(parent);
    }
    
    // Cache current positions before rebuilding
    this.cacheNodePositions();
    
    // Rebuild the filtered graph
    this.rebuildFilteredGraph();
    
    // Restore cached positions
    this.restoreNodePositions();
    
    // Refresh renderer
    if (this.renderer) {
      this.renderer.refresh();
    }
    
    // Update parent counts in sidebar
    this.populateParentSidebar();
    
    // Note: We don't stop the layout algorithm - let it continue running
    // The force algorithm will automatically work with the new filtered graph
  }
  
  rebuildFilteredGraph() {
    // Clear current graph
    this.graph.clear();
    
    // Add nodes from visible parents
    this.fullGraph.forEachNode((node, attrs) => {
      if (this.visibleParents.has(attrs.parent)) {
        this.graph.addNode(node, { ...attrs });
      }
    });
    
    // Add edges where both source and target are visible
    this.fullGraph.forEachEdge((edge, attrs, source, target) => {
      if (this.graph.hasNode(source) && this.graph.hasNode(target)) {
        this.graph.addEdge(source, target, { ...attrs });
      }
    });
    
    // Apply isolated nodes filter if checkbox is checked
    const removeIsolatedCheckbox = document.getElementById('remove-isolated');
    if (removeIsolatedCheckbox && removeIsolatedCheckbox.checked) {
      const nodesToRemove = [];
      this.graph.forEachNode((node) => {
        if (this.graph.degree(node) === 0) {
          nodesToRemove.push(node);
        }
      });
      nodesToRemove.forEach(node => this.graph.dropNode(node));
    }
  }
  
  cacheNodePositions() {
    // Store positions for all nodes in current graph
    this.graph.forEachNode((node, attrs) => {
      if (attrs.x !== undefined && attrs.y !== undefined) {
        this.nodePositions[node] = { x: attrs.x, y: attrs.y };
        // Also update fullGraph so positions persist across filtering
        if (this.fullGraph.hasNode(node)) {
          this.fullGraph.setNodeAttribute(node, 'x', attrs.x);
          this.fullGraph.setNodeAttribute(node, 'y', attrs.y);
        }
      }
    });
  }
  
  restoreNodePositions() {
    // Restore positions for visible nodes
    this.graph.forEachNode((node) => {
      if (this.nodePositions[node]) {
        this.graph.setNodeAttribute(node, 'x', this.nodePositions[node].x);
        this.graph.setNodeAttribute(node, 'y', this.nodePositions[node].y);
      }
    });
  }
  
  openColorPicker(parent, currentColor) {
    // Create a temporary color input
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
  
  updateParentColor(parent, newColor) {
    // Update the color map
    const parentColorMap = this.graph.getAttribute('parentColorMap') || {};
    parentColorMap[parent] = newColor;
    this.graph.setAttribute('parentColorMap', parentColorMap);
    
    // Update all nodes with this parent
    this.graph.forEachNode((node, attrs) => {
      if (attrs.parent === parent) {
        this.graph.setNodeAttribute(node, 'color', newColor);
      }
    });
    
    // Refresh the renderer
    if (this.renderer) {
      this.renderer.refresh();
    }
    
    // Update the sidebar display
    this.populateParentSidebar();
  }
  
  // Preset Management Methods
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
    
    // Save current filter as preset
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
  
  savePreset(name) {
    const presets = this.getPresets();
    const removeIsolatedCheckbox = document.getElementById('remove-isolated');
    presets[name] = {
      visibleParents: Array.from(this.visibleParents),
      removeIsolated: removeIsolatedCheckbox ? removeIsolatedCheckbox.checked : true,
      timestamp: new Date().toISOString()
    };
    localStorage.setItem('filterPresets', JSON.stringify(presets));
    this.refreshPresetList();
    
    // Select the newly saved preset
    const presetSelect = document.getElementById('preset-select');
    if (presetSelect) presetSelect.value = name;
  }
  
  loadPreset(name) {
    const presets = this.getPresets();
    const preset = presets[name];
    if (!preset) return;
    
    // Update visible parents
    this.visibleParents = new Set(preset.visibleParents);
    
    // Update remove isolated checkbox
    const removeIsolatedCheckbox = document.getElementById('remove-isolated');
    if (removeIsolatedCheckbox) {
      removeIsolatedCheckbox.checked = preset.removeIsolated !== undefined ? preset.removeIsolated : true;
    }
    
    // Cache positions and rebuild graph
    this.cacheNodePositions();
    this.rebuildFilteredGraph();
    this.restoreNodePositions();
    
    // Refresh display
    if (this.renderer) {
      this.renderer.refresh();
    }
    
    // Update sidebar checkboxes
    this.populateParentSidebar();
  }
  
  deletePreset(name) {
    const presets = this.getPresets();
    delete presets[name];
    localStorage.setItem('filterPresets', JSON.stringify(presets));
    this.refreshPresetList();
  }
  
  getPresets() {
    const stored = localStorage.getItem('filterPresets');
    return stored ? JSON.parse(stored) : {};
  }
  
  // Search functionality
  bindSearchControls() {
    const searchInput = document.getElementById('search-input');
    const searchClear = document.getElementById('search-clear');
    const sortRadios = document.querySelectorAll('input[name="search-sort"]');
    
    if (!searchInput) return;
    
    // Debounced search on input
    searchInput.addEventListener('input', (e) => {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = setTimeout(() => {
        this.performSearch(e.target.value);
      }, 150);
    });
    
    // Clear search
    if (searchClear) {
      searchClear.addEventListener('click', () => {
        searchInput.value = '';
        this.performSearch('');
      });
    }
    
    // Sort change
    sortRadios.forEach(radio => {
      radio.addEventListener('change', () => {
        if (this.searchQuery) {
          this.performSearch(this.searchQuery);
        }
      });
    });
  }
  
  performSearch(query) {
    this.searchQuery = query.toLowerCase().trim();
    this.matchingNodes.clear();
    
    const resultsContainer = document.getElementById('search-results');
    if (!resultsContainer || !this.graph) return;
    
    // If empty query, clear highlights and show nothing
    if (!this.searchQuery) {
      resultsContainer.innerHTML = '';
      this.updateNodeHighlights();
      return;
    }
    
    // Find matching nodes (only search visible nodes in current graph)
    const matches = [];
    this.graph.forEachNode((nodeId, attrs) => {
      const label = (attrs.label || nodeId).toLowerCase();
      if (label.includes(this.searchQuery)) {
        this.matchingNodes.add(nodeId);
        matches.push({
          id: nodeId,
          label: attrs.label || nodeId,
          parent: attrs.parent || 'unknown',
          degree: this.graph.degree(nodeId),
          color: attrs.color
        });
      }
    });
    
    // Sort matches
    const sortMode = document.querySelector('input[name="search-sort"]:checked')?.value || 'alpha';
    if (sortMode === 'alpha') {
      matches.sort((a, b) => a.label.localeCompare(b.label));
    } else if (sortMode === 'parent') {
      matches.sort((a, b) => {
        const parentCompare = a.parent.localeCompare(b.parent);
        return parentCompare !== 0 ? parentCompare : a.label.localeCompare(b.label);
      });
    }
    
    // Render results
    this.renderSearchResults(matches, sortMode);
  }
  
  renderSearchResults(matches, sortMode) {
    const resultsContainer = document.getElementById('search-results');
    if (!resultsContainer) return;
    
    if (matches.length === 0) {
      resultsContainer.innerHTML = `
        <div class="search-empty">
          No nodes match "${this.searchQuery}"
        </div>
      `;
      return;
    }
    
    let html = '';
    
    if (sortMode === 'parent') {
      // Group by parent
      const byParent = {};
      matches.forEach(match => {
        if (!byParent[match.parent]) byParent[match.parent] = [];
        byParent[match.parent].push(match);
      });
      
      Object.keys(byParent).sort().forEach(parent => {
        html += `<div class="search-parent-group">`;
        html += `<div class="search-parent-header">${parent}</div>`;
        byParent[parent].forEach(match => {
          html += this.renderSearchResultItem(match);
        });
        html += `</div>`;
      });
    } else {
      // Simple list
      matches.forEach(match => {
        html += this.renderSearchResultItem(match);
      });
    }
    
    resultsContainer.innerHTML = html;
    
    // Bind click events
    resultsContainer.querySelectorAll('.search-result-item').forEach(item => {
      const nodeId = item.dataset.nodeId;
      
      item.addEventListener('click', () => {
        this.zoomToNode(nodeId);
      });
      
      item.addEventListener('mouseenter', () => {
        this.showPingOnNode(nodeId);
      });
      
      item.addEventListener('mouseleave', () => {
        this.hidePing();
      });
    });
  }
  
  renderSearchResultItem(match) {
    const escapedLabel = this.escapeHtml(match.label);
    const escapedParent = this.escapeHtml(match.parent);
    
    return `
      <div class="search-result-item" data-node-id="${match.id}" title="${escapedLabel}">
        <div class="search-result-name">${escapedLabel}</div>
        <div class="search-result-meta">
          <span class="search-result-parent">${escapedParent}</span>
          <span class="search-result-degree">(${match.degree})</span>
        </div>
      </div>
    `;
  }
  
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  updateNodeHighlights() {
    if (!this.renderer || !this.graph) return;
    
    const hasSearch = this.searchQuery && this.matchingNodes.size > 0;
    
    this.graph.forEachNode((nodeId, attrs) => {
      const isMatch = this.matchingNodes.has(nodeId);
      
      if (hasSearch) {
        // Dim non-matching nodes
        this.graph.setNodeAttribute(nodeId, 'opacity', isMatch ? 1 : 0.2);
      } else {
        // Reset to normal
        this.graph.setNodeAttribute(nodeId, 'opacity', 1);
      }
    });
    
    this.renderer.refresh();
  }
  
  highlightNode(nodeId, highlight) {
    if (!this.renderer || !this.graph || !this.graph.hasNode(nodeId)) return;
    
    if (highlight) {
      // Brighten on hover
      this.graph.setNodeAttribute(nodeId, 'opacity', 1);
    } else {
      // Restore based on search state
      const isMatch = this.matchingNodes.has(nodeId);
      const hasSearch = this.searchQuery && this.matchingNodes.size > 0;
      
      this.graph.setNodeAttribute(nodeId, 'opacity', (hasSearch && !isMatch) ? 0.2 : 1);
    }
    
    this.renderer.refresh();
  }
  
  zoomToNode(nodeId) {
    if (!this.camera || !this.graph || !this.graph.hasNode(nodeId)) return;
    
    const nodeDisplayData = this.renderer.getNodeDisplayData(nodeId);
    
    if (!nodeDisplayData) return;
    
    // Hide ping indicator when zooming
    this.hidePing();
    
    // Get current camera state
    const currentState = this.camera.getState();
    
    // Use Sigma's coordinate system (viewport coordinates) and zoom in more
    this.camera.animate(
      { ...nodeDisplayData, ratio: currentState.ratio * 0.25 },
      { duration: 600, easing: 'quadraticInOut' }
    );
  }
  
  showPingOnNode(nodeId) {
    if (!this.renderer || !this.graph || !this.graph.hasNode(nodeId)) return;
    
    const pingIndicator = document.getElementById('ping-indicator');
    if (!pingIndicator) return;
    
    const nodeAttrs = this.graph.getNodeAttributes(nodeId);
    const container = document.getElementById('sigma-container');
    const rect = container.getBoundingClientRect();
    
    // Get viewport position from camera
    const viewportPos = this.renderer.graphToViewport({ x: nodeAttrs.x, y: nodeAttrs.y });
    
    pingIndicator.style.left = (rect.left + viewportPos.x) + 'px';
    pingIndicator.style.top = (rect.top + viewportPos.y) + 'px';
    pingIndicator.style.display = 'block';
  }
  
  hidePing() {
    const pingIndicator = document.getElementById('ping-indicator');
    if (pingIndicator) {
      pingIndicator.style.display = 'none';
    }
  }
  
  pulseNode(nodeId) {
    if (!this.graph || !this.graph.hasNode(nodeId)) return;
    
    const attrs = this.graph.getNodeAttributes(nodeId);
    const baseSize = attrs.baseSize || 5;
    let pulseCount = 0;
    
    const pulse = () => {
      if (pulseCount >= 6) {
        // Reset to normal after pulses
        const isMatch = this.matchingNodes.has(nodeId);
        const hasSearch = this.searchQuery && this.matchingNodes.size > 0;
        this.graph.setNodeAttribute(nodeId, 'size', 
          hasSearch && isMatch ? baseSize * 1.2 : baseSize);
        this.renderer.refresh();
        return;
      }
      
      const isExpanding = pulseCount % 2 === 0;
      this.graph.setNodeAttribute(nodeId, 'size', isExpanding ? baseSize * 2 : baseSize * 1.2);
      this.renderer.refresh();
      
      pulseCount++;
      setTimeout(pulse, 150);
    };
    
    pulse();
  }
  
  updateUI(counterText, buttonText) {
    const counter = document.getElementById('iteration-counter');
    if (counter && counterText) counter.textContent = counterText;
    
    const startBtn = document.getElementById('start-layout');
    if (startBtn && buttonText) startBtn.textContent = buttonText;
  }
}
