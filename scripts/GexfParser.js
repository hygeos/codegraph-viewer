export default class GexfParser {
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
      graph.addNode(id, { 
        label, 
        color,
        x: Math.random(),
        y: Math.random(),
        size: 5
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
