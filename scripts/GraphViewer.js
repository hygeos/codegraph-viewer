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
    
    // Create centralized state
    this.state = new GraphState();
    
    // Create managers (order matters for dependencies)
    this.renderManager = new RenderManager(this.state);
    this.searchManager = new SearchManager(this.state, this.renderManager);
    this.filterManager = new FilterManager(this.state, this.renderManager);
    this.layoutManager = new LayoutManager(this.state, this.renderManager);
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
   * 3. Initialize node positions (epicenter-based)
   * 4. Setup Sigma renderer
   * 5. Bind controls (first time only)
   * 6. Populate parent sidebar
   * 7. Apply initial filters
   * 8. Clear search
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
    const parsedGraph = GexfParser.parse(gexfContent);
    this.state.initialize(parsedGraph);
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
    
    // Populate parent sidebar
    this.filterManager.populateParentSidebar();
    
    // Apply initial filter state
    this.filterManager.applyInitialFilters();
    
    // Clear search
    this.searchManager.clearSearch();
    
    // Update UI
    this.layoutManager.updateUI('Ready (0/0)', 'Start');
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
