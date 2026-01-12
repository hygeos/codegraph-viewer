class GexfParser {
  static parse(gexfString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(gexfString, "text/xml");
    const graph = new graphology.Graph({ multi: true });

    // Parse nodes
    const nodes = xmlDoc.querySelectorAll("node");
    nodes.forEach(node => {
      const id = node.getAttribute("id");
      const label = node.getAttribute("label");
      const color = node.getAttribute("color") || "#666";
      const file = node.getAttribute("file") || "";
      const line = node.getAttribute("line") || "";
      
      console.log('Parsing node:', id, 'file:', file); // Debug log
      
      graph.addNode(id, { 
        label, 
        color,
        file,
        line,
        x: Math.random(),
        y: Math.random(),
        size: 4
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
