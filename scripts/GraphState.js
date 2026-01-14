/**
 * GraphState - Centralized state manager for graph visualization
 * 
 * Manages the dual-graph pattern where we maintain both:
 * - fullGraph: Complete unfiltered graph with all nodes (authoritative source)
 * - graph: Filtered/visible graph based on current filters (what gets rendered)
 * 
 * This pattern allows non-destructive filtering - we can hide/show nodes without
 * losing their data or positions. Position synchronization between both graphs
 * is critical for smooth transitions when filters change.
 * 
 * @class
 */
class GraphState {
  constructor() {
    /** @type {Graph|null} Current filtered/visible graph instance */
    this.graph = null;
    
    /** @type {Graph|null} Complete backup with ALL nodes (never filtered) */
    this.fullGraph = null;
    
    /** @type {Object.<string, {x: number, y: number}>} Position cache for all nodes (visible + hidden) */
    this.nodePositions = {};
    
    /** @type {Set<string>} Set of currently visible group names */
    this.visibleGroups = new Set();
    
    /** @type {GroupProvider|null} Active grouping strategy */
    this.groupProvider = null;
    
    /** @type {Sigma|null} Sigma.js renderer instance */
    this.renderer = null;
    
    /** @type {Camera|null} Sigma.js camera controller for zoom/pan */
    this.camera = null;
    
    /** @type {string} Name of the currently loaded file */
    this.loadedFilename = null;
  }

  /**
   * Initialize graph state with parsed GEXF data and group provider
   * Creates both the working graph and full backup, initializes visible groups
   * 
   * @param {Graph} parsedGraph - Graph instance from GexfParser
   * @param {GroupProvider} groupProvider - Grouping strategy instance
   */
  initialize(parsedGraph, groupProvider) {
    this.graph = parsedGraph;
    this.fullGraph = parsedGraph.copy();
    this.groupProvider = groupProvider;
    
    // Apply colors from group provider to all nodes
    this.graph.forEachNode((node, attrs) => {
      const group = this.groupProvider.getNodeGroup(node, attrs);
      const color = this.groupProvider.getGroupColor(group);
      this.graph.setNodeAttribute(node, 'color', color);
    });
    
    // Also apply to fullGraph
    this.fullGraph.forEachNode((node, attrs) => {
      const group = this.groupProvider.getNodeGroup(node, attrs);
      const color = this.groupProvider.getGroupColor(group);
      this.fullGraph.setNodeAttribute(node, 'color', color);
    });
    
    // Initialize all groups as visible
    const groups = this.groupProvider.getGroups(this.graph);
    this.visibleGroups = new Set(groups);
    
    this.nodePositions = {};
  }

  /**
   * Clean up all state - used when reloading a new graph
   * Kills renderer and resets all properties to initial state
   */
  cleanState() {
    if (this.renderer) {
      this.renderer.kill();
      this.renderer = null;
    }
    
    this.graph = null;
    this.fullGraph = null;
    this.nodePositions = {};
    this.visibleGroups = new Set();
    this.groupProvider = null;
    this.camera = null;
    this.loadedFilename = null;
  }

  /**
   * Cache current node positions from the working graph
   * 
   * Stores positions in the cache AND updates fullGraph to ensure positions
   * persist across filtering operations. This is called before any operation
   * that rebuilds the graph (filtering, toggling parents, etc.)
   */
  cacheNodePositions() {
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

  /**
   * Restore cached positions to visible nodes in the working graph
   * 
   * Called after rebuilding the graph to ensure nodes appear at their
   * previous positions rather than being re-initialized randomly
   */
  restoreNodePositions() {
    this.graph.forEachNode((node) => {
      if (this.nodePositions[node]) {
        this.graph.setNodeAttribute(node, 'x', this.nodePositions[node].x);
        this.graph.setNodeAttribute(node, 'y', this.nodePositions[node].y);
      }
    });
  }

  /**
   * Rebuild the working graph based on current filter state
   * 
   * The cache-rebuild-restore cycle:
   * 1. Cache current positions (cacheNodePositions)
   * 2. Rebuild graph from fullGraph (this method)
   * 3. Restore positions (restoreNodePositions)
   * 
   * This cycle preserves node positions during filtering operations.
   * 
   * @param {boolean} removeIsolated - Whether to remove nodes with degree 0
   */
  rebuildFilteredGraph(removeIsolated = false) {
    // Clear current graph
    this.graph.clear();
    
    // Add nodes from visible groups
    this.fullGraph.forEachNode((node, attrs) => {
      const group = this.groupProvider.getNodeGroup(node, attrs);
      if (this.visibleGroups.has(group)) {
        this.graph.addNode(node, { ...attrs });
      }
    });
    
    // Add edges where both source and target are visible
    this.fullGraph.forEachEdge((edge, attrs, source, target) => {
      if (this.graph.hasNode(source) && this.graph.hasNode(target)) {
        this.graph.addEdge(source, target, { ...attrs });
      }
    });
    
    // Apply isolated nodes filter if requested
    if (removeIsolated) {
      const nodesToRemove = [];
      this.graph.forEachNode((node) => {
        if (this.graph.degree(node) === 0) {
          nodesToRemove.push(node);
        }
      });
      nodesToRemove.forEach(node => this.graph.dropNode(node));
    }
  }

  /**
   * Toggle visibility of a group
   * 
   * @param {string} group - Group name to toggle
   * @param {boolean} visible - Whether to make visible (true) or hidden (false)
   */
  toggleGroupVisibility(group, visible) {
    if (visible) {
      this.visibleGroups.add(group);
    } else {
      this.visibleGroups.delete(group);
    }
  }

  /**
   * Get list of group names from the group provider
   * 
   * @returns {string[]} Array of group names
   */
  getGroups() {
    return this.groupProvider ? this.groupProvider.getGroups(this.graph) : [];
  }

  /**
   * Get group color map from the group provider
   * 
   * @returns {Object.<string, string>} Map of group names to hex colors
   */
  getGroupColorMap() {
    return this.groupProvider ? this.groupProvider.getGroupColorMap() : {};
  }

  /**
   * Set group color map on the group provider
   * 
   * @param {Object.<string, string>} colorMap - Map of group names to hex colors
   */
  setGroupColorMap(colorMap) {
    if (this.groupProvider) {
      this.groupProvider.setGroupColorMap(colorMap);
    }
  }

  /**
   * Check if a node exists in the working graph
   * 
   * @param {string} nodeId - Node identifier
   * @returns {boolean} True if node exists
   */
  hasNode(nodeId) {
    return this.graph && this.graph.hasNode(nodeId);
  }

  /**
   * Get node attributes
   * 
   * @param {string} nodeId - Node identifier
   * @returns {Object} Node attributes object
   */
  getNodeAttributes(nodeId) {
    return this.graph ? this.graph.getNodeAttributes(nodeId) : null;
  }

  /**
   * Set a single node attribute
   * 
   * @param {string} nodeId - Node identifier
   * @param {string} attrName - Attribute name
   * @param {*} value - Attribute value
   */
  setNodeAttribute(nodeId, attrName, value) {
    if (this.graph && this.graph.hasNode(nodeId)) {
      this.graph.setNodeAttribute(nodeId, attrName, value);
    }
  }

  /**
   * Get the degree (total edges) of a node
   * 
   * @param {string} nodeId - Node identifier
   * @returns {number} Node degree
   */
  getNodeDegree(nodeId) {
    return this.graph ? this.graph.degree(nodeId) : 0;
  }

  /**
   * Iterate over all nodes in the working graph
   * 
   * @param {Function} callback - Function called for each node (nodeId, attributes)
   */
  forEachNode(callback) {
    if (this.graph) {
      this.graph.forEachNode(callback);
    }
  }

  /**
   * Iterate over all nodes in the full (unfiltered) graph
   * 
   * @param {Function} callback - Function called for each node (nodeId, attributes)
   */
  forEachFullGraphNode(callback) {
    if (this.fullGraph) {
      this.fullGraph.forEachNode(callback);
    }
  }
}
