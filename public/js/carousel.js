document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('topAgentsCarousel');

  if (!container) {
    return;
  }

  let rotationTimer = null;

  function renderEmpty(message) {
    container.innerHTML = `<div class="featured-spotlight-empty">${message}</div>`;
  }

  function renderSlides(agents, activeIndex) {
    const activeAgent = agents[activeIndex];
    const dots = agents.map((_, index) => (
      `<span class="featured-spotlight-dot${index === activeIndex ? ' is-active' : ''}" aria-hidden="true"></span>`
    )).join('');
    const rating = Number(activeAgent.rating || 0).toFixed(1);
    const reviewLabel = Number(activeAgent.reviewCount || 0) === 1 ? 'review' : 'reviews';

    container.innerHTML = `
      <article class="featured-slide">
        <div class="featured-slide-head">
          <div class="featured-slide-thumb" aria-hidden="true">${escapeHtml(activeAgent.thumbnailText || '?')}</div>
          <div class="featured-slide-meta">
            <h3 class="featured-slide-name">${escapeHtml(activeAgent.name || 'Featured agent')}</h3>
            <p class="featured-slide-tier">${escapeHtml(activeAgent.tier || 'PRO')} operator</p>
          </div>
          <span class="featured-badge">${escapeHtml(activeAgent.badge || 'Featured')}</span>
        </div>
        <div class="featured-rating-row">
          <span class="featured-rating-value">${rating}/5</span>
          <span class="featured-rating-stars" aria-hidden="true">★★★★★</span>
          <span>${Number(activeAgent.reviewCount || 0)} ${reviewLabel}</span>
        </div>
        <p class="featured-slide-copy">Operator-backed listing with active featured placement. Ranking weights verified rating plus recency, and only Pro+ tier operators are eligible.</p>
        <div class="featured-spotlight-footer">
          <a class="featured-spotlight-link" href="/agents/${encodeURIComponent(activeAgent.slug || '')}">View agent</a>
          <div class="featured-spotlight-dots" aria-hidden="true">${dots}</div>
        </div>
      </article>
    `;
  }

  function startRotation(agents) {
    let activeIndex = 0;
    renderSlides(agents, activeIndex);

    if (rotationTimer) {
      window.clearInterval(rotationTimer);
    }

    if (agents.length < 2) {
      return;
    }

    rotationTimer = window.setInterval(() => {
      activeIndex = (activeIndex + 1) % agents.length;
      renderSlides(agents, activeIndex);
    }, 8000);
  }

  async function loadCarousel() {
    try {
      const response = await fetch('/api/featured/rotating', {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error('Failed to load featured agents');
      }

      const payload = await response.json();
      const agents = Array.isArray(payload.agents) ? payload.agents : [];

      if (agents.length === 0) {
        renderEmpty('Featured placements will appear here once Pro+ operators activate sponsorship.');
        return;
      }

      startRotation(agents);
    } catch (error) {
      console.error('Failed to load homepage featured carousel:', error);
      renderEmpty('Featured placements are temporarily unavailable.');
    }
  }

  loadCarousel();
});

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
