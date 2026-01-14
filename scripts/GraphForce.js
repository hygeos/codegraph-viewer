class GraphForce {
  constructor() {
    // Force algorithm parameters
    this.k = 6; // Target edge length
    this.c_rep_max = 2000; // Repulsion constant maximum
    this.c_rep_min = 500;   // Repulsion constant minimum
    this.c_spring = 0.075; // Spring constant
    this.maxRepulsionDist = 100; // Only calculate repulsion within this distance
    this.refreshRate = 1; // Refresh every N iterations
    
    // Velocity parameters
    this.damping = 0.8;
    this.timeStep = 0.3;
    this.max_velocity = 20;
    this.min_velocity = 3;
    
    // Repulsion schedule parameters
    this.c_rep_min_itr_start = 10;
    this.c_rep_max_itr_factor = 0.25; // 1/10 of total iterations
  }

  /**
   * Apply force-directed layout algorithm to a graph
   * @param {Object} graph - The graphology graph object
   * @param {Number} iterations - Number of iterations to run
   * @param {Number} startIteration - Starting iteration count (for continuing)
   * @param {Number} ipf - Iterations per frame (how many iterations between refreshes)
   * @param {Function} shouldStop - Callback to check if layout should stop
   * @param {Function} onIteration - Callback called on each iteration with (iter, absoluteIter)
   * @param {Function} onRefresh - Callback called when positions should be updated
   * @returns {Object} - Object with final positions
   */
  async apply(graph, iterations, startIteration = 0, ipf = 1, shouldStop, onIteration, onRefresh) {
    const nodes = graph.nodes();
    const positions = {};
    const velocities = {};
    
    // Initialize positions from graph
    nodes.forEach(node => {
      const attrs = graph.getNodeAttributes(node);
      positions[node] = { 
        x: attrs.x || Math.random() * 200 - 100, 
        y: attrs.y || Math.random() * 200 - 100 
      };
      velocities[node] = { x: 0, y: 0 };
    });

    const c_rep_max_itr = Math.floor(iterations * this.c_rep_max_itr_factor);
    
    for (let iter = 0; iter < iterations; iter++) {
      const absoluteIter = startIteration + iter;
      
      // Check if layout should stop
      if (shouldStop && shouldStop()) {
        return { positions, stoppedAt: absoluteIter };
      }
      
      // Callback for iteration update
      if (onIteration) {
        onIteration(iter, absoluteIter);
      }
      
      // Update rendering periodically based on ipf
      if (iter % ipf === 0 && onRefresh) {
        await onRefresh(positions);
      }
      
      // Calculate forces
      const forces = this.calculateForces(graph, nodes, positions, absoluteIter, iterations, c_rep_max_itr);
      
      // Update positions
      this.updatePositions(nodes, positions, velocities, forces, iter, iterations);
    }

    return { positions, completed: true };
  }

  /**
   * Calculate all forces acting on nodes
   */
  calculateForces(graph, nodes, positions, absoluteIter, iterations, c_rep_max_itr) {
    const forces = {};
    nodes.forEach(node => {
      forces[node] = { x: 0, y: 0 };
    });

    // Repulsion forces between all node pairs
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const node1 = nodes[i];
        const node2 = nodes[j];
        const dx = positions[node2].x - positions[node1].x;
        const dy = positions[node2].y - positions[node1].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // Skip distant nodes for performance
        if (dist > this.maxRepulsionDist) continue;
        
        // Calculate repulsion constant based on iteration
        const c_rep = this.getRepulsionConstant(absoluteIter, c_rep_max_itr);
        const force = c_rep / (dist * dist);
        
        forces[node1].x -= (dx / dist) * force;
        forces[node1].y -= (dy / dist) * force;
        forces[node2].x += (dx / dist) * force;
        forces[node2].y += (dy / dist) * force;
      }
    }

    // Center repulsion: push nodes away from origin to create void
    nodes.forEach(node => {
      const pos = positions[node];
      const distFromCenter = Math.sqrt(pos.x * pos.x + pos.y * pos.y);
      
      // Only apply repulsion within specified distance from center
      if (distFromCenter < this.centerRepulsionDist && distFromCenter > 0.1) {
        const force = this.c_center_repulsion / (distFromCenter * distFromCenter);
        forces[node].x += (pos.x / distFromCenter) * force;
        forces[node].y += (pos.y / distFromCenter) * force;
      }
    });

    // Attraction forces along edges
    graph.forEachEdge((edge, attrs, source, target) => {
      const dx = positions[target].x - positions[source].x;
      const dy = positions[target].y - positions[source].y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.2;
      var force = this.c_spring * (dist - this.k);
      
      const src_parent = graph.getNodeAttribute(source, 'parent');
      const tgt_parent = graph.getNodeAttribute(target, 'parent');
      
      if (src_parent === tgt_parent) {
        // Increase spring force for inter-group edges
        force *= 2.0;
      }
      
      forces[source].x += (dx / dist) * force;
      forces[source].y += (dy / dist) * force;
      forces[target].x -= (dx / dist) * force;
      forces[target].y -= (dy / dist) * force;
    });

    return forces;
  }

  /**
   * Get repulsion constant based on iteration schedule
   */
  getRepulsionConstant(absoluteIter, c_rep_max_itr) {
    if (absoluteIter < this.c_rep_min_itr_start) {
      return this.c_rep_min;
    } else if (absoluteIter <= c_rep_max_itr) {
      return this.c_rep_max;
    } else {
      const progress = (absoluteIter - this.c_rep_min_itr_start) / (c_rep_max_itr - this.c_rep_min_itr_start);
      return this.c_rep_min + (this.c_rep_max - this.c_rep_min) * progress;
    }
  }

  /**
   * Update node positions based on forces
   */
  updatePositions(nodes, positions, velocities, forces, iter, iterations) {
    const curr_max_velocity = this.max_velocity - 
      ((this.max_velocity - this.min_velocity) * (iter / iterations));
    
    nodes.forEach(node => {
      // Update velocity with force
      velocities[node].x = (velocities[node].x + forces[node].x * this.timeStep) * this.damping;
      velocities[node].y = (velocities[node].y + forces[node].y * this.timeStep) * this.damping;
      
      // Clamp velocities
      velocities[node].x = Math.max(-curr_max_velocity, Math.min(curr_max_velocity, velocities[node].x));
      velocities[node].y = Math.max(-curr_max_velocity, Math.min(curr_max_velocity, velocities[node].y));
      
      // Update position
      positions[node].x += velocities[node].x;
      positions[node].y += velocities[node].y;
    });
  }

  /**
   * Remove isolated nodes (nodes with no edges) from a graph
   */
  static removeIsolatedNodes(graph) {
    const nodesToRemove = [];
    graph.forEachNode((node) => {
      if (graph.degree(node) === 0) {
        nodesToRemove.push(node);
      }
    });
    nodesToRemove.forEach(node => graph.dropNode(node));
    return nodesToRemove.length;
  }
}
