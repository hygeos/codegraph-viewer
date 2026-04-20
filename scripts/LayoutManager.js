/**
 * LayoutManager - Manages force-directed graph layout
 * 
 * State machine for layout iterations:
 * - Ready: No iterations run yet (completedIterations = 0, targetIterations = 0)
 * - Running: Layout is actively computing (layoutRunning = true)
 * - Stopped: User stopped layout mid-run (completedIterations < targetIterations)
 * - Completed: Reached target iterations (completedIterations = targetIterations)
 * 
 * From Stopped or Completed state, user can:
 * - Continue: Add more iterations from current position
 * - Reset: Return to epicenter initialization and start fresh
 * 
 * Coordinate system:
 * Nodes use graph coordinates (arbitrary units centered near origin).
 * Parents are arranged in a circle at radius 100 from origin.
 * New nodes are placed near their parent's epicenter with random offset.
 * 
 * @class
 */
class LayoutManager {
  /**
   * @param {GraphState} state - Shared graph state instance
   * @param {RenderManager} renderManager - Render manager for refresh operations
   */
  constructor(state, renderManager) {
    this.state = state;
    this.renderManager = renderManager;
    
    /** @type {GraphForce} Force layout algorithm instance */
    this.forceLayout = new GraphForce();
    
    /** @type {boolean} Whether layout is currently running */
    this.layoutRunning = false;
    
    /** @type {number} Number of iterations completed so far */
    this.completedIterations = 0;
    
    /** @type {number} Target number of iterations to reach */
    this.targetIterations = 0;
  }

  /**
   * Bind layout control UI elements
   * 
   * Sets up:
   * - Start/Stop/Continue button
   * - Reset button
   * - Max iterations input
   */
  bindControls() {
    this.bindStartButton();
    this.bindResetButton();
  }

  /**
   * Bind the Start/Stop/Continue layout button
   * 
   * Button behavior:
   * - "Start": Begin layout from scratch (if no graph, prompts file load)
   * - "Stop": Halt running layout
   * - "Continue": Resume from stopped state or add more iterations from completed state
   */
  bindStartButton() {
    const startBtn = document.getElementById("start-layout");
    const maxIterationsInput = document.getElementById("max-iterations");
    if (!startBtn) return;

    startBtn.addEventListener("click", async () => {
      if (!this.state.graph) {
        // No graph loaded: prompt user to load file
        const fileInput = document.getElementById('file-input');
        if (fileInput) fileInput.click();
        return;
      }
      
      if (this.layoutRunning) {
        // Stop the running layout
        this.layoutRunning = false;
        this.renderManager.setLayoutRunning(false);
      } else {
        // Start or continue layout
        const iterations = parseInt(maxIterationsInput.value) || 300;
        await this.applyForceLayout(iterations);
      }
    });
  }

  /**
   * Bind the Reset layout button
   * 
   * Resets layout state and reinitializes node positions using the
   * epicenter-based circular arrangement.
   */
  bindResetButton() {
    const resetBtn = document.getElementById("reset-layout");
    if (!resetBtn) return;

    resetBtn.addEventListener("click", () => {
      if (!this.state.graph) return;
      
      // Stop the layout if running
      this.layoutRunning = false;
      this.renderManager.setLayoutRunning(false);
      
      // Reset iteration counters
      this.completedIterations = 0;
      this.targetIterations = 0;
      
      // Reinitialize positions with epicenter-based layout
      this.initializeNodePositions();
      
      // Cache the new positions
      this.state.cacheNodePositions();
      
      // Refresh renderer to show new positions
      this.renderManager.refresh();
      
      // Update UI
      this.updateUI('Ready (0/0)', 'Start');
    });
  }

  /**
   * Initialize node positions using adaptive weighted circular layout
   * 
   * Algorithm:
   * 1. Count nodes per group
   * 2. Calculate statistics (mean, median, std deviation)
   * 3. Assign angular weights based on group size relative to statistics
   * 4. Place epicenters on circle with weighted spacing
   * 5. Place nodes around their group's epicenter with random offset
   * 
   * Circle radius: 100 units from origin
   * Node spread radius: Adaptive based on group size
   */
  initializeNodePositions() {
    const groups = this.state.getGroups();
    const groupCount = groups.length;
    
    if (groupCount === 0) {
      // Fallback to random if no groups
      this.state.forEachNode((node) => {
        this.state.setNodeAttribute(node, 'x', Math.random() * 200 - 100);
        this.state.setNodeAttribute(node, 'y', Math.random() * 200 - 100);
      });
      return;
    }
    
    // Count nodes per group
    const groupCounts = {};
    groups.forEach(group => groupCounts[group] = 0);
    
    this.state.forEachNode((node, attrs) => {
      const group = this.state.groupProvider.getNodeGroup(node, attrs);
      if (groupCounts[group] !== undefined) {
        groupCounts[group]++;
      }
    });
    
    // Calculate statistics
    const counts = Object.values(groupCounts);
    const stats = this.calculateGroupStatistics(counts);
    
    // Assign angular weights based on size
    const weights = {};
    groups.forEach(group => {
      const size = groupCounts[group] || 1;
      weights[group] = this.calculateAngularWeight(size, stats);
    });
    
    // Calculate epicenter positions with weighted angular distribution
    const radius = 100;
    const epicenters = this.calculateWeightedEpicenters(groups, weights, radius);
    
    // Position nodes around their group's epicenter
    this.state.forEachNode((node, attrs) => {
      const group = this.state.groupProvider.getNodeGroup(node, attrs);
      const epicenter = epicenters[group] || { x: 0, y: 0 };
      const groupSize = groupCounts[group] || 1;
      
      // Small consistent spread radius - nodes stay tight
      const spreadRadius = 8 + Math.sqrt(groupSize) * 0.3;
      
      // Random offset around epicenter
      const offsetAngle = Math.random() * 2 * Math.PI;
      const offsetDist = Math.random() * spreadRadius;
      
      const x = epicenter.x + offsetDist * Math.cos(offsetAngle);
      const y = epicenter.y + offsetDist * Math.sin(offsetAngle);
      
      this.state.setNodeAttribute(node, 'x', x);
      this.state.setNodeAttribute(node, 'y', y);
    });
  }

  /**
   * Calculate statistics for group sizes
   * 
   * @param {number[]} counts - Array of node counts per group
   * @returns {Object} Statistics object with mean, median, std
   */
  calculateGroupStatistics(counts) {
    if (counts.length === 0) return { mean: 0, median: 0, std: 0 };
    
    // Mean
    const mean = counts.reduce((sum, c) => sum + c, 0) / counts.length;
    
    // Median
    const sorted = [...counts].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0 
      ? (sorted[mid - 1] + sorted[mid]) / 2 
      : sorted[mid];
    
    // Standard deviation
    const variance = counts.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / counts.length;
    const std = Math.sqrt(variance);
    
    return { mean, median, std };
  }

  /**
   * Calculate angular weight for a group based on its size
   * 
   * Uses statistics to adaptively scale weights:
   * - Small groups (< median - 0.5*std): 0.6x baseline
   * - Medium groups (within ±0.5*std): scaled by size/median
   * - Large groups (> median + 0.5*std): scaled up to 3.5x for maximum angular space
   * 
   * Large groups get substantial angular space on the circle.
   * 
   * @param {number} size - Number of nodes in group
   * @param {Object} stats - Statistics object {mean, median, std}
   * @returns {number} Angular weight (multiplier)
   */
  calculateAngularWeight(size, stats) {
    const { median, std } = stats;
    
    // Avoid division by zero
    if (median === 0) return 1.0;
    
    const lowerBound = median - 0.5 * std;
    const upperBound = median + 0.5 * std;
    
    if (size < lowerBound) {
      // Small group: reduced angular space
      return 0.6;
    } else if (size > upperBound) {
      // Large group: much more angular space on circle
      const scale = size / median;
      return Math.min(scale, 3.5);
    } else {
      // Medium group: proportional to median
      return size / median;
    }
  }

  /**
   * Calculate epicenter positions with weighted angular distribution
   * 
   * Each group gets an angular portion proportional to its weight.
   * Groups are placed sequentially around the circle.
   * 
   * @param {string[]} groups - Array of group names
   * @param {Object} weights - Map of group to weight
   * @param {number} radius - Circle radius
   * @returns {Object} Map of group to {x, y} position
   */
  calculateWeightedEpicenters(groups, weights, radius) {
    const epicenters = {};
    
    // Calculate total weight
    const totalWeight = groups.reduce((sum, group) => sum + weights[group], 0);
    
    // Place groups sequentially around circle
    let currentAngle = 0;
    
    groups.forEach(group => {
      const weight = weights[group];
      const angularPortion = (weight / totalWeight) * 2 * Math.PI;
      
      // Place epicenter at the middle of its angular portion
      const angle = currentAngle + angularPortion / 2;
      
      epicenters[group] = {
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle)
      };
      
      // Advance to next portion
      currentAngle += angularPortion;
    });
    
    return epicenters;
  }

  /**
   * Apply force-directed layout algorithm
   * 
   * The layout runs asynchronously with periodic UI updates and renderer refreshes.
   * User can stop mid-run and continue later from the same position.
   * 
   * Iteration tracking:
   * - If continuing from stopped state: Run remaining iterations to reach previous target
   * - If completed or first run: Add new iterations to target
   * 
   * @param {number} requestedIterations - Number of iterations to run
   */
  async applyForceLayout(requestedIterations = 100) {
    this.layoutRunning = true;
    this.renderManager.setLayoutRunning(true);
    const startBtn = document.getElementById('start-layout');
    const counter = document.getElementById('iteration-counter');
    if (startBtn) startBtn.textContent = 'Stop';
    
    // Calculate actual iterations to run
    let iterations;
    if (this.completedIterations < this.targetIterations) {
      // Continuing from stopped state - use remaining iterations
      iterations = this.targetIterations - this.completedIterations;
    } else {
      // Completed or first run - add to target
      iterations = requestedIterations;
      this.targetIterations = this.completedIterations + iterations;
    }
    
    const startIteration = this.completedIterations;
    
    // Get IPF (iterations per frame) from UI
    const ipfInput = document.getElementById('ipf');
    const ipf = ipfInput ? parseInt(ipfInput.value) || 1 : 1;
    
    // Apply force layout with callbacks
    const result = await this.forceLayout.apply(
      this.state.graph,
      iterations,
      startIteration,
      ipf,
      // Stop check callback
      () => !this.layoutRunning,
      // Progress callback (called each iteration)
      (iter, absoluteIter) => {
        if (counter) {
          counter.textContent = `Running: ${absoluteIter}/${this.targetIterations}`;
        }
      },
      // Render callback (called periodically to update display)
      async (positions) => {
        // Apply positions to graph
        Object.entries(positions).forEach(([node, pos]) => {
          this.state.setNodeAttribute(node, 'x', pos.x);
          this.state.setNodeAttribute(node, 'y', pos.y);
        });
        
        // Refresh renderer
        this.renderManager.refresh();
        
        // Allow UI to update (yield to event loop)
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    );
    
    // Handle stopped vs completed
    if (result.stoppedAt !== undefined) {
      // User stopped mid-run
      this.completedIterations = result.stoppedAt;
      if (counter) counter.textContent = `Stopped: ${result.stoppedAt}/${this.targetIterations}`;
      if (startBtn) startBtn.textContent = 'Continue';
    } else {
      // Completed all requested iterations
      this.completedIterations += iterations;
      if (counter) counter.textContent = `Completed: ${this.completedIterations}/${this.targetIterations}`;
      if (startBtn) startBtn.textContent = 'Continue';
    }
    
    this.layoutRunning = false;
    this.renderManager.setLayoutRunning(false);
  }

  /**
   * Update layout UI elements
   * 
   * @param {string} counterText - Text for iteration counter
   * @param {string} buttonText - Text for start/stop button
   */
  updateUI(counterText, buttonText) {
    const counter = document.getElementById('iteration-counter');
    if (counter && counterText) {
      counter.textContent = counterText;
    }
    
    const startBtn = document.getElementById('start-layout');
    if (startBtn && buttonText) {
      startBtn.textContent = buttonText;
    }
  }

  /**
   * Reset layout state (used when loading new graph)
   */
  reset() {
    this.layoutRunning = false;
    this.renderManager.setLayoutRunning(false);
    this.completedIterations = 0;
    this.targetIterations = 0;
    this.updateUI('Ready (0/0)', 'Start');
  }
}
