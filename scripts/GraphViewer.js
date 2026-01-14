/**
 * GraphViewer - Main orchestrator for graph visualization
 * 
 * Architecture:
 * GraphViewer acts as the main coordinator, instantiating and connecting
 * specialized manager components:
 * 
 * - GraphState: Centralized state (graph data, positions, filters)
 * - RenderManager: Sigma renderer lifecycle, camera, tooltips
 * - SearchManager: Search UI, node matching, result display
 * - FilterManager: Parent visibility, isolated nodes, presets
 * - LayoutManager: Force-directed layout, iteration tracking
 * - ThemeManager: Dark/light mode switching
 * - FileManager: GEXF file loading
 * 
 * Data flow:
 * 1. FileManager loads GEXF → triggers initialization
 * 2. GraphState parses and stores graph data
 * 3. RenderManager creates Sigma visualization
 * 4. User interactions flow through managers → update GraphState → trigger renders
 * 
 * Manager communication:
 * - All managers receive GraphState and/or RenderManager in constructor
 * - Managers call each other's methods directly (tightly coupled by design for simplicity)
 * - State changes always go through GraphState methods
 * 
 * Initialization order:
 * 1. Create all managers
 * 2. Bind UI controls (FileManager, ThemeManager always active)
 * 3. Wait for file load
 * 4. Initialize graph → bind remaining controls
 * 
 * @class
 */
class GraphViewer {
  constructor() {
    /** @type {boolean} Whether graph has been initialized */
    this.isInitialized = false;
    
    /** @type {Graph|null} Parsed graph before provider initialization */
    this.parsedGraph = null;
    
    // Create centralized state
    this.state = new GraphState();
    
    // Create managers (order matters for dependencies)
    this.renderManager = new RenderManager(this.state);
    this.searchManager = new SearchManager(this.state, this.renderManager);
    this.layoutManager = new LayoutManager(this.state, this.renderManager);
    this.filterManager = new FilterManager(this.state, this.renderManager, this.layoutManager);
    this.themeManager = new ThemeManager(this.renderManager);
    this.fileManager = new FileManager(
      (content, filename) => this.handleFileLoaded(content, filename),
      (error) => this.handleFileError(error)
    );
    
    // Bind controls that are always active (file loading, theme)
    this.fileManager.bindControls();
    this.themeManager.bindControls();
    this.layoutManager.bindControls();
    this.filterManager.bindControls();
    this.searchManager.bindControls();
    this.bindGroupingModeControls();
  }

  /**
   * Handle successful file load
   * 
   * @param {string} content - GEXF file content
   * @param {string} filename - Name of loaded file
   */
  async handleFileLoaded(content, filename) {
    try {
      await this.initialize(content, filename);
    } catch (error) {
      console.error('Failed to initialize graph:', error);
      console.error('Error details:', error.message, error.stack);
      this.layoutManager.updateUI('Error: ' + (error.message || 'Unknown error'), 'Start');
    }
  }

  /**
   * Handle file load error
   * 
   * @param {Error} error - Error object
   */
  handleFileError(error) {
    console.error('File load error:', error);
    this.layoutManager.updateUI('Error loading file', 'Start');
  }

  /**
   * Initialize graph from GEXF content
   * 
   * Steps:
   * 1. Clean previous state if reloading
   * 2. Parse GEXF and initialize GraphState
   * 3. Create GroupProvider for node grouping
   * 4. Initialize node positions (epicenter-based)
   * 5. Setup Sigma renderer
   * 6. Bind controls (first time only)
   * 7. Populate group sidebar
   * 8. Apply initial filters
   * 9. Clear search
   * 
   * @param {string} gexfContent - GEXF XML content
   * @param {string} filename - Name of loaded file
   */
  async initialize(gexfContent, filename) {
    // Clean up previous state if reloading
    if (this.isInitialized) {
      this.cleanState();
    }
    
    // Parse GEXF into graph
    this.parsedGraph = GexfParser.parse(gexfContent);
    
    // Determine which grouping mode to use
    const groupingMode = document.querySelector('input[name="grouping-mode"]:checked')?.value || 'parent';
    const groupProvider = this.createGroupProvider(groupingMode);
    
    // Initialize state with graph and provider
    this.state.initialize(this.parsedGraph, groupProvider);
    this.state.loadedFilename = filename;
    
    // Initialize node positions with epicenter layout
    this.layoutManager.initializeNodePositions();
    
    // Cache initial positions
    this.state.cacheNodePositions();
    
    // Setup Sigma renderer
    this.renderManager.setupSigma(this.themeManager.isDark());
    
    // Bind controls and hover events
    if (!this.isInitialized) {
      this.bindViewportControls();
      this.isInitialized = true;
    }
    
    this.renderManager.bindHoverEvents();
    this.renderManager.bindDragEvents();
    
    // Populate group sidebar
    this.filterManager.populateParentSidebar();
    
    // Apply initial filter state
    this.filterManager.applyInitialFilters();
    
    // Clear search
    this.searchManager.clearSearch();
    
    // Update UI
    this.layoutManager.updateUI('Ready (0/0)', 'Start');
  }

  /**
   * Create a group provider based on the selected mode
   * 
   * @param {string} mode - Either 'parent' or 'prefix'
   * @returns {GroupProvider} Appropriate group provider instance
   */
  createGroupProvider(mode) {
    const thresholdInput = document.getElementById('group-threshold');
    // Use threshold only for prefix mode, use 1 (no grouping) for parent mode
    const threshold = mode === 'prefix' ? parseInt(thresholdInput?.value || '3') : 1;
    
    if (mode === 'prefix') {
      const letterCount = parseInt(document.getElementById('prefix-length')?.value || '3');
      return new PrefixGroupProvider(this.parsedGraph, letterCount, threshold);
    } else {
      return new ParentGroupProvider(this.parsedGraph, threshold);
    }
  }

  /**
   * Bind grouping mode radio buttons and apply button
   */
  bindGroupingModeControls() {
    const parentRadio = document.querySelector('input[name="grouping-mode"][value="parent"]');
    const prefixRadio = document.querySelector('input[name="grouping-mode"][value="prefix"]');
    const prefixControls = document.getElementById('prefix-controls');
    const thresholdControls = document.getElementById('threshold-controls');
    const applyBtn = document.getElementById('apply-prefix');
    const thresholdInput = document.getElementById('group-threshold');
    
    // Show/hide prefix and threshold controls based on radio selection
    const updateControlsVisibility = () => {
      const isPrefixMode = prefixRadio?.checked;
      if (prefixControls) {
        prefixControls.style.display = isPrefixMode ? 'flex' : 'none';
      }
      if (thresholdControls) {
        thresholdControls.style.display = isPrefixMode ? 'flex' : 'none';
      }
      if (applyBtn) {
        applyBtn.style.display = isPrefixMode ? 'block' : 'none';
      }
    };
    
    if (parentRadio) {
      parentRadio.addEventListener('change', () => {
        updateControlsVisibility();
        if (this.parsedGraph && parentRadio.checked) {
          this.switchGroupProvider('parent');
        }
      });
    }
    
    if (prefixRadio) {
      prefixRadio.addEventListener('change', () => {
        updateControlsVisibility();
      });
    }
    
    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        if (this.parsedGraph && prefixRadio?.checked) {
          this.switchGroupProvider('prefix');
        }
      });
    }
    
    // Threshold change triggers regrouping
    if (thresholdInput) {
      thresholdInput.addEventListener('change', () => {
        if (this.parsedGraph) {
          const mode = document.querySelector('input[name="grouping-mode"]:checked')?.value || 'parent';
          this.switchGroupProvider(mode);
        }
      });
    }
    
    // Initialize visibility
    updateControlsVisibility();
  }

  /**
   * Switch to a different group provider and rebuild the graph
   * 
   * @param {string} mode - Either 'parent' or 'prefix'
   */
  switchGroupProvider(mode) {
    if (!this.state.graph) return;
    
    // Cache current positions
    this.state.cacheNodePositions();
    
    // Create new provider
    const newProvider = this.createGroupProvider(mode);
    
    // Update state with new provider
    this.state.groupProvider = newProvider;
    
    // Apply colors from new provider
    this.state.graph.forEachNode((node, attrs) => {
      const group = newProvider.getNodeGroup(node, attrs);
      const color = newProvider.getGroupColor(group);
      this.state.setNodeAttribute(node, 'color', color);
    });
    
    this.state.fullGraph.forEachNode((node, attrs) => {
      const group = newProvider.getNodeGroup(node, attrs);
      const color = newProvider.getGroupColor(group);
      this.state.fullGraph.setNodeAttribute(node, 'color', color);
    });
    
    // Reset visible groups to all groups
    const groups = newProvider.getGroups(this.state.graph);
    this.state.visibleGroups = new Set(groups);
    
    // Rebuild graph with new grouping
    const removeIsolatedCheckbox = document.getElementById('remove-isolated');
    const removeIsolated = removeIsolatedCheckbox ? removeIsolatedCheckbox.checked : false;
    this.state.rebuildFilteredGraph(removeIsolated);
    
    // Restore positions
    this.state.restoreNodePositions();
    
    // Update UI
    this.renderManager.refresh();
    this.filterManager.populateParentSidebar();
    this.searchManager.clearSearch();
    
    console.log(`Switched to ${mode} grouping mode with ${groups.length} groups`);
  }

  /**
   * Clean up all state when reloading
   */
  cleanState() {
    this.state.cleanState();
    this.layoutManager.reset();
    this.searchManager.clearSearch();
  }

  /**
   * Bind viewport control buttons (zoom, center)
   * 
   * These are bound once during initialization and don't need rebinding.
   */
  bindViewportControls() {
    const zoomInBtn = document.getElementById("zoom-in");
    const zoomOutBtn = document.getElementById("zoom-out");
    const centerViewBtn = document.getElementById("center-view");

    if (zoomInBtn) {
      zoomInBtn.addEventListener("click", () => {
        this.renderManager.zoomIn();
      });
    }
    
    if (zoomOutBtn) {
      zoomOutBtn.addEventListener("click", () => {
        this.renderManager.zoomOut();
      });
    }
    
    if (centerViewBtn) {
      centerViewBtn.addEventListener("click", () => {
        this.renderManager.centerView();
      });
    }
  }
}
