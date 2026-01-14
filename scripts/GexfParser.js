class GexfParser {
  // Color palette for parent nodes
  static COLOR_PALETTE = [
    "#E53935",  // Red
    "#1E88E5",  // Blue
    "#43A047",  // Green
    "#FB8C00",  // Orange
    "#8E24AA",  // Purple
    "#00ACC1",  // Cyan
    "#FDD835",  // Yellow
    "#D81B60",  // Pink
    "#3949AB",  // Indigo
    "#7CB342",  // Light Green
    "#F4511E",  // Deep Orange
    "#00897B",  // Teal
    "#6D4C41",  // Brown
    "#5E35B1",  // Deep Purple
    "#C0CA33",  // Lime
    "#039BE5",  // Light Blue
    "#E91E63",  // Deep Pink
    "#FFB300",  // Amber
    "#26A69A",  // Teal Light
    "#AB47BC",  // Purple Light
    "#EF5350",  // Red Light
    "#42A5F5",  // Blue Light
    "#66BB6A",  // Green Light
    "#FFA726",  // Orange Light
    "#EC407A",  // Pink Light
    "#5C6BC0",  // Indigo Light
    "#9CCC65",  // Light Green Light
    "#FF7043",  // Deep Orange Light
    "#26C6DA",  // Cyan Light
    "#FFEE58",  // Yellow Light
    "#8D6E63",  // Brown Light
    "#7E57C2",  // Deep Purple Light
    "#D4E157",  // Lime Light
    "#29B6F6",  // Light Blue Light
    "#F06292",  // Pink Medium
    "#FFCA28",  // Amber Light
    "#4DB6AC",  // Teal Medium
    "#BA68C8",  // Purple Medium
    "#EF9A9A",  // Red Pale
    "#90CAF9",  // Blue Pale
    "#A5D6A7",  // Green Pale
    "#FFCC80",  // Orange Pale
    "#CE93D8",  // Purple Pale
    "#80DEEA",  // Cyan Pale
    "#C5E1A5",  // Light Green Pale
    "#FFAB91",  // Deep Orange Pale
    "#B39DDB",  // Deep Purple Pale
    "#FFF59D",  // Yellow Pale
    "#BCAAA4",  // Brown Pale
    "#81C784",  // Green Medium
  ];

  static parse(gexfString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(gexfString, "text/xml");
    const graph = new graphology.Graph({ multi: true });

    // First pass: collect all unique parent names
    const parentSet = new Set();
    const nodes = xmlDoc.querySelectorAll("node");
    nodes.forEach(node => {
      const parent = node.getAttribute("parent");
      if (parent) {
        parentSet.add(parent);
      }
    });

    // Create parent-to-color mapping
    const parentColorMap = {};
    const parents = Array.from(parentSet).sort(); // Sort for consistency
    parents.forEach((parent, index) => {
      parentColorMap[parent] = this.COLOR_PALETTE[index % this.COLOR_PALETTE.length];
    });

    // Store the parent color mapping in the graph for later use
    graph.setAttribute('parentColorMap', parentColorMap);
    graph.setAttribute('parents', parents);

    console.log('Parent-to-color mapping:', parentColorMap);

    // Second pass: parse nodes with assigned colors
    nodes.forEach(node => {
      const id = node.getAttribute("id");
      const label = node.getAttribute("label");
      const parent = node.getAttribute("parent") || "unknown";
      const color = parentColorMap[parent] || "#666666";
      const file = node.getAttribute("file") || "";
      const line = node.getAttribute("line") || "";
      
      console.log('Parsing node:', id, 'parent:', parent, 'color:', color);
      
      graph.addNode(id, { 
        label, 
        parent,
        color,
        file,
        line,
        x: Math.random(),
        y: Math.random(),
        size: 4,
        baseSize: 4
      });
    });

    // Parse edges
    const edges = xmlDoc.querySelectorAll("edge");
    edges.forEach(edge => {
      const source = edge.getAttribute("source");
      const target = edge.getAttribute("target");
      if (graph.hasNode(source) && graph.hasNode(target)) {
        graph.addEdge(source, target);
      }
    });

    return graph;
  }
}
