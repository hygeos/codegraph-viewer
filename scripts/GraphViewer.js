import GexfParser from './GexfParser.js';

export default class GraphViewer {
  constructor() {
    this.renderer = null;
    this.camera = null;
  }

  async initialize() {
    try {
      const gexf = await this.loadGexfFile("./data/graph.gexf");
      const graph = GexfParser.parse(gexf);
      
      this.setupSigma(graph);
      this.bindControls();
    } catch (error) {
      console.error('Failed to initialize graph viewer:', error);
    }
  }

  async loadGexfFile(url) {
    const response = await fetch(url);
    return await response.text();
  }

  setupSigma(graph) {
    const container = document.getElementById("sigma-container");
    
    this.renderer = new Sigma(graph, container, {
      minCameraRatio: 0.08,
      maxCameraRatio: 3,
    });
    
    this.camera = this.renderer.getCamera();
  }

  bindControls() {
    const zoomInBtn = document.getElementById("zoom-in");
    const zoomOutBtn = document.getElementById("zoom-out");
    const zoomResetBtn = document.getElementById("zoom-reset");
    const labelsThresholdRange = document.getElementById("labels-threshold");

    zoomInBtn.addEventListener("click", () => {
      this.camera.animatedZoom({ duration: 600 });
    });
    
    zoomOutBtn.addEventListener("click", () => {
      this.camera.animatedUnzoom({ duration: 600 });
    });
    
    zoomResetBtn.addEventListener("click", () => {
      this.camera.animatedReset({ duration: 600 });
    });

    labelsThresholdRange.addEventListener("input", () => {
      if (this.renderer) {
        this.renderer.setSetting("labelRenderedSizeThreshold", +labelsThresholdRange.value);
      }
    });

    if (this.renderer) {
      labelsThresholdRange.value = this.renderer.getSetting("labelRenderedSizeThreshold") + "";
    }
  }
}
