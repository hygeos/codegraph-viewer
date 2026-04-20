/**
 * Render tuning parameters
 *
 * Edit values in this file to tune static edge rendering behavior.
 *
 * Static mode (layout stopped):
 * - Uses directional edges (arrow if supported by Sigma build)
 * - Applies thickness autoscaling based on camera zoom
 *
 * Running mode (layout active):
 * - Uses simple line edges with a fixed thickness
 */
window.GRAPH_RENDER_TUNING = {
  nodeStyle: {
    // Multiplicative scale while force layout is running.
    runningScale: 1.0,

    static: {
      // Enable zoom-based autoscaling for node sizes when layout is static.
      autoScaleWithZoom: true,

      // Camera ratio at which scale = 1.0.
      referenceRatio: 1.0,

      // Higher values make nodes grow faster while zooming in.
      zoomExponent: 0.45,

      // Clamp scaling factor to avoid too-small / too-large nodes.
      minScale: 0.8,
      maxScale: 1.75
    }
  },

  edgeStyle: {
    // Edge thickness while force layout is running.
    runningThickness: 0.9,

    static: {
      // Enable zoom-based autoscaling for static edges.
      autoScaleWithZoom: true,

      // Base thickness at reference zoom ratio.
      baseThickness: 1.8,

      // Clamp autoscaled thickness to stay readable.
      minThickness: 0.8,
      maxThickness: 1.75,

      // Camera ratio at which baseThickness is applied.
      referenceRatio: 1.0,

      // Higher values make thickness grow faster while zooming in.
      zoomExponent: 0.65
    },

    // Static hover focus behavior (phase 2)
    staticNeighborhood: {
      // Enable reducer-based neighborhood focus on node hover when layout is static.
      enabled: true,

      // If false, non-neighborhood nodes remain visible but are dimmed/greyed.
      hideNonNeighborhoodNodes: false,

      // Visual style for non-neighborhood nodes when not hidden.
      nonNeighborhoodNodeColor: "#b8b8b8",
      nonNeighborhoodNodeOpacity: 0.18,

      // Keep only incident edges to hovered node visible.
      hideNonIncidentEdges: true,

      // Visual style when non-incident edges are not hidden.
      nonIncidentEdgeOpacity: 0.08,
      nonIncidentEdgeColor: "#bdbdbd",

      // Directional colors for edges relative to hovered node.
      incomingEdgeColor: "#3c679f",
      outgoingEdgeColor: "#6446a5",
      selfLoopEdgeColor: "#b551e0",
      incidentEdgeOpacity: 1.0
    }
  }
};
