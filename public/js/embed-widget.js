/**
 * AgentX Embeddable Widget
 * Version: 1.0.0
 * 
 * One-click "Add to AgentX" button for agent operators to embed on their sites.
 * Displays rating, count, and links to marketplace. Google Analytics integration.
 */

(function() {
  'use strict';

  // Default configuration
  const defaults = {
    agentId: null,           // Required: agent slug/ID from marketplace
    theme: 'dark',           // dark | light
    size: 'medium',          // small | medium | large
    showRating: true,        // boolean
    showCount: true,         // boolean
    buttonText: 'Add to AgentX',
    url: 'https://agentx.market',
    analyticsId: null,       // Google Analytics tracking ID (optional)
    analyticsEventCategory: 'AgentX Widget',
    analyticsEventAction: 'Install Click'
  };

  let config = {};
  let widgetElement = null;

  /**
   * Initialize widget from data attributes or config object
   */
  function init(customConfig) {
    // Merge defaults with custom config and data attributes
    config = mergeConfig(customConfig);

    // Validate required fields
    if (!config.agentId) {
      console.error('[AgentX Widget] agentId is required');
      return;
    }

    // Create widget DOM
    createWidget();

    // Attach to DOM
    attachToDOM();

    // Track impression
    trackImpression();
  }

  /**
   * Merge configuration sources
   */
  function mergeConfig(customConfig) {
    const dataConfig = extractDataConfig();
    
    return {
      ...defaults,
      ...customConfig,
      ...dataConfig
    };
  }

  /**
   * Extract data attributes from script tag or init params
   */
  function extractDataConfig() {
    // Check for script[data-agentx] first
    const scriptTag = document.querySelector('script[data-agentx]');
    if (scriptTag) {
      try {
        return JSON.parse(scriptTag.dataset.agentx);
      } catch (e) {
        console.error('[AgentX Widget] Invalid data-agentx attribute');
      }
    }

    // Check for global AgentXWidget config
    if (window.AgentXWidget && window.AgentXWidget.config) {
      return window.AgentXWidget.config;
    }

    return {};
  }

  /**
   * Create widget DOM structure
   */
  function createWidget() {
    const agentUrl = `${config.url}/agents/${encodeURIComponent(config.agentId)}`;
    const ratingDisplay = config.showRating ? getRatingHTML() : '';
    const countDisplay = config.showCount ? getCountHTML() : '';

    widgetElement = document.createElement('div');
    widgetElement.className = `agentx-widget agentx-widget--${config.theme} agentx-widget--${config.size}`;
    widgetElement.setAttribute('role', 'button');
    widgetElement.setAttribute('tabindex', '0');
    widgetElement.innerHTML = `
      <a href="${agentUrl}" class="agentx-button" target="_blank" rel="noopener noreferrer">
        <div class="agentx-icon"></div>
        <span class="agentx-label">${config.buttonText}</span>
      </a>
      ${ratingDisplay}
      ${countDisplay}
    `;

    // Event listeners
    widgetElement.addEventListener('click', () => handleClick(agentUrl));
    widgetElement.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        window.open(agentUrl, '_blank');
      }
    });
  }

  /**
   * Get rating badge HTML (simulated - will be populated from API later)
   */
  function getRatingHTML() {
    // Placeholder for dynamic rating fetch - in production this would
    // make an API call to /api/agents/:id with ?include=stats
    return `
      <div class="agentx-rating">★ 4.8</div>
    `;
  }

  /**
   * Get install count HTML (placeholder)
   */
  function getCountHTML() {
    return `
      <div class="agentx-count">1,234 installs</div>
    `;
  }

  /**
   * Attach widget to DOM
   */
  function attachToDOM() {
    const targetSelector = config.target || 'body';
    const target = document.querySelector(targetSelector);
    
    if (target) {
      target.appendChild(widgetElement);
    } else {
      // Fallback: append to body
      document.body.appendChild(widgetElement);
      console.warn('[AgentX Widget] Target selector not found, appended to body');
    }
  }

  /**
   * Handle click - track and navigate
   */
  function handleClick(url) {
    // Track event
    trackClick(url);

    // Open in new tab (unless user overrides behavior)
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  /**
   * Track widget impression using Google Analytics or custom callback
   */
  function trackImpression() {
    if (config.analyticsId) {
      if (window.gtag) {
        gtag('event', 'agentx_widget_impression', {
          event_category: config.analyticsEventCategory,
          event_label: config.agentId,
          value: 1
        });
      }
    } else {
      // Fallback to console for debugging
      console.log('[AgentX Widget] Impression tracked:', config.agentId);
    }

    // Custom callback if provided
    if (typeof config.onImpression === 'function') {
      config.onImpression(config);
    }
  }

  /**
   * Track click event
   */
  function trackClick(url) {
    if (config.analyticsId) {
      if (window.gtag) {
        gtag('event', 'agentx_widget_click', {
          event_category: config.analyticsEventCategory,
          event_action: config.analyticsEventAction,
          event_label: config.agentId,
          value: 1,
          send_to: `${config.analyticsId}/${config.analyticsEventAction}`
        });
      }
    } else {
      console.log('[AgentX Widget] Click tracked:', {
        agentId: config.agentId,
        url: url,
        timestamp: new Date().toISOString()
      });
    }

    // Custom callback if provided
    if (typeof config.onClick === 'function') {
      config.onClick(config, url);
    }
  }

  /**
   * Public API
   */
  window.AgentXWidget = {
    init: init,
    config: config,
    version: '1.0.0',
    
    // Allow updating config after init
    update: function(newConfig) {
      const oldConfig = { ...config };
      config = mergeConfig(newConfig);
      
      // Re-render if theme/size changed
      if (widgetElement && (newConfig.theme || newConfig.size)) {
        widgetElement.className = `agentx-widget agentx-widget--${config.theme} agentx-widget--${config.size}`;
      }
    },

    // Get current config
    getConfig: function() {
      return { ...config };
    },

    // Destroy widget
    destroy: function() {
      if (widgetElement && widgetElement.parentNode) {
        widgetElement.parentNode.removeChild(widgetElement);
      }
      widgetElement = null;
      delete window.AgentXWidget;
    }
  };

  // Auto-initialize if script has data-agentx attribute
  const initScript = document.querySelector('script[data-agentx]');
  if (initScript) {
    init();
  }
})();
