/**
 * FileManager - Handles GEXF file loading and parsing
 * 
 * Responsibilities:
 * - Bind file input and load button
 * - Read file contents using FileReader API
 * - Trigger graph initialization through callback
 * - Display loaded filename
 * - Handle loading errors gracefully
 * 
 * Error handling strategy:
 * - File read errors: Logged to console, callback receives error
 * - Parse errors: Handled by GexfParser, logged to console
 * - User feedback: Filename display shows "Error loading file" on failure
 * 
 * The file input is reset after each load to allow reloading the same file.
 * 
 * @class
 */
class FileManager {
  /**
   * @param {Function} onFileLoaded - Callback (content, filename) called after successful file read
   * @param {Function} onError - Callback (error) called on file read failure
   */
  constructor(onFileLoaded, onError) {
    this.onFileLoaded = onFileLoaded;
    this.onError = onError;
  }

  /**
   * Bind file loading UI controls
   * 
   * Sets up:
   * - Load button click triggers file input
   * - File input change reads and processes file
   */
  bindControls() {
    const loadBtn = document.getElementById('load-file');
    const fileInput = document.getElementById('file-input');
    
    if (!loadBtn || !fileInput) {
      console.error('File loading controls not found');
      return;
    }
    
    // Load button opens file picker
    loadBtn.addEventListener('click', () => {
      fileInput.click();
    });
    
    // File input processes selected file
    fileInput.addEventListener('change', async (event) => {
      await this.handleFileSelect(event);
    });
  }

  /**
   * Handle file selection from input
   * 
   * Steps:
   * 1. Extract file from event
   * 2. Validate file exists
   * 3. Read file contents as text
   * 4. Call onFileLoaded callback with content and filename
   * 5. Update filename display
   * 6. Reset file input (allows reloading same file)
   * 
   * @param {Event} event - File input change event
   */
  async handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
      // Read file contents
      const content = await this.readFileAsText(file);
      
      // Notify callback
      if (this.onFileLoaded) {
        this.onFileLoaded(content, file.name);
      }
      
      // Update filename display
      this.updateFilenameDisplay(file.name);
      
    } catch (error) {
      console.error('Failed to load file:', error);
      
      // Notify error callback
      if (this.onError) {
        this.onError(error);
      }
      
      // Show error in UI
      this.updateFilenameDisplay('Error loading file');
    } finally {
      // Reset file input so the same file can be loaded again
      // This is necessary because 'change' event won't fire if same file is selected
      event.target.value = '';
    }
  }

  /**
   * Read file contents as text using FileReader API
   * 
   * @param {File} file - File object from input
   * @returns {Promise<string>} File contents as string
   */
  readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        resolve(e.target.result);
      };
      
      reader.onerror = (e) => {
        reject(new Error('Failed to read file'));
      };
      
      reader.readAsText(file);
    });
  }

  /**
   * Update filename display element
   * 
   * @param {string} filename - Filename to display
   */
  updateFilenameDisplay(filename) {
    const filenameDisplay = document.getElementById('filename-display');
    if (filenameDisplay) {
      filenameDisplay.textContent = filename;
    }
  }
}
