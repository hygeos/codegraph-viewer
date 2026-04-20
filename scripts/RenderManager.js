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
    
    /** @type {string|null} Node currently being dragged */
    this.draggedNode = null;
    
    /** @type {boolean} Whether dragging is enabled */
    this.isDragging = false;
    
    /** @type {string|null} Currently hovered node for tooltip positioning */
    this.hoveredNode = null;

    /** @type {Set<string>} Incoming neighbors of hovered node */
    this.hoveredInNeighbors = new Set();

    /** @type {Set<string>} Outgoing neighbors of hovered node */
    this.hoveredOutNeighbors = new Set();
    
    /** @type {boolean} Current theme mode */
    this.isDarkMode = false;

    /** @type {boolean} Whether to display directional arrow edges */
    this.directionalEdgesEnabled = true;

    /** @type {boolean|null} Cached support status for arrow edge type */
    this.directionalEdgeTypeSupported = null;

    /** @type {{runningScale:number, static:{autoScaleWithZoom:boolean, referenceRatio:number, zoomExponent:number, minScale:number, maxScale:number}}} */
    this.nodeStyleConfig = this.buildNodeStyleConfig();

    /** @type {{runningThickness:number, static:{autoScaleWithZoom:boolean, baseThickness:number, minThickness:number, maxThickness:number, referenceRatio:number, zoomExponent:number}}} */
    this.edgeStyleConfig = this.buildEdgeStyleConfig();

    /** @type {{enabled:boolean, hideNonNeighborhoodNodes:boolean, nonNeighborhoodNodeColor:string, nonNeighborhoodNodeOpacity:number, hideNonIncidentEdges:boolean, nonIncidentEdgeOpacity:number, nonIncidentEdgeColor:string, incomingEdgeColor:string, outgoingEdgeColor:string, selfLoopEdgeColor:string, incidentEdgeOpacity:number}} */
    this.staticNeighborhoodConfig = this.buildStaticNeighborhoodConfig();
  }

  /**
   * Build edge-style config from global tuning values with safe defaults
   *
   * @returns {{runningThickness:number, static:{autoScaleWithZoom:boolean, baseThickness:number, minThickness:number, maxThickness:number, referenceRatio:number, zoomExponent:number}}}
   */
  buildEdgeStyleConfig() {
    const tuning = window.GRAPH_RENDER_TUNING || {};
    const edgeStyle = tuning.edgeStyle || {};
    const staticCfg = edgeStyle.static || {};

    return {
      runningThickness: this.toNumber(edgeStyle.runningThickness, 0.9),
      static: {
        autoScaleWithZoom: staticCfg.autoScaleWithZoom !== false,
        baseThickness: this.toNumber(staticCfg.baseThickness, 1.8),
        minThickness: this.toNumber(staticCfg.minThickness, 0.8),
        maxThickness: this.toNumber(staticCfg.maxThickness, 7.0),
        referenceRatio: this.toNumber(staticCfg.referenceRatio, 1.0),
        zoomExponent: this.toNumber(staticCfg.zoomExponent, 0.65)
      }
    };
  }

  /**
   * Build node-style config from global tuning values with safe defaults
   *
   * @returns {{runningScale:number, static:{autoScaleWithZoom:boolean, referenceRatio:number, zoomExponent:number, minScale:number, maxScale:number}}}
   */
  buildNodeStyleConfig() {
    const tuning = window.GRAPH_RENDER_TUNING || {};
    const nodeStyle = tuning.nodeStyle || {};
    const staticCfg = nodeStyle.static || {};

    return {
      runningScale: this.toNumber(nodeStyle.runningScale, 1.0),
      static: {
        autoScaleWithZoom: staticCfg.autoScaleWithZoom !== false,
        referenceRatio: this.toNumber(staticCfg.referenceRatio, 1.0),
        zoomExponent: this.toNumber(staticCfg.zoomExponent, 0.45),
        minScale: this.toNumber(staticCfg.minScale, 0.8),
        maxScale: this.toNumber(staticCfg.maxScale, 2.4)
      }
    };
  }

  /**
   * Coerce a value to number with fallback
   *
   * @param {*} value - Value to parse
   * @param {number} fallback - Fallback value
   * @returns {number}
   */
  toNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  /**
   * Coerce a value to a non-empty color string with fallback
   *
   * @param {*} value - Candidate color string
   * @param {string} fallback - Fallback color
   * @returns {string}
   */
  toColor(value, fallback) {
    return typeof value === 'string' && value.trim() ? value : fallback;
  }

  /**
   * Build static-hover neighborhood config from tuning values
   *
   * @returns {{enabled:boolean, hideNonNeighborhoodNodes:boolean, nonNeighborhoodNodeColor:string, nonNeighborhoodNodeOpacity:number, hideNonIncidentEdges:boolean, nonIncidentEdgeOpacity:number, nonIncidentEdgeColor:string, incomingEdgeColor:string, outgoingEdgeColor:string, selfLoopEdgeColor:string, incidentEdgeOpacity:number}}
   */
  buildStaticNeighborhoodConfig() {
    const tuning = window.GRAPH_RENDER_TUNING || {};
    const edgeStyle = tuning.edgeStyle || {};
    const cfg = edgeStyle.staticNeighborhood || {};

    return {
      enabled: cfg.enabled !== false,
      hideNonNeighborhoodNodes: cfg.hideNonNeighborhoodNodes === true,
      nonNeighborhoodNodeColor: this.toColor(cfg.nonNeighborhoodNodeColor, '#b8b8b8'),
      nonNeighborhoodNodeOpacity: this.clamp(this.toNumber(cfg.nonNeighborhoodNodeOpacity, 0.18), 0, 1),
      hideNonIncidentEdges: cfg.hideNonIncidentEdges !== false,
      nonIncidentEdgeOpacity: this.clamp(this.toNumber(cfg.nonIncidentEdgeOpacity, 0.08), 0, 1),
      nonIncidentEdgeColor: this.toColor(cfg.nonIncidentEdgeColor, '#bdbdbd'),
      incomingEdgeColor: this.toColor(cfg.incomingEdgeColor, '#2f80ed'),
      outgoingEdgeColor: this.toColor(cfg.outgoingEdgeColor, '#f2994a'),
      selfLoopEdgeColor: this.toColor(cfg.selfLoopEdgeColor, '#9b51e0'),
      incidentEdgeOpacity: this.clamp(this.toNumber(cfg.incidentEdgeOpacity, 1), 0, 1)
    };
  }

  /**
   * Clamp number in [min, max]
   *
   * @param {number} value - Candidate value
   * @param {number} min - Minimum bound
   * @param {number} max - Maximum bound
   * @returns {number}
   */
  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Compute edge thickness for current renderer state
   *
   * Static mode supports zoom autoscaling from RenderTuning config.
   * Running mode uses a fixed thin edge width for performance/readability.
   *
   * @returns {number}
   */
  computeEdgeThickness() {
    if (!this.directionalEdgesEnabled) {
      return this.edgeStyleConfig.runningThickness;
    }

    const cfg = this.edgeStyleConfig.static;
    let thickness = cfg.baseThickness;

    if (cfg.autoScaleWithZoom) {
      const ratio = this.state.camera ? this.state.camera.ratio : cfg.referenceRatio;
      const safeRatio = Math.max(ratio, 0.001);
      const safeReference = Math.max(cfg.referenceRatio, 0.001);
      const zoomFactor = Math.pow(safeReference / safeRatio, cfg.zoomExponent);
      thickness *= zoomFactor;
    }

    return this.clamp(thickness, cfg.minThickness, cfg.maxThickness);
  }

  /**
   * Compute node scale factor for current renderer state
   *
   * Static mode can autoscale by zoom, running mode uses a fixed multiplier.
   *
   * @returns {number}
   */
  computeNodeScaleFactor() {
    if (!this.directionalEdgesEnabled) {
      return this.nodeStyleConfig.runningScale;
    }

    const cfg = this.nodeStyleConfig.static;
    let scale = 1.0;

    if (cfg.autoScaleWithZoom) {
      const ratio = this.state.camera ? this.state.camera.ratio : cfg.referenceRatio;
      const safeRatio = Math.max(ratio, 0.001);
      const safeReference = Math.max(cfg.referenceRatio, 0.001);
      const zoomFactor = Math.pow(safeReference / safeRatio, cfg.zoomExponent);
      scale *= zoomFactor;
    }

    return this.clamp(scale, cfg.minScale, cfg.maxScale);
  }

  /**
   * Compute node size for reducer output
   *
   * @param {string} node - Node identifier
   * @param {Object} data - Node display data
   * @returns {number}
   */
  computeNodeSize(node, data) {
    const attrs = this.state.getNodeAttributes(node);
    const baseSize = this.toNumber((attrs && attrs.baseSize) || data.size, 4);
    const scaleFactor = this.computeNodeScaleFactor();
    return Math.max(0.1, baseSize * scaleFactor);
  }

  /**
   * Whether static hover neighborhood reducers should be active
   *
   * @returns {boolean}
   */
  isStaticNeighborhoodActive() {
    return this.directionalEdgesEnabled && this.staticNeighborhoodConfig.enabled && !!this.hoveredNode;
  }

  /**
   * Update hovered node reducer state
   *
   * @param {string|undefined} nodeId - Hovered node identifier
   * @param {boolean} shouldRefresh - Whether to refresh renderer
   */
  setHoveredNode(nodeId, shouldRefresh = true) {
    const graph = this.state.graph;

    if (!graph || !nodeId || !graph.hasNode(nodeId) || !this.directionalEdgesEnabled || !this.staticNeighborhoodConfig.enabled) {
      this.hoveredNode = null;
      this.hoveredInNeighbors.clear();
      this.hoveredOutNeighbors.clear();
      if (shouldRefresh) {
        this.refresh({ skipIndexation: true });
      }
      return;
    }

    this.hoveredNode = nodeId;

    const inNeighbors = typeof graph.inNeighbors === 'function' ? graph.inNeighbors(nodeId) : graph.neighbors(nodeId);
    const outNeighbors = typeof graph.outNeighbors === 'function' ? graph.outNeighbors(nodeId) : graph.neighbors(nodeId);

    this.hoveredInNeighbors = new Set(inNeighbors);
    this.hoveredOutNeighbors = new Set(outNeighbors);

    if (shouldRefresh) {
      this.refresh({ skipIndexation: true });
    }
  }

  /**
   * Reducer for node display data
   *
   * @param {string} node - Node identifier
   * @param {Object} data - Node display data
   * @returns {Object}
   */
  reduceNodeAppearance(node, data) {
    const res = { ...data };
    res.size = this.computeNodeSize(node, data);

    if (!this.isStaticNeighborhoodActive()) {
      return res;
    }

    const isHovered = node === this.hoveredNode;
    const isInNeighbor = this.hoveredInNeighbors.has(node);
    const isOutNeighbor = this.hoveredOutNeighbors.has(node);
    const inNeighborhood = isHovered || isInNeighbor || isOutNeighbor;

    if (!inNeighborhood) {
      if (this.staticNeighborhoodConfig.hideNonNeighborhoodNodes) {
        res.hidden = true;
      } else {
        res.label = '';
        res.color = this.staticNeighborhoodConfig.nonNeighborhoodNodeColor;
        res.opacity = this.staticNeighborhoodConfig.nonNeighborhoodNodeOpacity;
      }
      return res;
    }

    res.hidden = false;
    res.opacity = 1;

    if (isHovered) {
      res.highlighted = true;
      res.forceLabel = true;
    }

    return res;
  }

  /**
   * Reducer for edge display data
   *
   * @param {string} edge - Edge identifier
   * @param {Object} data - Edge display data
   * @returns {Object}
   */
  reduceEdgeAppearance(edge, data) {
    const res = { ...data };
    res.size = this.computeEdgeThickness();

    if (!this.isStaticNeighborhoodActive() || !this.state.graph) {
      return res;
    }

    const source = this.state.graph.source(edge);
    const target = this.state.graph.target(edge);
    const isOutgoing = source === this.hoveredNode;
    const isIncoming = target === this.hoveredNode;
    const isIncident = isOutgoing || isIncoming;

    if (!isIncident) {
      if (this.staticNeighborhoodConfig.hideNonIncidentEdges) {
        res.hidden = true;
      } else {
        res.opacity = this.staticNeighborhoodConfig.nonIncidentEdgeOpacity;
        res.color = this.staticNeighborhoodConfig.nonIncidentEdgeColor;
      }
      return res;
    }

    res.hidden = false;
    res.opacity = this.staticNeighborhoodConfig.incidentEdgeOpacity;

    if (isOutgoing && isIncoming) {
      res.color = this.staticNeighborhoodConfig.selfLoopEdgeColor;
    } else if (isOutgoing) {
      res.color = this.staticNeighborhoodConfig.outgoingEdgeColor;
    } else {
      res.color = this.staticNeighborhoodConfig.incomingEdgeColor;
    }

    return res;
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
    
    // Store theme state
    this.isDarkMode = isDarkMode;
    
    // Theme-specific color configuration
    const edgeColor = isDarkMode ? "#535353ff" : "#d4d4d4ff";
    const labelColor = isDarkMode ? "#e0e0e0" : "#000000";
    const hoveredLabelBgColor = isDarkMode ? "#000000" : "#ffffff";
    const hoveredLabelColor = isDarkMode ? "#e0e0e0" : "#000000";
    
    this.state.renderer = new Sigma(this.state.graph, container, {
      minCameraRatio: 0.06,
      maxCameraRatio: 3.5,
      defaultEdgeColor: edgeColor,
      defaultEdgeType: "line",
      minEdgeThickness: 0.1,
      labelColor: { color: labelColor },
      labelFont: "sans-serif",
      labelSize: 12,
      labelWeight: "normal",
      
      // Disable default hover rendering completely
      enableEdgeHoverEvents: false,
      
      // Override ALL hover rendering
      hoverRenderer: (context, data, settings) => {
        // Draw the node itself
        const { x, y, size, color } = data;
        context.fillStyle = color;
        context.beginPath();
        context.arc(x, y, size, 0, Math.PI * 2);
        context.fill();
        
        // Draw outline around hovered node
        context.strokeStyle = isDarkMode ? "#ffffff" : "#000000";
        context.lineWidth = 2;
        context.beginPath();
        context.arc(x, y, size, 0, Math.PI * 2);
        context.stroke();
        
        // Get node data for detailed info
        const nodeId = data.key;
        const attrs = this.state.getNodeAttributes(nodeId);
        const inDegree = this.state.graph.inDegree(nodeId);
        const outDegree = this.state.graph.outDegree(nodeId);
        
        // Build multi-line label with all info
        const labelSize = settings.labelSize;
        const font = settings.labelFont;
        const weight = settings.labelWeight;
        const lineHeight = labelSize + 4;
        
        context.font = `bold ${labelSize}px ${font}`;
        
        // Prepare all lines
        const lines = [];
        lines.push({ text: data.label || nodeId, isBold: true });
        lines.push({ text: '━'.repeat(30), isBold: false }); // Separator line
        if (attrs.file) {
          const fileLine = attrs.line ? `${attrs.file}:${attrs.line}` : attrs.file;
          lines.push({ text: `File: ${fileLine}`, isBold: false });
        }
        lines.push({ text: `Calls: ${outDegree}`, isBold: false });
        lines.push({ text: `Called by: ${inDegree}`, isBold: false });
        
        // Calculate max width
        let maxWidth = 0;
        lines.forEach(line => {
          if (line.isBold) {
            context.font = `bold ${labelSize}px ${font}`;
          } else {
            context.font = `${weight} ${labelSize}px ${font}`;
          }
          const width = context.measureText(line.text).width;
          if (width > maxWidth) maxWidth = width;
        });
        
        const padding = 8;
        const boxWidth = maxWidth + padding * 2;
        const boxHeight = lines.length * lineHeight + padding * 2;
        
        // Calculate label position (to the right of the node)
        const labelX = x + size + 4;
        const labelY = y - size - 1;
        
        // Clear any shadows
        context.shadowOffsetX = 0;
        context.shadowOffsetY = 0;
        context.shadowBlur = 0;
        context.shadowColor = 'transparent';
        
        // Draw background rectangle
        context.fillStyle = hoveredLabelBgColor;
        context.fillRect(
          labelX,
          labelY,
          boxWidth,
          boxHeight
        );
        
        // Draw 1px border
        context.strokeStyle = hoveredLabelColor;
        context.lineWidth = 1;
        context.strokeRect(
          labelX,
          labelY,
          boxWidth,
          boxHeight
        );
        
        // Draw each line of text with inverted color (left-aligned)
        context.fillStyle = hoveredLabelColor;
        context.textAlign = "left";
        context.textBaseline = "top";
        
        lines.forEach((line, index) => {
          if (line.isBold) {
            context.font = `bold ${labelSize}px ${font}`;
          } else {
            context.font = `${weight} ${labelSize}px ${font}`;
          }
          context.fillText(line.text, labelX + padding, labelY + padding + index * lineHeight);
        });
      },
      nodeReducer: (node, data) => this.reduceNodeAppearance(node, data),
      edgeReducer: (edge, data) => this.reduceEdgeAppearance(edge, data),
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

    // Apply edge mode according to current layout state.
    this.applyDirectionalEdgeType(false);
  }

  /**
   * Update renderer edge mode based on layout running state
   *
   * @param {boolean} isLayoutRunning - Whether force layout is currently running
   */
  setLayoutRunning(isLayoutRunning) {
    if (isLayoutRunning) {
      this.setHoveredNode(undefined, false);
    }
    this.directionalEdgesEnabled = !isLayoutRunning;
    this.applyDirectionalEdgeType();
  }

  /**
   * Apply the current edge type setting to Sigma
   *
   * Falls back to line edges if arrow type is unavailable in the loaded Sigma build.
   *
   * @param {boolean} shouldRefresh - Whether to refresh the renderer after applying
   */
  applyDirectionalEdgeType(shouldRefresh = true) {
    if (!this.state.renderer) return;

    const wantsArrows = this.directionalEdgesEnabled;
    const requestedType = wantsArrows && this.directionalEdgeTypeSupported !== false ? 'arrow' : 'line';

    try {
      this.state.renderer.setSetting('defaultEdgeType', requestedType);
      if (requestedType === 'arrow') {
        this.directionalEdgeTypeSupported = true;
      }
    } catch (error) {
      if (requestedType === 'arrow') {
        console.warn('Arrow edge type is not available in this Sigma build, falling back to line edges.', error);
        this.directionalEdgeTypeSupported = false;
        this.state.renderer.setSetting('defaultEdgeType', 'line');
      } else {
        throw error;
      }
    }

    if (shouldRefresh) {
      this.refresh();
    }
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
    
    // Rebind drag events as well
    this.bindDragEvents();
  }

  /**
   * Setup node hover events
   * 
   * Hover information is now displayed directly in the hovered label.
   */
  bindHoverEvents() {
    if (!this.state.renderer) return;

    this.state.renderer.on('enterNode', ({ node }) => {
      this.setHoveredNode(node);
    });

    this.state.renderer.on('leaveNode', () => {
      this.setHoveredNode(undefined);
    });
  }

  /**
   * Setup node drag and drop
   * 
   * Allows users to click and drag nodes to reposition them manually.
   * Useful for fine-tuning the layout after force-directed algorithm runs.
   */
  bindDragEvents() {
    if (!this.state.renderer) return;
    
    // Start dragging on mouse down over a node
    this.state.renderer.on('downNode', (e) => {
      this.isDragging = true;
      this.draggedNode = e.node;
      this.state.renderer.getGraph().setNodeAttribute(e.node, 'highlighted', true);
    });
    
    // Update node position during drag
    this.state.renderer.getMouseCaptor().on('mousemovebody', (e) => {
      if (!this.isDragging || !this.draggedNode) return;
      
      // Get new position from mouse coordinates
      const pos = this.state.renderer.viewportToGraph(e);
      
      // Update node position
      this.state.setNodeAttribute(this.draggedNode, 'x', pos.x);
      this.state.setNodeAttribute(this.draggedNode, 'y', pos.y);
      
      // Prevent camera from moving
      e.preventSigmaDefault();
      e.original.preventDefault();
      e.original.stopPropagation();
    });
    
    // Stop dragging on mouse up
    this.state.renderer.getMouseCaptor().on('mouseup', () => {
      if (this.draggedNode) {
        this.state.renderer.getGraph().removeNodeAttribute(this.draggedNode, 'highlighted');
        this.draggedNode = null;
      }
      this.isDragging = false;
    });
    
    // Stop dragging if mouse leaves container
    this.state.renderer.getMouseCaptor().on('mouseleave', () => {
      if (this.draggedNode) {
        this.state.renderer.getGraph().removeNodeAttribute(this.draggedNode, 'highlighted');
        this.draggedNode = null;
      }
      this.isDragging = false;
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
  refresh(options) {
    if (this.state.renderer) {
      this.state.renderer.refresh(options);
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
