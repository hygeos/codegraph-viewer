class GraphViewer {
  constructor() {
    this.renderer = null;
    this.camera = null;
    this.graph = null;
    this.originalGraph = null; // Backup of the original graph
    this.layoutRunning = false;
    this.isInitialized = false;
    this.loadedFilename = null;
    
    // Load theme preference, default to light mode
    const savedTheme = localStorage.getItem('theme');
    this.isDarkMode = savedTheme ? savedTheme === 'dark' : false;
    
    // Bind file selector and theme toggle immediately
    this.bindFileSelector();
    this.bindThemeToggle();
    this.bindStartButton();
  }

  cleanState() {
    this.layoutRunning = false;
    
    if (this.renderer) {
      this.renderer.kill();
      this.renderer = null;
    }
    
    this.graph = null;
    this.originalGraph = null;
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
      
      // Store a copy of the original graph
      this.originalGraph = this.graph.copy();
      
      // Initialize nodes with random positions
      this.initializeNodePositions();
      
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
    const nodesToRemove = [];
    graph.forEachNode((node) => {
      if (graph.degree(node) === 0) {
        nodesToRemove.push(node);
      }
    });
    nodesToRemove.forEach(node => graph.dropNode(node));
    return nodesToRemove.length;
  }

  async applyForceLayout(graph, iterations = 100) {
    this.layoutRunning = true;
    const startBtn = document.getElementById('start-layout');
    const counter = document.getElementById('iteration-counter');
    if (startBtn) startBtn.textContent = 'Stop';
    
    // Check if we should remove isolated nodes
    const removeIsolatedCheckbox = document.getElementById('remove-isolated');
    if (removeIsolatedCheckbox && removeIsolatedCheckbox.checked) {
      const removed = this.removeIsolatedNodes(graph);
      if (counter && removed > 0) {
        counter.textContent = `Removed ${removed} isolated node${removed > 1 ? 's' : ''}`;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    const nodes = graph.nodes();
    const positions = {};
    const velocities = {};
    
    // Use current positions from graph instead of reinitializing randomly
    nodes.forEach(node => {
      const attrs = graph.getNodeAttributes(node);
      positions[node] = { 
        x: attrs.x || Math.random() * 200 - 100, 
        y: attrs.y || Math.random() * 200 - 100 
      };
      velocities[node] = { x: 0, y: 0 };
    });

    const k = 6; // Target edge length
    const c_rep_max = 1500; // Repulsion constant maximum
    const c_rep_min = 50;   // Repulsion constant minimum
    
    const c_spring = 0.075;       // Spring constant
    const maxRepulsionDist = 100; // Only calculate repulsion within this distance
    const refreshRate = 1;       // Refresh every 10 iterations
    
    const c_rep_itr_at_min = 10;
    const c_rep_max_itr =  Math.floor(iterations / 4) * 1;
    
    for (let iter = 0; iter < iterations; iter++) {
      // Check if layout was stopped
      if (!this.layoutRunning) {
        if (counter) counter.textContent = 'Stopped';
        if (startBtn) startBtn.textContent = 'Start';
        return;
      }
      
      if (counter) {
        counter.textContent = `Running: ${iter}/${iterations}`;
      }
      
      // Update rendering every Nth iterations
      if (iter % refreshRate === 0) {
        // Apply current positions to graph
        nodes.forEach(node => {
          graph.setNodeAttribute(node, 'x', positions[node].x);
          graph.setNodeAttribute(node, 'y', positions[node].y);
        });
        
        // Refresh the renderer
        if (this.renderer) {
          this.renderer.refresh();
        }
        
        // Allow UI to update
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      
      const forces = {};
      nodes.forEach(node => {
        forces[node] = { x: 0, y: 0 };
      });

      // Optimized repulsion - only nearby nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const node1 = nodes[i];
          const node2 = nodes[j];
          const dx = positions[node2].x - positions[node1].x;
          const dy = positions[node2].y - positions[node1].y;
          const dist = Math.sqrt(dx * dx + dy * dy); // || 0.1;
          
          // Skip distant nodes for performance
          if (dist > maxRepulsionDist) continue;
          
          // Repulsion gradually increases from min to max between c_rep_itr_at_min and c_rep_max_itr
          let c_rep;
          if (iter < c_rep_itr_at_min) {
            c_rep = c_rep_min;
          } else if (iter <= c_rep_max_itr) {
            c_rep = c_rep_max;
          } else {
            const progress = (iter - c_rep_itr_at_min) / (c_rep_max_itr - c_rep_itr_at_min);
            c_rep = c_rep_min + (c_rep_max - c_rep_min) * progress;
          }
          
          const force = c_rep / (dist * dist);
          
          forces[node1].x -= (dx / dist) * force;
          forces[node1].y -= (dy / dist) * force;
          forces[node2].x += (dx / dist) * force;
          forces[node2].y += (dy / dist) * force;
        }
      }

      // Attraction along edges
      graph.forEachEdge((edge, attrs, source, target) => {
        const dx = positions[target].x - positions[source].x;
        const dy = positions[target].y - positions[source].y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.2;
        const force = c_spring * (dist - k);
        
        forces[source].x += (dx / dist) * force;
        forces[source].y += (dy / dist) * force;
        forces[target].x -= (dx / dist) * force;
        forces[target].y -= (dy / dist) * force;
      });

      // Update positions with damping and velocity limiting
      const damping = 0.9;
      const timeStep = 0.3;
      const max_velocity = 20; // Limit velocity to prevent explosion
      const min_velocity = 5; // reach min_velocity at last iteration
      
      nodes.forEach(node => {
        
        const curr_max_velocity = max_velocity - ((max_velocity - min_velocity) * (iter / iterations));
        
        velocities[node].x = (velocities[node].x + forces[node].x * timeStep) * damping;
        velocities[node].y = (velocities[node].y + forces[node].y * timeStep) * damping;
        
        // Clamp velocities
        velocities[node].x = Math.max(-curr_max_velocity, Math.min(curr_max_velocity, velocities[node].x));
        velocities[node].y = Math.max(-curr_max_velocity, Math.min(curr_max_velocity, velocities[node].y));
        
        positions[node].x += velocities[node].x;
        positions[node].y += velocities[node].y;
      });
    }

    this.layoutRunning = false;
    if (counter) {
      counter.textContent = `Completed ${iterations} itr`;
    }
    if (startBtn) startBtn.textContent = 'Start';
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
      if (!removeIsolatedCheckbox.checked && this.originalGraph) {
        // Restore the original graph
        this.graph.clear();
        this.originalGraph.forEachNode((node, attrs) => {
          this.graph.addNode(node, { ...attrs });
        });
        this.originalGraph.forEachEdge((edge, attrs, source, target) => {
          this.graph.addEdge(source, target, { ...attrs });
        });
        this.renderer.refresh();
        
        const counter = document.getElementById('iteration-counter');
        if (counter) counter.textContent = 'Isolated nodes restored';
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
      
      parentList.appendChild(item);
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
  
  updateUI(counterText, buttonText) {
    const counter = document.getElementById('iteration-counter');
    if (counter && counterText) counter.textContent = counterText;
    
    const startBtn = document.getElementById('start-layout');
    if (startBtn && buttonText) startBtn.textContent = buttonText;
  }
}
