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
    "#1abc9c", "#e67e22", "#4a6e92ff", "#533faaff", "#c0392b",
    "#2980b9", "#27ae60", "#d35400", "#8e44ad", "#16a085",
    "#54b39bff", "#f1c40f", "#a089c5ff", "#a2a84dff"
  ];

  /**
   * @param {Graph} graph - Graph instance with parent attributes
   * @param {number} minThreshold - Minimum nodes required for a group (default: 1, no threshold)
   */
  constructor(graph, minThreshold = 1) {
    super();
    this.graph = graph;
    this.minThreshold = Math.max(1, minThreshold);
    this.groups = [];
    this.groupColorMap = {};
    this._initialize();
  }

  /**
   * Initialize groups and colors from the graph
   * Groups with fewer than minThreshold nodes are merged into 'other'
   * @private
   */
  _initialize() {
    // Count nodes per parent
    const groupCounts = {};
    this.graph.forEachNode((node, attrs) => {
      const parent = attrs.parent || 'unknown';
      groupCounts[parent] = (groupCounts[parent] || 0) + 1;
    });

    // Separate groups above and below threshold
    const validGroups = [];
    let hasOtherGroup = false;
    
    Object.entries(groupCounts).forEach(([group, count]) => {
      if (count >= this.minThreshold) {
        validGroups.push(group);
      } else {
        hasOtherGroup = true;
      }
    });
    
    // Sort valid groups
    this.groups = validGroups.sort();
    
    // Add 'other' group if there are any small groups
    if (hasOtherGroup) {
      this.groups.push('other');
    }

    // Assign colors from palette
    this.groups.forEach((group, index) => {
      if (group === 'other') {
        this.groupColorMap[group] = '#808080'; // Gray for 'other'
      } else {
        this.groupColorMap[group] = ParentGroupProvider.COLOR_PALETTE[index % ParentGroupProvider.COLOR_PALETTE.length];
      }
    });

    console.log(`ParentGroupProvider initialized with ${this.groups.length} groups (threshold: ${this.minThreshold})`);
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
   * Small groups are mapped to 'other'
   * 
   * @param {string} nodeId - Node identifier
   * @param {Object} attrs - Node attributes
   * @returns {string} Parent group name or 'other'
   */
  getNodeGroup(nodeId, attrs) {
    const parent = attrs.parent || 'unknown';
    // Check if this group is in the valid groups list
    return this.groups.includes(parent) ? parent : 'other';
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


/**
 * PrefixGroupProvider - Groups nodes by first N letters of their label
 * 
 * This grouping strategy creates dynamic groups based on the node label prefix.
 * Useful for exploring large graphs by function/variable naming patterns.
 * 
 * @extends GroupProvider
 * @class
 */
class PrefixGroupProvider extends GroupProvider {
  /**
   * Color palette for prefix groups (reuses parent palette)
   * @static
   */
  static COLOR_PALETTE = ParentGroupProvider.COLOR_PALETTE;

  /**
   * @param {Graph} graph - Graph instance
   * @param {number} letterCount - Number of letters to use for prefix (default: 3)
   * @param {number} minThreshold - Minimum nodes required for a group (default: 1, no threshold)
   */
  constructor(graph, letterCount = 3, minThreshold = 1) {
    super();
    this.graph = graph;
    this.letterCount = Math.max(1, Math.min(10, letterCount)); // Clamp between 1-10
    this.minThreshold = Math.max(1, minThreshold);
    this.groups = [];
    this.groupColorMap = {};
    this._initialize();
  }

  /**
   * Initialize groups and colors based on node label prefixes
   * Groups with fewer than minThreshold nodes are merged into 'other'
   * @private
   */
  _initialize() {
    // Count nodes per prefix
    const groupCounts = {};
    this.graph.forEachNode((node, attrs) => {
      const prefix = this._getPrefix(attrs.label || node);
      groupCounts[prefix] = (groupCounts[prefix] || 0) + 1;
    });

    // Separate groups above and below threshold
    const validGroups = [];
    let hasOtherGroup = false;
    
    Object.entries(groupCounts).forEach(([group, count]) => {
      if (count >= this.minThreshold) {
        validGroups.push(group);
      } else {
        hasOtherGroup = true;
      }
    });
    
    // Sort valid groups
    this.groups = validGroups.sort();
    
    // Add 'other' group if there are any small groups
    if (hasOtherGroup) {
      this.groups.push('other');
    }

    // Assign colors from palette
    this.groups.forEach((group, index) => {
      if (group === 'other') {
        this.groupColorMap[group] = '#808080'; // Gray for 'other'
      } else {
        this.groupColorMap[group] = PrefixGroupProvider.COLOR_PALETTE[index % PrefixGroupProvider.COLOR_PALETTE.length];
      }
    });

    console.log(`PrefixGroupProvider initialized with ${this.groups.length} groups (${this.letterCount} letters, threshold: ${this.minThreshold})`);
  }

  /**
   * Extract prefix from a label
   * 
   * @param {string} label - Node label
   * @returns {string} First N letters (or full label if shorter)
   * @private
   */
  _getPrefix(label) {
    if (!label) return '';
    const str = String(label);
    return str.length <= this.letterCount ? str : str.substring(0, this.letterCount);
  }

  /**
   * Get all group names
   * 
   * @returns {string[]} Array of prefix groups
   */
  getGroups() {
    return this.groups;
  }

  /**
   * Get the group (prefix) for a node
   * Small groups are mapped to 'other'
   * 
   * @param {string} nodeId - Node identifier
   * @param {Object} attrs - Node attributes
   * @returns {string} Prefix group or 'other'
   */
  getNodeGroup(nodeId, attrs) {
    const prefix = this._getPrefix(attrs.label || nodeId);
    // Check if this group is in the valid groups list
    return this.groups.includes(prefix) ? prefix : 'other';
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

  /**
   * Update the letter count and reinitialize groups
   * 
   * @param {number} newLetterCount - New letter count (1-10)
   */
  setLetterCount(newLetterCount) {
    this.letterCount = Math.max(1, Math.min(10, newLetterCount));
    this._initialize();
  }

  /**
   * Get current letter count
   * 
   * @returns {number} Current letter count
   */
  getLetterCount() {
    return this.letterCount;
  }
}
