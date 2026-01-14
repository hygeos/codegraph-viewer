/**
 * RenderManager - Manages Sigma.js renderer lifecycle and camera operations
 * 
 * Responsible for:
 * - Creating and destroying Sigma renderer instances
 * - Camera operations (zoom, pan, center view, animate to node)
 * - Tooltip display on node hover
 * - Ping indicator for search result highlighting
 * - Theme-aware rendering (colors adjust based on dark/light mode)
 * 
 * The renderer must be recreated when theme changes, requiring careful
 * preservation of camera state (position, zoom level, angle) across recreation.
 * 
 * @class
 */
class RenderManager {
  /**
   * @param {GraphState} state - Shared graph state instance
   */
  constructor(state) {
    this.state = state;
    
    /** @type {HTMLElement|null} Tooltip DOM element */
    this.tooltip = null;
    
    /** @type {HTMLElement|null} Ping indicator DOM element */
    this.pingIndicator = null;
    
    /** @type {number|null} Timeout ID for auto-hiding ping indicator */
    this.pingTimeout = null;
    
    /** @type {string|null} Node ID that ping indicator is currently tracking */
    this.activePingNodeId = null;
  }

  /**
   * Create and initialize Sigma renderer
   * 
   * Sets up the renderer with theme-appropriate colors. In dark mode, we use
   * lighter text and darker edges. In light mode, darker text and lighter edges.
   * 
   * @param {boolean} isDarkMode - Whether dark mode is active
   */
  setupSigma(isDarkMode) {
    const container = document.getElementById("sigma-container");
    if (!container) {
      console.error("Sigma container not found");
      return;
    }
    
    // Theme-specific color configuration
    const edgeColor = isDarkMode ? "#535353ff" : "#d4d4d4ff";
    const labelColor = isDarkMode ? "#e0e0e0" : "#000000";
    
    this.state.renderer = new Sigma(this.state.graph, container, {
      minCameraRatio: 0.06,  // Maximum zoom in (smaller = more zoom)
      maxCameraRatio: 3.5,      // Maximum zoom out
      defaultEdgeColor: edgeColor,
      labelColor: { color: labelColor },
      // Label rendering settings
      renderLabels: true,
      labelRenderedSizeThreshold: 6,   // Only show labels when node is at least 6px on screen (higher = fewer labels when zoomed out)
      labelDensity: 0.35,              // Low density to show fewer labels when zoomed out
      labelGridCellSize: 100,  // Larger grid cell to reduce label collision/overlap
      zIndex: true,  // Enable z-index to render labels on top
    });
    
    this.state.camera = this.state.renderer.getCamera();
    
    // Adjust label density dynamically based on zoom level
    this.setupDynamicLabelDensity();
  }

  /**
   * Setup dynamic label density based on zoom level
   * 
   * Adjusts labelDensity as the camera ratio changes:
   * - When zoomed in (lower ratio), increase density to show more labels
   * - When zoomed out (higher ratio), decrease density to show fewer labels
   * 
   * The mapping uses a logarithmic scale to provide smooth transitions
   * across the zoom range (0.06 to 3.5).
   */
  setupDynamicLabelDensity() {
    if (!this.state.camera || !this.state.renderer) return;
    
    const updateLabelDensity = () => {
      const ratio = this.state.camera.ratio;
      
      // Map camera ratio to label density
      // ratio 0.06 (max zoom in) -> density ~0.8-1.0 (show most labels)
      // ratio 1.0 (default) -> density ~0.4-0.5
      // ratio 3.5 (max zoom out) -> density ~0.1-0.2 (show fewest labels)
      
      // Use logarithmic interpolation for smooth transitions
      const minRatio = 0.06;
      const maxRatio = 3.5;
      const minDensity = 0.15;  // When zoomed out
      const maxDensity = 0.9;   // When zoomed in
      
      // Normalize ratio to 0-1 range (inverted so zoom in = higher value)
      const normalizedRatio = 1 - Math.log(ratio / minRatio) / Math.log(maxRatio / minRatio);
      
      // Clamp to ensure we stay within bounds
      const clampedRatio = Math.max(0, Math.min(1, normalizedRatio));
      
      // Calculate new density
      const newDensity = minDensity + (maxDensity - minDensity) * clampedRatio;
      
      console.log(`Camera ratio: ${ratio.toFixed(2)}, Label density: ${newDensity.toFixed(2)}`);
      
      // Update the renderer's label density setting
      this.state.renderer.setSetting('labelDensity', newDensity);
    };
    
    // Update on camera updates (zoom, pan, etc.)
    this.state.camera.on('updated', updateLabelDensity);
    
    // Set initial density
    updateLabelDensity();
    
    // Update ping indicator position during camera movements
    this.state.camera.on('updated', () => {
      if (this.activePingNodeId) {
        this.updatePingPosition(this.activePingNodeId);
      }
    });
  }

  /**
   * Recreate renderer with new theme while preserving camera state
   * 
   * When theme changes, Sigma's colors don't update dynamically, so we must
   * kill the old renderer and create a new one. We preserve the camera state
   * (position, zoom, angle) to avoid jarring viewport changes.
   * 
   * @param {boolean} isDarkMode - Whether dark mode is active
   * @param {Function} rebindHoverCallback - Callback to rebind hover events after recreation
   */
  recreateRenderer(isDarkMode, rebindHoverCallback) {
    if (!this.state.renderer || !this.state.camera) return;
    
    // Preserve camera state before killing renderer
    const cameraState = this.state.camera.getState();
    
    this.state.renderer.kill();
    
    // Recreate with new theme
    this.setupSigma(isDarkMode);
    
    // Restore camera state
    this.state.camera.setState(cameraState);
    
    // Rebind hover events (they're lost when renderer is killed)
    if (rebindHoverCallback) {
      rebindHoverCallback();
    }
  }

  /**
   * Setup node hover tooltips
   * 
   * Displays a tooltip showing:
   * - Node label
   * - Parent name (with color)
   * - File and line number (if available)
   * - Incoming and outgoing edge counts
   * 
   * Tooltip follows mouse cursor within sigma container.
   */
  bindHoverEvents() {
    if (!this.state.renderer) return;
    
    this.tooltip = document.getElementById('tooltip');
    if (!this.tooltip) return;
    
    // Show tooltip when entering a node
    this.state.renderer.on('enterNode', ({ node }) => {
      const attrs = this.state.getNodeAttributes(node);
      if (!attrs) return;
      
      const inDegree = this.state.graph.inDegree(node);
      const outDegree = this.state.graph.outDegree(node);
      
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
      
      this.tooltip.innerHTML = content;
      this.tooltip.style.display = 'block';
    });
    
    // Hide tooltip when leaving a node
    this.state.renderer.on('leaveNode', () => {
      if (this.tooltip) {
        this.tooltip.style.display = 'none';
      }
    });
    
    // Move tooltip with mouse
    this.state.renderer.getMouseCaptor().on('mousemove', (e) => {
      if (this.tooltip && this.tooltip.style.display === 'block') {
        // Offset slightly from cursor to avoid blocking view
        this.tooltip.style.left = e.x + 10 + 'px';
        this.tooltip.style.top = e.y + 10 + 'px';
      }
    });
  }

  /**
   * Zoom in (decrease camera ratio)
   * 
   * @param {number} duration - Animation duration in milliseconds
   */
  zoomIn(duration = 600) {
    if (this.state.camera) {
      this.state.camera.animatedZoom({ duration });
    }
  }

  /**
   * Zoom out (increase camera ratio)
   * 
   * @param {number} duration - Animation duration in milliseconds
   */
  zoomOut(duration = 600) {
    if (this.state.camera) {
      this.state.camera.animatedUnzoom({ duration });
    }
  }

  /**
   * Reset camera to default centered view
   * 
   * Returns to origin (0.5, 0.5) with ratio 1 and no rotation.
   * 
   * @param {number} duration - Animation duration in milliseconds
   */
  centerView(duration = 600) {
    if (this.state.camera) {
      this.state.camera.animate(
        { x: 0.5, y: 0.5, ratio: 1, angle: 0 },
        { duration, easing: 'quadraticInOut' }
      );
    }
  }

  /**
   * Animate camera to focus on a specific node
   * 
   * Uses Sigma's viewport coordinate system (0-1 range) and zooms in by
   * reducing the ratio by 75% for better node visibility.
   * 
   * @param {string} nodeId - Node to zoom to
   */
  zoomToNode(nodeId) {
    if (!this.state.camera || !this.state.renderer || !this.state.hasNode(nodeId)) {
      return;
    }
    
    const nodeDisplayData = this.state.renderer.getNodeDisplayData(nodeId);
    if (!nodeDisplayData) return;
    
    // Show ping indicator and start tracking node during animation
    this.showPingOnNode(nodeId);
    
    // Get current camera ratio and zoom in more (multiply by 0.25)
    const currentState = this.state.camera.getState();
    
    // Start camera animation
    this.state.camera.animate(
      { ...nodeDisplayData, ratio: currentState.ratio * 0.20 },
      { duration: 600, easing: 'quadraticInOut' }
    );
    
    // Clear any existing timeout
    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout);
    }
    
    // Hide ping indicator after 2.5 seconds
    this.pingTimeout = setTimeout(() => {
      this.hidePing();
    }, 2500);
  }

  /**
   * Show ping indicator at node's viewport position
   * 
   * Converts graph coordinates (x, y) to viewport coordinates for positioning.
   * The ping indicator is a visual cue when hovering over search results.
   * 
   * @param {string} nodeId - Node to show ping indicator on
   */
  showPingOnNode(nodeId) {
    if (!this.state.renderer || !this.state.hasNode(nodeId)) return;
    
    // Clear any existing timeout when showing ping
    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout);
      this.pingTimeout = null;
    }
    
    this.activePingNodeId = nodeId;
    this.updatePingPosition(nodeId);
  }
  
  /**
   * Update ping indicator position for a specific node
   * 
   * @param {string} nodeId - Node to update ping position for
   */
  updatePingPosition(nodeId) {
    if (!this.state.renderer || !this.state.hasNode(nodeId)) return;
    
    this.pingIndicator = document.getElementById('ping-indicator');
    if (!this.pingIndicator) return;
    
    const nodeAttrs = this.state.getNodeAttributes(nodeId);
    const container = document.getElementById('sigma-container');
    if (!nodeAttrs || !container) return;
    
    const rect = container.getBoundingClientRect();
    
    // Convert graph coordinates to viewport coordinates
    const viewportPos = this.state.renderer.graphToViewport({ 
      x: nodeAttrs.x, 
      y: nodeAttrs.y 
    });
    
    this.pingIndicator.style.left = (rect.left + viewportPos.x) + 'px';
    this.pingIndicator.style.top = (rect.top + viewportPos.y) + 'px';
    this.pingIndicator.style.display = 'block';
  }

  /**
   * Hide ping indicator
   */
  hidePing() {
    // Clear timeout when manually hiding
    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout);
      this.pingTimeout = null;
    }
    
    this.activePingNodeId = null;
    
    this.pingIndicator = document.getElementById('ping-indicator');
    if (this.pingIndicator) {
      this.pingIndicator.style.display = 'none';
    }
  }

  /**
   * Refresh the renderer to reflect graph changes
   * 
   * Call this after modifying node/edge attributes, adding/removing nodes,
   * or any other graph mutation.
   */
  refresh() {
    if (this.state.renderer) {
      this.state.renderer.refresh();
    }
  }

  /**
   * Pulse a node's size to draw attention
   * 
   * Animates the node growing and shrinking 3 times. Useful for highlighting
   * search results or user actions.
   * 
   * @param {string} nodeId - Node to pulse
   */
  pulseNode(nodeId) {
    if (!this.state.hasNode(nodeId)) return;
    
    const attrs = this.state.getNodeAttributes(nodeId);
    const baseSize = attrs.baseSize || 5;
    let pulseCount = 0;
    
    const pulse = () => {
      if (pulseCount >= 6) {
        // Reset to normal size after 3 full pulses (6 steps)
        this.state.setNodeAttribute(nodeId, 'size', baseSize);
        this.refresh();
        return;
      }
      
      // Alternate between expanded and base size
      const isExpanding = pulseCount % 2 === 0;
      this.state.setNodeAttribute(nodeId, 'size', isExpanding ? baseSize * 2 : baseSize * 1.2);
      this.refresh();
      
      pulseCount++;
      setTimeout(pulse, 150);
    };
    
    pulse();
  }
}
