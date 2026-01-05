import GexfParser from './GexfParser.js';

export default class GraphViewer {
  constructor() {
    this.renderer = null;
    this.camera = null;
    this.graph = null;
  }

  async initialize() {
    try {
      const gexf = await this.loadGexfFile("./data/graph.gexf");
      this.graph = GexfParser.parse(gexf);
      
      // Setup Sigma first so we can render during layout
      this.setupSigma(this.graph);
      this.bindControls();
      this.bindHoverEvents();
      
      // Apply force layout with live updates
      await this.applyForceLayout(this.graph, 2000);
    } catch (error) {
      console.error('Failed to initialize graph viewer:', error);
    }
  }

  async applyForceLayout(graph, iterations = 100) {
    const nodes = graph.nodes();
    const positions = {};
    const velocities = {};
    const counter = document.getElementById('iteration-counter');
    
    // Initialize positions and velocities within a bounded area
    nodes.forEach(node => {
      positions[node] = { 
        x: Math.random() * 200 - 100, 
        y: Math.random() * 200 - 100 
      };
      velocities[node] = { x: 0, y: 0 };
    });

    const k = 5; // Target edge length
    const c_rep = 2500; // Repulsion constant
    const c_spring = 0.07; // Spring constant
    const maxRepulsionDist = 100; // Only calculate repulsion within this distance
    const refreshRate = 1; // Refresh every 10 iterations
    
    for (let iter = 0; iter < iterations; iter++) {
      if (counter) {
        counter.textContent = `Layout: ${iter}/${iterations}`;
      }
      
      // Update rendering every 10 iterations
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
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
          
          // Skip distant nodes for performance
          if (dist > maxRepulsionDist) continue;
          
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
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
        const force = c_spring * (dist - k);
        
        forces[source].x += (dx / dist) * force;
        forces[source].y += (dy / dist) * force;
        forces[target].x -= (dx / dist) * force;
        forces[target].y -= (dy / dist) * force;
      });

      // Update positions with damping and velocity limiting
      const damping = 0.9;
      const timeStep = 0.3;
      const maxVelocity = 5; // Limit velocity to prevent explosion
      
      nodes.forEach(node => {
        velocities[node].x = (velocities[node].x + forces[node].x * timeStep) * damping;
        velocities[node].y = (velocities[node].y + forces[node].y * timeStep) * damping;
        
        // Clamp velocities
        velocities[node].x = Math.max(-maxVelocity, Math.min(maxVelocity, velocities[node].x));
        velocities[node].y = Math.max(-maxVelocity, Math.min(maxVelocity, velocities[node].y));
        
        positions[node].x += velocities[node].x;
        positions[node].y += velocities[node].y;
      });
    }

    // Normalize positions to 0-1 range for Sigma.js
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    nodes.forEach(node => {
      minX = Math.min(minX, positions[node].x);
      maxX = Math.max(maxX, positions[node].x);
      minY = Math.min(minY, positions[node].y);
      maxY = Math.max(maxY, positions[node].y);
    });
    
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    
    // Apply normalized positions to graph (map to 0-1 range)
    nodes.forEach(node => {
      const normalizedX = (positions[node].x - minX) / rangeX;
      const normalizedY = (positions[node].y - minY) / rangeY;
      graph.setNodeAttribute(node, 'x', normalizedX);
      graph.setNodeAttribute(node, 'y', normalizedY);
    });
    
    if (counter) {
      counter.textContent = `Layout complete (${iterations} iterations)`;
    }
  }

  async loadGexfFile(url) {
    const response = await fetch(url);
    return await response.text();
  }

  setupSigma(graph) {
    const container = document.getElementById("sigma-container");
    
    this.renderer = new Sigma(graph, container, {
      minCameraRatio: 0.08,
      maxCameraRatio: 3,
    });
    
    this.camera = this.renderer.getCamera();
  }

  bindControls() {
    const zoomInBtn = document.getElementById("zoom-in");
    const zoomOutBtn = document.getElementById("zoom-out");
    const zoomResetBtn = document.getElementById("zoom-reset");
    const labelsThresholdRange = document.getElementById("labels-threshold");

    zoomInBtn.addEventListener("click", () => {
      this.camera.animatedZoom({ duration: 600 });
    });
    
    zoomOutBtn.addEventListener("click", () => {
      this.camera.animatedUnzoom({ duration: 600 });
    });
    
    zoomResetBtn.addEventListener("click", () => {
      this.camera.animatedReset({ duration: 600 });
    });

    labelsThresholdRange.addEventListener("input", () => {
      if (this.renderer) {
        this.renderer.setSetting("labelRenderedSizeThreshold", +labelsThresholdRange.value);
      }
    });

    if (this.renderer) {
      labelsThresholdRange.value = this.renderer.getSetting("labelRenderedSizeThreshold") + "";
    }
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
