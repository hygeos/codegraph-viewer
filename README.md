<!-- <div align="center"> -->
<div style="text-align: left; width: 100%;">
<table>
<tr>
  <td width="30%">
    <picture>
      <source media="(prefers-color-scheme: dark)"  srcset="assets/codegraph-logo.svg" width="300">
      <source media="(prefers-color-scheme: light)" srcset="assets/codegraph-logo.svg" width="300">
      <img alt="HYGEOS monochrome logo">
    </picture>
  </td>
  <td width="70%">
    <h1>
    Codegraph Viewer
    </h1>
    A dynamic platform for analyzing and understanding complex codebases<br>
    <em>Developed for the CAMS2_3bis project</em>
  </td>
</tr>
</table>
</div>
<!-- </div> -->

<!-- Developed for the CAMS2_3bis project -->
## Description
A dynamic platform for analyzing and understanding complex codebases

## Author
Joackim Orcière, HYGEOS

## Quick Start
You can try the tool directly online: [Live Demo](https://hygeos.github.io/codegraph-viewer/)

Or run locally:
1. Open `index.html` in your web browser.
2. Click "Load Graph" and select a `.gexf` file from the `data/` folder.
3. Click "Start" to visualize the call graph.
4. Use zoom and pan controls to explore.
5. Hover over nodes for details.

## Features
- Interactive visualization: pan, zoom, and explore the call graph
- Force-directed layout (Fruchterman-Reingold based)
- Node details on hover (name, file, edge counts)
- Theme toggle (dark/light)
- Advanced filtering (by parent, first letters, presets)
- Search functionality

## Graph Structure
- **Nodes:** Subroutines or functions
- **Edges:** Calls between subroutines/functions

## File Format
Input files must be in GEXF (Graph Exchange XML Format). For best results, include:
- A `parent` attribute for each node (parent folder) — used for filtering and coloring
- A `file` attribute for each node (file path)
- In metadata: a list of parents, e.g. `<parents><parent>p1</parent><parent>p2</parent></parents>`

Note: The format may evolve as the project develops.

## Why Force-Directed Layout?
Force-directed layouts automatically position nodes to reveal clusters and relationships in your code’s call graph, making complex structures easier to understand—no manual arrangement needed. This project uses an adapted Fruchterman-Reingold algorithm, optimized for large graphs.

## Technical Details
- Built with [Sigma.js](https://www.sigmajs.org/) for rendering
- Uses [Graphology](https://graphology.github.io/) for graph data structures
- Custom force-directed layout algorithm with configurable forces and real-time rendering

## License
TBD.
