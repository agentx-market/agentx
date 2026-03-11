/* ============================================
   agentx.market — Main JavaScript
   ============================================ */

// --- Intersection Observer for scroll animations ---
const observerOptions = {
  threshold: 0.1,
  rootMargin: '0px 0px -40px 0px'
};

const fadeObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      fadeObserver.unobserve(entry.target);
    }
  });
}, observerOptions);

document.addEventListener('DOMContentLoaded', () => {
  // Observe all fade-in elements
  document.querySelectorAll('.fade-in, .stagger-children').forEach(el => {
    fadeObserver.observe(el);
  });

  // --- Active nav link for current page ---
  const currentPath = window.location.pathname.replace(/\/$/, '') || '/';
  document.querySelectorAll('.nav-links a:not(.btn)').forEach(link => {
    const linkPath = new URL(link.href, window.location.origin).pathname.replace(/\/$/, '') || '/';
    if (linkPath === currentPath) {
      link.setAttribute('aria-current', 'page');
    }
  });

  // --- Navbar scroll effect ---
  const navbar = document.querySelector('.navbar');
  if (navbar) {
    let lastScroll = 0;
    window.addEventListener('scroll', () => {
      const currentScroll = window.scrollY;
      if (currentScroll > 20) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
      lastScroll = currentScroll;
    }, { passive: true });
  }

  // --- Mobile nav toggle ---
  const navToggle = document.querySelector('.nav-toggle');
  const navLinks = document.querySelector('.nav-links');
  if (navToggle && navLinks) {
    // Create backdrop element dynamically (applied on all pages)
    const backdrop = document.createElement('div');
    backdrop.className = 'nav-backdrop';
    document.body.appendChild(backdrop);

    function openNav() {
      navLinks.classList.add('open');
      navToggle.classList.add('active');
      backdrop.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
    function closeNav() {
      navLinks.classList.remove('open');
      navToggle.classList.remove('active');
      backdrop.classList.remove('open');
      document.body.style.overflow = '';
    }

    navToggle.addEventListener('click', () => {
      navLinks.classList.contains('open') ? closeNav() : openNav();
    });
    backdrop.addEventListener('click', closeNav);
    // Close on link click
    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', closeNav);
    });
  }

  // --- Animated counters ---
  const counters = document.querySelectorAll('[data-count]');
  if (counters.length) {
    const counterObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          counterObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });

    counters.forEach(c => counterObserver.observe(c));
  }

  // --- Smooth anchor scrolling ---
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  setupHomepageActivityStats();
});

function animateCounter(el) {
  const target = parseInt(el.getAttribute('data-count'), 10);
  const suffix = el.getAttribute('data-suffix') || '';
  const prefix = el.getAttribute('data-prefix') || '';
  const duration = 2000;
  const start = Date.now();

  function update() {
    const elapsed = Date.now() - start;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(eased * target);
    el.textContent = prefix + current.toLocaleString() + suffix;
    if (progress < 1) requestAnimationFrame(update);
  }
  update();
}

// --- Typing animation for hero ---
function typeWriter(el, text, speed = 50) {
  let i = 0;
  el.textContent = '';
  function type() {
    if (i < text.length) {
      el.textContent += text.charAt(i);
      i++;
      setTimeout(type, speed);
    }
  }
  type();
}

function setupHomepageActivityStats() {
  const summaryEl = document.getElementById('homepage-activity-summary');
  const detailEl = document.getElementById('homepage-activity-detail');

  if (!summaryEl || !detailEl) {
    return;
  }

  async function refreshHomepageActivityStats() {
    try {
      const [agentsRes, categoriesRes] = await Promise.all([
        fetch('/api/agents', { headers: { Accept: 'application/json' } }),
        fetch('/api/categories', { headers: { Accept: 'application/json' } })
      ]);

      if (!agentsRes.ok || !categoriesRes.ok) {
        throw new Error('Failed to load homepage activity stats');
      }

      const [agents, categories] = await Promise.all([
        agentsRes.json(),
        categoriesRes.json()
      ]);

      const agentCount = Array.isArray(agents) ? agents.length : 0;
      const categoryCount = Array.isArray(categories) ? categories.length : 0;
      const newestAgent = Array.isArray(agents)
        ? agents.reduce((latest, agent) => {
            if (!agent || typeof agent.created_at !== 'number') {
              return latest;
            }

            if (!latest || agent.created_at > latest.created_at) {
              return agent;
            }

            return latest;
          }, null)
        : null;

      const lastRegisteredText = newestAgent
        ? formatTimeAgo(newestAgent.created_at)
        : 'unavailable';

      summaryEl.textContent = `${agentCount.toLocaleString()} agents monitored, ${categoryCount.toLocaleString()} categories, last registered: ${lastRegisteredText}`;
      detailEl.textContent = newestAgent
        ? `Newest agent: ${newestAgent.name}`
        : 'Newest agent unavailable';
    } catch (error) {
      summaryEl.textContent = 'Live registry activity unavailable';
      detailEl.textContent = 'Counts refresh automatically when data is reachable.';
      console.error('Failed to load homepage activity stats:', error);
    }
  }

  refreshHomepageActivityStats();
  window.setInterval(refreshHomepageActivityStats, 60000);
}

function formatTimeAgo(timestamp) {
  const deltaMs = Math.max(0, Date.now() - timestamp);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (deltaMs < minute) {
    return 'just now';
  }

  if (deltaMs < hour) {
    return `${Math.floor(deltaMs / minute)}m ago`;
  }

  if (deltaMs < day) {
    return `${Math.floor(deltaMs / hour)}h ago`;
  }

  return `${Math.floor(deltaMs / day)}d ago`;
}
