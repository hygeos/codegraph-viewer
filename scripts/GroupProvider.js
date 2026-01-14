/**
 * GroupProvider - Abstract base class for node grouping strategies
 * 
 * Defines the interface for different ways to group nodes in the graph.
 * Implementations can group by GEXF parent attribute, name prefix, file path, etc.
 * 
 * @abstract
 * @class
 */
class GroupProvider {
  /**
   * Get all group names from the graph
   * 
   * @param {Graph} graph - The graph to extract groups from
   * @returns {string[]} Sorted array of group names
   * @abstract
   */
  getGroups(graph) {
    throw new Error('getGroups() must be implemented by subclass');
  }

  /**
   * Get the group name for a specific node
   * 
   * @param {string} nodeId - Node identifier
   * @param {Object} attrs - Node attributes
   * @returns {string} Group name for this node
   * @abstract
   */
  getNodeGroup(nodeId, attrs) {
    throw new Error('getNodeGroup() must be implemented by subclass');
  }

  /**
   * Get the color for a specific group
   * 
   * @param {string} group - Group name
   * @returns {string} Hex color string
   * @abstract
   */
  getGroupColor(group) {
    throw new Error('getGroupColor() must be implemented by subclass');
  }

  /**
   * Set the color for a specific group
   * 
   * @param {string} group - Group name
   * @param {string} color - Hex color string
   * @abstract
   */
  setGroupColor(group, color) {
    throw new Error('setGroupColor() must be implemented by subclass');
  }

  /**
   * Get all group-to-color mappings
   * 
   * @returns {Object.<string, string>} Map of group names to colors
   * @abstract
   */
  getGroupColorMap() {
    throw new Error('getGroupColorMap() must be implemented by subclass');
  }

  /**
   * Set all group-to-color mappings
   * 
   * @param {Object.<string, string>} colorMap - Map of group names to colors
   * @abstract
   */
  setGroupColorMap(colorMap) {
    throw new Error('setGroupColorMap() must be implemented by subclass');
  }
}


/**
 * ParentGroupProvider - Groups nodes by their GEXF 'parent' attribute
 * 
 * This is the original grouping strategy that reads the parent attribute
 * from the GEXF file and assigns colors from a predefined palette.
 * 
 * @extends GroupProvider
 * @class
 */
class ParentGroupProvider extends GroupProvider {
  /**
   * Color palette for parent groups (same as original GexfParser)
   * @static
   */
  static COLOR_PALETTE = [
    "#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6",
    "#1abc9c", "#e67e22", "#34495e", "#95a5a6", "#c0392b",
    "#2980b9", "#27ae60", "#d35400", "#8e44ad", "#16a085",
    "#7f8c8d", "#f1c40f", "#bdc3c7", "#ecf0f1"
  ];

  /**
   * @param {Graph} graph - Graph instance with parent attributes
   */
  constructor(graph) {
    super();
    this.graph = graph;
    this.groups = [];
    this.groupColorMap = {};
    this._initialize();
  }

  /**
   * Initialize groups and colors from the graph
   * @private
   */
  _initialize() {
    // Collect all unique parent names
    const groupSet = new Set();
    this.graph.forEachNode((node, attrs) => {
      const parent = attrs.parent || 'unknown';
      groupSet.add(parent);
    });

    // Sort groups for consistency
    this.groups = Array.from(groupSet).sort();

    // Assign colors from palette
    this.groups.forEach((group, index) => {
      this.groupColorMap[group] = ParentGroupProvider.COLOR_PALETTE[index % ParentGroupProvider.COLOR_PALETTE.length];
    });

    console.log('ParentGroupProvider initialized with groups:', this.groups);
    console.log('Group color map:', this.groupColorMap);
  }

  /**
   * Get all group names
   * 
   * @returns {string[]} Array of parent group names
   */
  getGroups() {
    return this.groups;
  }

  /**
   * Get the group (parent) for a node
   * 
   * @param {string} nodeId - Node identifier
   * @param {Object} attrs - Node attributes
   * @returns {string} Parent group name
   */
  getNodeGroup(nodeId, attrs) {
    return attrs.parent || 'unknown';
  }

  /**
   * Get color for a group
   * 
   * @param {string} group - Group name
   * @returns {string} Hex color
   */
  getGroupColor(group) {
    return this.groupColorMap[group] || '#666666';
  }

  /**
   * Set color for a group
   * 
   * @param {string} group - Group name
   * @param {string} color - Hex color
   */
  setGroupColor(group, color) {
    this.groupColorMap[group] = color;
    
    // Update all nodes in this group
    this.graph.forEachNode((node, attrs) => {
      if (this.getNodeGroup(node, attrs) === group) {
        this.graph.setNodeAttribute(node, 'color', color);
      }
    });
  }

  /**
   * Get all group-to-color mappings
   * 
   * @returns {Object.<string, string>} Color map
   */
  getGroupColorMap() {
    return { ...this.groupColorMap };
  }

  /**
   * Set all group-to-color mappings
   * 
   * @param {Object.<string, string>} colorMap - New color map
   */
  setGroupColorMap(colorMap) {
    this.groupColorMap = { ...colorMap };
    
    // Update all node colors
    this.graph.forEachNode((node, attrs) => {
      const group = this.getNodeGroup(node, attrs);
      const color = this.groupColorMap[group] || '#666666';
      this.graph.setNodeAttribute(node, 'color', color);
    });
  }
}
