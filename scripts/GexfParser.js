/**
 * GexfParser - Parses GEXF XML format into a Graphology graph
 * 
 * Simplified to only handle structure parsing. Color assignment and grouping
 * logic is now handled by GroupProvider implementations.
 * 
 * @class
 */
class GexfParser {
  /**
   * Parse GEXF XML string into a graph
   * 
   * @param {string} gexfString - GEXF XML content
   * @returns {Graph} Parsed graph with nodes and edges
   */
  static parse(gexfString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(gexfString, "text/xml");
    const graph = new graphology.Graph({ multi: true });

    const nodes = xmlDoc.querySelectorAll("node");
    
    // Parse nodes with their attributes
    nodes.forEach(node => {
      const id = node.getAttribute("id");
      const label = node.getAttribute("label");
      const parent = node.getAttribute("parent") || "unknown";
      const file = node.getAttribute("file") || "";
      const line = node.getAttribute("line") || "";
      
      graph.addNode(id, { 
        label, 
        parent,
        color: '#666666', // Default color, will be set by GroupProvider
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

    console.log(`Parsed ${graph.order} nodes and ${graph.size} edges from GEXF`);

    return graph;
  }
}
