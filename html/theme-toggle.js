/**
 * Theme Toggle Script
 * Handles dark/light mode switching with localStorage persistence
 * and system preference detection
 */

(function() {
  'use strict';

  const STORAGE_KEY = 'theme-preference';
  const DARK_THEME = 'dark';
  const LIGHT_THEME = 'light';

  /**
   * Get the user's theme preference
   * Priority: localStorage > system preference > light (default)
   */
  function getThemePreference() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return stored;
    }

    // Check system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return DARK_THEME;
    }

    return LIGHT_THEME;
  }

  /**
   * Apply theme to the document
   */
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);

    // Update toggle button icons if they exist
    updateToggleIcons(theme);
  }

  /**
   * Update toggle button icons and text based on current theme
   */
  function updateToggleIcons(theme) {
    const toggleButtons = document.querySelectorAll('.theme-toggle');
    toggleButtons.forEach(button => {
      const sunIcon = button.querySelector('.sun-icon');
      const moonIcon = button.querySelector('.moon-icon');
      const toggleText = button.querySelector('.toggle-text');

      if (sunIcon && moonIcon) {
        if (theme === DARK_THEME) {
          sunIcon.style.display = 'flex';
          moonIcon.style.display = 'none';
        } else {
          sunIcon.style.display = 'none';
          moonIcon.style.display = 'flex';
        }
      }

      if (toggleText) {
        toggleText.textContent = theme === DARK_THEME ? 'Light' : 'Dark';
      }
    });
  }

  /**
   * Toggle between light and dark themes
   */
  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || getThemePreference();
    const newTheme = currentTheme === DARK_THEME ? LIGHT_THEME : DARK_THEME;

    localStorage.setItem(STORAGE_KEY, newTheme);
    applyTheme(newTheme);
  }

  /**
   * Create and inject the toggle button into the navbar
   */
  function createToggleButton() {
    // Check if button already exists
    if (document.querySelector('.theme-toggle')) {
      return;
    }

    const currentTheme = getThemePreference();
    const isDark = currentTheme === DARK_THEME;

    const button = document.createElement('button');
    button.className = 'theme-toggle';
    button.setAttribute('aria-label', 'Toggle dark mode');
    button.setAttribute('title', 'Toggle dark mode');
    button.innerHTML = `
      <span class="moon-icon" aria-hidden="true" style="display: ${isDark ? 'none' : 'flex'};">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
        </svg>
      </span>
      <span class="sun-icon" aria-hidden="true" style="display: ${isDark ? 'flex' : 'none'};">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="5"></circle>
          <line x1="12" y1="1" x2="12" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="23"></line>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
          <line x1="1" y1="12" x2="3" y2="12"></line>
          <line x1="21" y1="12" x2="23" y2="12"></line>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
        </svg>
      </span>
      <span class="toggle-text">${isDark ? 'Light' : 'Dark'}</span>
    `;

    button.addEventListener('click', toggleTheme);

    // Find the navbar and insert the button at the beginning
    const navbar = document.querySelector('.navbar-nav.navbar-nav-scroll.ms-auto');
    if (navbar) {
      const navItem = document.createElement('li');
      navItem.className = 'nav-item d-flex align-items-center';
      navItem.appendChild(button);
      navbar.insertBefore(navItem, navbar.firstChild);
    }
  }

  /**
   * Listen for system theme changes
   */
  function setupSystemThemeListener() {
    if (window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

      mediaQuery.addEventListener('change', (e) => {
        // Only update if user hasn't set a manual preference
        if (!localStorage.getItem(STORAGE_KEY)) {
          applyTheme(e.matches ? DARK_THEME : LIGHT_THEME);
        }
      });
    }
  }

  /**
   * Initialize theme system
   */
  function init() {
    // Apply theme immediately to prevent flash
    const theme = getThemePreference();
    applyTheme(theme);

    // Wait for DOM to be ready before creating button
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        createToggleButton();
        updateToggleIcons(theme);
      });
    } else {
      createToggleButton();
      updateToggleIcons(theme);
    }

    // Setup system preference listener
    setupSystemThemeListener();
  }

  // Initialize immediately
  init();

  // Expose toggle function globally for potential external use
  window.toggleTheme = toggleTheme;
})();
