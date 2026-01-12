class GraphViewer {
  constructor() {
    this.renderer = null;
    this.camera = null;
    this.graph = null;
    this.originalGraph = null; // Backup of the original graph
    this.layoutRunning = false;
    this.isInitialized = false;
    this.loadedFilename = null;
    
    // Load theme preference FIRST before anything else, default to dark
    const savedTheme = localStorage.getItem('theme');
    this.isDarkMode = savedTheme ? savedTheme === 'dark' : true;
    
    // Bind file selector and theme toggle immediately
    this.bindFileSelector();
    this.bindThemeToggle();
    this.bindStartButton();
  }

  cleanState() {
    // Stop any running layout
    this.layoutRunning = false;
    
    // Destroy existing renderer
    if (this.renderer) {
      this.renderer.kill();
      this.renderer = null;
    }
    
    // Clear graph
    this.graph = null;
    this.originalGraph = null;
    this.camera = null;
    
    // Update UI
    const counter = document.getElementById('iteration-counter');
    if (counter) counter.textContent = 'Loading...';
    const startBtn = document.getElementById('start-layout');
    if (startBtn) startBtn.textContent = 'Start';
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
      
      // Update UI to show ready state
      const counter = document.getElementById('iteration-counter');
      if (counter) counter.textContent = 'Ready';
      
    } catch (error) {
      console.error('Failed to initialize graph viewer:', error);
      const counter = document.getElementById('iteration-counter');
      if (counter) counter.textContent = 'Error loading file';
    }
  }

  initializeNodePositions() {
    const nodes = this.graph.nodes();
    nodes.forEach(node => {
      this.graph.setNodeAttribute(node, 'x', Math.random() * 200 - 100);
      this.graph.setNodeAttribute(node, 'y', Math.random() * 200 - 100);
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
    
    // Initialize positions and velocities within a bounded area
    nodes.forEach(node => {
      positions[node] = { 
        x: Math.random() * 200 - 100, 
        y: Math.random() * 200 - 100 
      };
      velocities[node] = { x: 0, y: 0 };
    });

    const k = 8; // Target edge length
    const c_rep_max = 1500; // Repulsion constant maximum
    const c_rep_min = 50;   // Repulsion constant minimum
    
    const c_spring = 0.075;       // Spring constant
    const maxRepulsionDist = 250; // Only calculate repulsion within this distance
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
    
    if (!themeToggle) {
      console.error('Theme toggle button not found');
      return;
    }
    
    // Apply the theme that was loaded in constructor
    if (this.isDarkMode) {
      document.body.classList.add('dark-mode');
      themeToggle.textContent = '☀️';
    }
    
    themeToggle.addEventListener('click', () => {
      this.isDarkMode = !this.isDarkMode;
      document.body.classList.toggle('dark-mode');
      
      // Update button icon
      themeToggle.textContent = this.isDarkMode ? '☀️' : '🌙';
      
      // Save preference
      localStorage.setItem('theme', this.isDarkMode ? 'dark' : 'light');
      
      // Update renderer edge colors if graph is loaded
      if (this.renderer && this.graph) {
        this.updateRendererTheme();
      }
    });
  }
  
  updateRendererTheme() {
    // Recreate the renderer with new theme colors
    const container = document.getElementById("sigma-container");
    const cameraState = this.camera.getState();
    
    this.renderer.kill();
    
    // const edgeColor = this.isDarkMode ? "#313131ff" : "#cccccc";
    const edgeColor = this.isDarkMode ? "#b41c1cff" : "#16c049ff";
    
    const labelColorValue = this.isDarkMode ? "#e0e0e0" : "#000000";
    
    // Set edge colors explicitly on all edges
    this.graph.forEachEdge((edge) => {
      this.graph.setEdgeAttribute(edge, 'color', edgeColor);
    });
    
    this.renderer = new Sigma(this.graph, container, {
      minCameraRatio: 0.08,
      maxCameraRatio: 3,
      defaultEdgeColor: edgeColor,
      labelColor: { color: labelColorValue },
    });
    
    this.camera = this.renderer.getCamera();
    this.camera.setState(cameraState);
    
    // Rebind hover events
    this.bindHoverEvents();
  }

  bindFileSelector() {
    const loadBtn = document.getElementById('load-file');
    const fileInput = document.getElementById('file-input');
    
    if (!loadBtn || !fileInput) {
      console.error('File selector elements not found');
      return;
    }
    
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
        
        // Display filename
        const filenameDisplay = document.getElementById('filename-display');
        if (filenameDisplay) filenameDisplay.textContent = file.name;
      } catch (error) {
        console.error('Failed to load file:', error);
        const counter = document.getElementById('iteration-counter');
        if (counter) counter.textContent = 'Error loading file';
      }
      
      // Reset file input so the same file can be loaded again
      fileInput.value = '';
    });
  }

  setupSigma(graph) {
    const container = document.getElementById("sigma-container");
    
    // const edgeColor = this.isDarkMode ? "#313131ff" : "#cccccc";
    const edgeColor = this.isDarkMode ? "#3f3f3fff" : "#b8b0b0ff";
    const labelColorValue = this.isDarkMode ? "#e0e0e0" : "#000000";
    
    console.log('setupSigma - isDarkMode:', this.isDarkMode, 'edgeColor:', edgeColor);
    console.log('Number of edges:', graph.edges().length);
    
    // Set edge colors explicitly on all edges
    // graph.forEachEdge((edge) => {
    //   graph.setEdgeAttribute(edge, 'color', edgeColor);
    // });
    
    console.log('Sample edge color after setting:', graph.edges().length > 0 ? graph.getEdgeAttribute(graph.edges()[0], 'color') : 'no edges');
    
    this.renderer = new Sigma(graph, container, {
      minCameraRatio: 0.08,
      maxCameraRatio: 3,
      defaultEdgeColor: edgeColor,
      labelColor: { color: labelColorValue },
    //   renderEdgeLabels: false,
    //   defaultEdgeType: "arrow",
    //   edgeProgramClasses: {
        // arrow: Sigma.edgePrograms.arrow
    //   }
    });
    
    this.camera = this.renderer.getCamera();
  }

  bindStartButton() {
    const startBtn = document.getElementById("start-layout");
    const maxIterationsInput = document.getElementById("max-iterations");
    
    if (!startBtn) {
      console.error('Start button not found');
      return;
    }

    startBtn.addEventListener("click", async () => {
      // If no file is loaded, trigger file selection
      if (!this.graph) {
        const fileInput = document.getElementById('file-input');
        if (fileInput) fileInput.click();
        return;
      }
      
      if (this.layoutRunning) {
        // Stop the layout
        this.layoutRunning = false;
      } else {
        // Start/restart the layout
        const iterations = parseInt(maxIterationsInput.value) || 600;
        await this.applyForceLayout(this.graph, iterations);
      }
    });
  }

  bindControls() {
    const zoomInBtn = document.getElementById("zoom-in");
    const zoomOutBtn = document.getElementById("zoom-out");
    const zoomResetBtn = document.getElementById("zoom-reset");
    const removeIsolatedCheckbox = document.getElementById("remove-isolated");

    zoomInBtn.addEventListener("click", () => {
      this.camera.animatedZoom({ duration: 600 });
    });
    
    zoomOutBtn.addEventListener("click", () => {
      this.camera.animatedUnzoom({ duration: 600 });
    });
    
    zoomResetBtn.addEventListener("click", () => {
      this.camera.animatedReset({ duration: 600 });
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
}
