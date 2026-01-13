# IFS Map Demo

Interactive call graph visualization for Fortran code analysis.

## Infos
- **Author:** Joackim Orcière, HYGEOS
- **Context:** CAMS2_35bis

## How To Use
1. Open `index.html` in a web browser
2. Click "Load Graph" to select a `.gexf` file (examples in provided data folder)
3. Click "Start" to run the force-directed layout algorithm
4. Use 🔍+ / 🔍− buttons to zoom in/out
5. Hover over nodes to see detailed information

## Features
- **Interactive visualization:** Pan, zoom, and explore the call graph
- **Force-directed layout:** Automatically arranges nodes for optimal readability
- **Node information:** Hover to see subroutine name, file location, and edge counts
- **Theme toggle:** Switch between dark and light modes (☀️/🌙)
- **Remove isolated nodes:** Optional filtering of disconnected subroutines
- **Adjustable iterations:** Control layout algorithm precision (10-5000 iterations)

## Graph Structure
- **Nodes:** Each node represents a subroutine
- **Edges:** Each link represents a call from one subroutine to another
- **Colors:** Node colors indicate the parent folder of the file containing the subroutine

## File Format
Input files should be in GEXF (Graph Exchange XML Format). Sample files are provided in the `data/` directory:
- `graph.gexf`
- `phys_ec_graph.gexf`

## Why Force-Directed Layout?

Force-directed algorithms treat the graph as a physical system where nodes repel each other like charged particles while edges act as springs pulling connected nodes together. This approach is particularly powerful for call graph visualization because:

- **Automatic clustering:** Tightly coupled subroutines (those that call each other frequently) naturally group together, revealing modular structure in the codebase
- **Hierarchy emerges naturally:** Central subroutines with many connections position themselves at the core, while peripheral functions drift to the edges
- **No manual positioning:** Unlike static layouts, the algorithm discovers the optimal arrangement without requiring domain knowledge about the code structure
- **Scalability:** Works effectively for very large graphs

This makes it an ideal tool for understanding large Fortran codebases where the call structure might not be immediately apparent from the source code alone.

## Technical Details
- Built with [Sigma.js](https://www.sigmajs.org/) for rendering
- Uses [Graphology](https://graphology.github.io/) for graph data structures
- Custom force-directed layout algorithm with:
  - Configurable repulsion and spring forces
  - Progressive force adjustment for stability
  - Real-time rendering during layout computation
