class GraphViewer {
  constructor() {
    this.renderer = null;
    this.camera = null;
    this.graph = null;
    this.fullGraph = null; // Complete backup with ALL nodes
    this.nodePositions = {}; // Position cache for all nodes (visible + hidden)
    this.visibleParents = new Set(); // Set of currently visible parent names
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
    const removeIsolatedCheckbox = document.getElementById("remove-isolated");

    zoomInBtn.addEventListener("click", () => {
      this.camera.animatedZoom({ duration: 600 });
    });
    
    zoomOutBtn.addEventListener("click", () => {
      this.camera.animatedUnzoom({ duration: 600 });
    });
    
    removeIsolatedCheckbox.addEventListener("change", () => {
      if (!this.graph) return;
      
      // Cache current positions
      this.cacheNodePositions();
      
      if (removeIsolatedCheckbox.checked) {
        // Remove isolated nodes from the graph
        const nodesToRemove = [];
        this.graph.forEachNode((node) => {
          if (this.graph.degree(node) === 0) {
            nodesToRemove.push(node);
          }
        });
        nodesToRemove.forEach(node => this.graph.dropNode(node));
        
        if (this.renderer) {
          this.renderer.refresh();
        }
      } else {
        // Restore from full graph with current parent filters
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
        
        // Cache the positions
        this.cacheNodePositions();
        
        if (this.renderer) {
          this.renderer.refresh();
        }
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
    
    // Count nodes per parent
    const parentCounts = {};
    parents.forEach(parent => parentCounts[parent] = 0);
    
    this.graph.forEachNode((node, attrs) => {
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
      presetName.value = '';
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
    presets[name] = {
      visibleParents: Array.from(this.visibleParents),
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
  
  updateUI(counterText, buttonText) {
    const counter = document.getElementById('iteration-counter');
    if (counter && counterText) counter.textContent = counterText;
    
    const startBtn = document.getElementById('start-layout');
    if (startBtn && buttonText) startBtn.textContent = buttonText;
  }
}
