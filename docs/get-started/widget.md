# AgentX Embeddable Widget

Add a one-click "Install Agent" button to your agent's website. Visitors can instantly discover and deploy your agent through the AgentX marketplace.

## Quick Start

Add this script tag to your site's `<head>` or before `</body>`:

```html
<script src="https://agentx.market/js/embed-widget.js" data-agentx='{"agentId":"marco","theme":"dark","size":"medium"}'></script>
```

### Example Usage

**Basic (uses defaults)**
```html
<script src="https://agentx.market/js/embed-widget.js" data-agentx='{"agentId":"marco"}'></script>
```

**With custom styling**
```html
<script src="https://agentx.market/js/embed-widget.js" 
  data-agentx='{
    "agentId": "your-agent-slug",
    "theme": "light",
    "size": "large",
    "showRating": true,
    "showCount": false,
    "buttonText": "Deploy on AgentX"
  }'></script>
```

**Programmatic initialization**
```html
<script src="https://agentx.market/js/embed-widget.js"></script>
<script>
  AgentXWidget.init({
    agentId: 'marco',
    theme: 'dark',
    size: 'medium',
    target: '#custom-container',
    analyticsId: 'G-XXXXXXXXXX'
  });
</script>
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `agentId` | string | **required** | Your agent's slug from AgentX marketplace (e.g., "marco", "sentinel") |
| `theme` | string | `"dark"` | UI theme: `"dark"` or `"light"` |
| `size` | string | `"medium"` | Button size: `"small"`, `"medium"`, or `"large"` |
| `showRating` | boolean | `true` | Display star rating badge |
| `showCount` | boolean | `true` | Display install count |
| `buttonText` | string | `"Add to AgentX"` | Custom button label |
| `target` | string | `"body"` | CSS selector for where to insert widget (e.g., `"#container"`, `".widget-area"`) |
| `analyticsId` | string | `null` | Google Analytics tracking ID for click/impression events |
| `url` | string | `"https://agentx.market"` | Base marketplace URL (for self-hosted marketplaces) |

## Google Analytics Integration

Optional GA4 integration tracks widget impressions and clicks:

```html
<script src="https://agentx.market/js/embed-widget.js" 
  data-agentx='{
    "agentId": "marco",
    "analyticsId": "G-XXXXXXXXXX",
    "analyticsEventCategory": "AgentX Widget",
    "analyticsEventAction": "Install Click"
  }'></script>
```

**Tracked events:**
- `agentx_widget_impression` - fired when widget loads
- `agentx_widget_click` - fired when visitor clicks the button

## Custom Callbacks

Use custom functions for advanced tracking or analytics:

```html
<script src="https://agentx.market/js/embed-widget.js"></script>
<script>
  AgentXWidget.init({
    agentId: 'marco',
    onImpression: function(config) {
      console.log('Widget loaded for agent:', config.agentId);
      // Your custom tracking logic
    },
    onClick: function(config, url) {
      console.log('Click tracked:', url);
      // Custom click handling
    }
  });
</script>
```

## Widget Size Options

### Small (14px font, compact)
```html
data-agentx='{"agentId":"marco","size":"small"}'
```

### Medium (16px font, default)
```html
data-agentx='{"agentId":"marco","size":"medium"}'
```

### Large (20px font, prominent)
```html
data-agentx='{"agentId":"marco","size":"large"}'
```

## Themes

Dark theme matches AgentX branding by default. Light theme for sites with light backgrounds:

```html
<!-- Dark (default) -->
data-agentx='{"agentId":"marco","theme":"dark"}'

<!-- Light -->
data-agentx='{"agentId":"marco","theme":"light"}'
```

## Placement Examples

### Hero Section
```html
<section class="hero">
  <h1>Autonomous Business Agent</h1>
  <p>Runs 24/7, manages everything, ships code.</p>
  
  <!-- Embed Widget Here -->
  <div id="agentx-widget"></div>
  
  <script src="https://agentx.market/js/embed-widget.js" 
    data-agentx='{"agentId":"marco","target":"#agentx-widget"}'></script>
</section>
```

### Sidebar
```html
<aside class="sidebar">
  <!-- Widget will appear in sidebar -->
  <div id="widget-sidebar"></div>
  
  <script src="https://agentx.market/js/embed-widget.js"
    data-agentx='{"agentId":"marco","target":"#widget-sidebar"}'></script>
</aside>
```

### Footer CTA
```html
<footer class="cta">
  <h2>Ready to deploy?</h2>
  <div id="agentx-footer"></div>
  
  <script src="https://agentx.market/js/embed-widget.js"
    data-agentx='{"agentId":"marco","target":"#agentx-footer"}'></script>
</footer>
```

## Programmatic Control

The widget exposes a public API for dynamic updates:

```javascript
// Update configuration after load
AgentXWidget.update({
  theme: 'light',
  showCount: false
});

// Get current config
const config = AgentXWidget.getConfig();
console.log('Current config:', config);

// Destroy widget
AgentXWidget.destroy();
```

## Tracking Analytics

### Google Analytics 4 (recommended)
1. Include GA4 script in your site's `<head>`:
```html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>
```

2. Initialize widget with analyticsId:
```html
<script src="https://agentx.market/js/embed-widget.js" 
  data-agentx='{"agentId":"marco","analyticsId":"G-XXXXXXXXXX"}'></script>
```

### Custom Analytics Integration
Use the `onImpression` and `onClick` callbacks to integrate with any analytics platform:

```javascript
AgentXWidget.init({
  agentId: 'marco',
  onImpression: function(config) {
    // Mixpanel, Segment, custom logging, etc.
    mixpanel.track('AgentX Widget Loaded', { agent: config.agentId });
  },
  onClick: function(config, url) {
    segment.track('AgentX Install Click', { 
      agent: config.agentId,
      destination: url 
    });
  }
});
```

## API Endpoints Used

The widget references these AgentX API endpoints (in production):

- `GET /api/agents/:id?include=stats` - Fetch real-time rating and install count
- The current version uses placeholder values; future updates will dynamically populate stats.

## Styling

Widget styles are scoped and won't conflict with your site:

```css
.agentx-widget { font-family: var(--font-sans); }
.agentx-button { display: inline-flex; gap: 8px; padding: 12px 24px; }
.agentx-icon { width: 20px; height: 20px; }
.agentx-rating { color: #fbbf24; font-weight: bold; }
.agentx-count { color: #9ca3af; font-size: 0.875rem; }

/* Theme variants */
.agentx-widget--dark .agentx-button { background: linear-gradient(135deg, #6d5cff, #8b7dff); }
.agentx-widget--light .agentx-button { background: linear-gradient(135deg, #2a9d8f, #00d4aa); }
```

## Best Practices

1. **Placement matters**: Put the widget above the fold on your agent's landing page
2. **Clear value prop**: Ensure your page explains what the agent does before visitors see the widget
3. **Test both themes**: Choose the theme that matches your site's aesthetic
4. **Track conversions**: Use GA integration to measure click-through rates
5. **Mobile responsive**: Widget adapts to all screen sizes automatically

## Support

Questions or issues? Open an issue on [GitHub](https://github.com/agentx-market/agentx) or contact support at support@agentx.market.

---

Last updated: 2026-03-08 | Version: 1.0.0
