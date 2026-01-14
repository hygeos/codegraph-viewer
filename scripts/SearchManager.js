/**
 * SearchManager - Handles node search and result display
 * 
 * Features:
 * - Case-insensitive substring search on node labels
 * - Debounced input (150ms) to avoid excessive re-renders
 * - Two sort modes: alphabetical and grouped by parent
 * - Visual highlighting of matching nodes (dims non-matches)
 * - Click to zoom, hover to ping indicator
 * 
 * Search only operates on currently visible nodes (respects filters).
 * This means hidden parent nodes won't appear in search results.
 * 
 * @class
 */
class SearchManager {
  /**
   * @param {GraphState} state - Shared graph state instance
   * @param {RenderManager} renderManager - Render manager for zoom/ping operations
   */
  constructor(state, renderManager) {
    this.state = state;
    this.renderManager = renderManager;
    
    /** @type {string} Current search query (lowercase, trimmed) */
    this.searchQuery = '';
    
    /** @type {Set<string>} Node IDs matching current search */
    this.matchingNodes = new Set();
    
    /** @type {number|null} Debounce timer ID */
    this.searchDebounceTimer = null;
    
    /** @type {number} Debounce delay in milliseconds */
    this.debounceDelay = 150;
  }

  /**
   * Bind search-related UI controls
   * 
   * Sets up:
   * - Debounced search input
   * - Clear search button
   * - Sort mode radio buttons
   */
  bindControls() {
    const searchInput = document.getElementById('search-input');
    const searchClear = document.getElementById('search-clear');
    const sortRadios = document.querySelectorAll('input[name="search-sort"]');
    
    if (!searchInput) return;
    
    // Debounced search on input
    // We debounce to avoid excessive DOM updates and graph operations
    // while the user is still typing
    searchInput.addEventListener('input', (e) => {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = setTimeout(() => {
        this.performSearch(e.target.value);
      }, this.debounceDelay);
    });
    
    // Clear search
    if (searchClear) {
      searchClear.addEventListener('click', () => {
        searchInput.value = '';
        this.performSearch('');
      });
    }
    
    // Re-render results when sort mode changes
    sortRadios.forEach(radio => {
      radio.addEventListener('change', () => {
        if (this.searchQuery) {
          this.performSearch(this.searchQuery);
        }
      });
    });
  }

  /**
   * Perform search and update UI
   * 
   * Search algorithm:
   * 1. Convert query and labels to lowercase for case-insensitive matching
   * 2. Check if query is substring of label using includes()
   * 3. Only search visible nodes in current graph (respects filters)
   * 4. Sort results based on selected mode
   * 5. Update node highlighting and render results
   * 
   * @param {string} query - Search query string
   */
  performSearch(query) {
    this.searchQuery = query.toLowerCase().trim();
    this.matchingNodes.clear();
    
    const resultsContainer = document.getElementById('search-results');
    if (!resultsContainer) return;
    
    // Empty query: clear everything
    if (!this.searchQuery) {
      resultsContainer.innerHTML = '';
      this.updateNodeHighlights();
      return;
    }
    
    // Find matching nodes (only search visible nodes in current graph)
    const matches = [];
    this.state.forEachNode((nodeId, attrs) => {
      const label = (attrs.label || nodeId).toLowerCase();
      
      // Simple substring matching
      if (label.includes(this.searchQuery)) {
        this.matchingNodes.add(nodeId);
        matches.push({
          id: nodeId,
          label: attrs.label || nodeId,
          parent: attrs.parent || 'unknown',
          degree: this.state.getNodeDegree(nodeId),
          color: attrs.color
        });
      }
    });
    
    // Sort matches based on selected mode
    const sortMode = document.querySelector('input[name="search-sort"]:checked')?.value || 'alpha';
    if (sortMode === 'alpha') {
      matches.sort((a, b) => a.label.localeCompare(b.label));
    } else if (sortMode === 'parent') {
      matches.sort((a, b) => {
        const parentCompare = a.parent.localeCompare(b.parent);
        return parentCompare !== 0 ? parentCompare : a.label.localeCompare(b.label);
      });
    }
    
    // Render results and update highlighting
    this.renderSearchResults(matches, sortMode);
    this.updateNodeHighlights();
  }

  /**
   * Render search results in the sidebar
   * 
   * Two display modes:
   * - alpha: Simple flat list sorted alphabetically
   * - parent: Grouped by parent with headers
   * 
   * Each result is clickable (zoom to node) and hoverable (ping indicator).
   * 
   * @param {Array<Object>} matches - Array of matching node objects
   * @param {string} sortMode - 'alpha' or 'parent'
   */
  renderSearchResults(matches, sortMode) {
    const resultsContainer = document.getElementById('search-results');
    if (!resultsContainer) return;
    
    // No results
    if (matches.length === 0) {
      resultsContainer.innerHTML = `
        <div class="search-empty">
          No nodes match "${this.escapeHtml(this.searchQuery)}"
        </div>
      `;
      return;
    }
    
    let html = '';
    
    if (sortMode === 'parent') {
      // Group by parent
      const byParent = {};
      matches.forEach(match => {
        if (!byParent[match.parent]) {
          byParent[match.parent] = [];
        }
        byParent[match.parent].push(match);
      });
      
      // Render each parent group
      Object.keys(byParent).sort().forEach(parent => {
        html += `<div class="search-parent-group">`;
        html += `<div class="search-parent-header">${this.escapeHtml(parent)}</div>`;
        byParent[parent].forEach(match => {
          html += this.renderSearchResultItem(match);
        });
        html += `</div>`;
      });
    } else {
      // Simple flat list
      matches.forEach(match => {
        html += this.renderSearchResultItem(match);
      });
    }
    
    resultsContainer.innerHTML = html;
    
    // Bind click and hover events to result items
    this.bindResultItemEvents(resultsContainer);
  }

  /**
   * Render a single search result item
   * 
   * @param {Object} match - Match object with id, label, parent, degree
   * @returns {string} HTML string for the result item
   */
  renderSearchResultItem(match) {
    const escapedLabel = this.escapeHtml(match.label);
    const escapedParent = this.escapeHtml(match.parent);
    
    return `
      <div class="search-result-item" data-node-id="${match.id}" title="${escapedLabel}">
        <div class="search-result-name">${escapedLabel}</div>
        <div class="search-result-meta">
          <span class="search-result-parent">${escapedParent}</span>
          <span class="search-result-degree">(${match.degree})</span>
        </div>
      </div>
    `;
  }

  /**
   * Bind click and hover events to search result items
   * 
   * @param {HTMLElement} resultsContainer - Container with result items
   */
  bindResultItemEvents(resultsContainer) {
    resultsContainer.querySelectorAll('.search-result-item').forEach(item => {
      const nodeId = item.dataset.nodeId;
      
      // Click: zoom to node
      item.addEventListener('click', () => {
        this.renderManager.zoomToNode(nodeId);
      });
      
      // Hover: show ping indicator
      item.addEventListener('mouseenter', () => {
        this.renderManager.showPingOnNode(nodeId);
      });
      
      item.addEventListener('mouseleave', () => {
        this.renderManager.hidePing();
      });
    });
  }

  /**
   * Update node highlighting based on search state
   * 
   * When a search is active:
   * - Matching nodes: opacity 1 (fully visible)
   * - Non-matching nodes: opacity 0.2 (dimmed)
   * 
   * When search is cleared:
   * - All nodes: opacity 1 (fully visible)
   */
  updateNodeHighlights() {
    const hasSearch = this.searchQuery && this.matchingNodes.size > 0;
    
    this.state.forEachNode((nodeId) => {
      const isMatch = this.matchingNodes.has(nodeId);
      
      if (hasSearch) {
        // Dim non-matching nodes
        this.state.setNodeAttribute(nodeId, 'opacity', isMatch ? 1 : 0.2);
      } else {
        // Reset to normal
        this.state.setNodeAttribute(nodeId, 'opacity', 1);
      }
    });
    
    this.renderManager.refresh();
  }

  /**
   * Clear current search and reset UI
   */
  clearSearch() {
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.value = '';
    }
    this.performSearch('');
  }

  /**
   * Escape HTML special characters to prevent XSS
   * 
   * @param {string} text - Text to escape
   * @returns {string} HTML-safe text
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

