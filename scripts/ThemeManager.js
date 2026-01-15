/**
 * ThemeManager - Manages dark/light theme switching
 * 
 * Responsibilities:
 * - Toggle between dark and light modes
 * - Persist theme preference to localStorage
 * - Apply theme CSS classes to document body
 * - Coordinate renderer recreation with RenderManager
 * 
 * localStorage key: 'theme'
 * Values: 'dark' or 'light'
 * Default: 'light' if not set
 * 
 * When theme changes, the Sigma renderer must be recreated because
 * edge and label colors are set at initialization time and don't
 * update dynamically.
 * 
 * @class
 */
class ThemeManager {
  /**
   * @param {RenderManager} renderManager - Render manager to recreate renderer on theme change
   */
  constructor(renderManager) {
    this.renderManager = renderManager;
    
    /** @type {boolean} Current theme state (true = dark, false = light) */
    this.isDarkMode = false;
    
    /** @type {string} localStorage key for theme preference */
    this.storageKey = 'theme';
    
    // Load theme preference from localStorage
    this.loadThemePreference();
  }

  /**
   * Load theme preference from localStorage
   * 
   * Default to dark mode if no preference is saved.
   */
  loadThemePreference() {
    const savedTheme = localStorage.getItem(this.storageKey);
    this.isDarkMode = savedTheme ? savedTheme === 'dark' : true;
  }

  /**
   * Bind theme toggle button
   * 
   * Toggles between dark and light modes, saves preference,
   * and recreates renderer if graph is loaded.
   */
  bindControls() {
    const themeToggle = document.getElementById('theme-toggle');
    if (!themeToggle) return;
    
    // Apply initial theme
    this.applyTheme();
    
    themeToggle.addEventListener('click', () => {
      this.toggleTheme();
    });
  }

  /**
   * Toggle theme between dark and light
   * 
   * Steps:
   * 1. Flip isDarkMode flag
   * 2. Save to localStorage
   * 3. Apply CSS classes
   * 4. Recreate renderer (if graph is loaded)
   */
  toggleTheme() {
    this.isDarkMode = !this.isDarkMode;
    localStorage.setItem(this.storageKey, this.isDarkMode ? 'dark' : 'light');
    this.applyTheme();
    
    // Recreate renderer with new theme colors
    // RenderManager will handle preserving camera state and rebinding events
    if (this.renderManager.state.renderer && this.renderManager.state.graph) {
      this.renderManager.recreateRenderer(this.isDarkMode, () => {
        this.renderManager.bindHoverEvents();
      });
    }
  }

  /**
   * Apply current theme to the UI
   * 
   * Adds/removes 'dark-mode' class from document body.
   * Updates theme toggle button icon and logo.
   */
  applyTheme() {
    // Apply CSS class
    document.body.classList.toggle('dark-mode', this.isDarkMode);
    
    // Update toggle button icon
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
      themeToggle.textContent = this.isDarkMode ? '☀️' : '🌙';
    }
    
    // Update logo based on theme
    const logo = document.getElementById('hygeos-logo');
    if (logo) {
      logo.src = this.isDarkMode ? 'assets/logo-hygeos-white.svg' : 'assets/logo-hygeos-black.svg';
    }
  }

  /**
   * Get current theme state
   * 
   * @returns {boolean} True if dark mode, false if light mode
   */
  isDark() {
    return this.isDarkMode;
  }
}
