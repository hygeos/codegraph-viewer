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
    }
  }
};
