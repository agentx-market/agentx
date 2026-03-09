// Contest Page JavaScript - AgentX.Market

(function() {
  'use strict';

  // DOM Elements
  const nominationForm = document.getElementById('nomination-form');
  const agentSlugInput = document.getElementById('agent-slug');
  const reasonInput = document.getElementById('reason');
  const activityFeed = document.getElementById('activity-feed');

  // Form Submission Handlers
  if (nominationForm) {
    nominationForm.addEventListener('submit', handleNominationSubmit);
  }

  // Vote Button Handler
  function attachVoteListeners() {
    const voteButtons = document.querySelectorAll('.vote-btn');
    voteButtons.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        await handleVoteClick(e, btn);
      });
    });
  }

  // Handle Nomination Form Submission
  async function handleNominationSubmit(e) {
    e.preventDefault();

    const agentSlug = agentSlugInput.value.trim();
    const reason = reasonInput.value.trim();

    if (!agentSlug || !reason) {
      showNotification('Please fill in all required fields', 'error');
      return;
    }

    if (reason.length < 10) {
      showNotification('Reason must be at least 10 characters', 'error');
      return;
    }

    if (reason.length > 500) {
      showNotification('Reason must not exceed 500 characters', 'error');
      return;
    }

    try {
      submitButton.disabled = true;
      submitButton.textContent = 'Submitting...';

      const response = await fetch('/api/contest/nominate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ agentSlug, reason })
      });

      const data = await response.json();

      if (response.ok) {
        showNotification(data.message || 'Nomination submitted successfully!', 'success');
        nominationForm.reset();
        
        // Reload nominations
        setTimeout(() => location.reload(), 1500);
      } else {
        showNotification(data.error || 'Failed to submit nomination', 'error');
      }
    } catch (error) {
      console.error('[contest] Nomination error:', error);
      showNotification('Network error. Please try again.', 'error');
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'Submit Nomination';
    }
  }

  // Handle Vote Button Click
  async function handleVoteClick(e, btn) {
    const agentId = btn.getAttribute('data-agent');
    const agentSlug = nameToSlug(btn.dataset.agentName || '');

    try {
      btn.disabled = true;
      btn.textContent = 'Voting...';

      const response = await fetch('/api/contest/vote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ agentSlug })
      });

      const data = await response.json();

      if (response.ok) {
        showNotification(data.message || 'Vote recorded successfully!', 'success');
        
        // Update vote count visually
        updateVoteCount(agentId, data.totalVotes);
      } else {
        showNotification(data.error || 'Failed to submit vote', 'error');
      }
    } catch (error) {
      console.error('[contest] Vote error:', error);
      showNotification('Network error. Please try again.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Vote Now';
    }
  }

  // Update vote count display
  function updateVoteCount(agentId, newCount) {
    const agentCard = document.querySelector(`[data-agent="${agentId}"]`)?.closest('.nominee-card');
    if (agentCard) {
      const voteDisplay = agentCard.querySelector('.vote-count');
      if (voteDisplay) {
        voteDisplay.textContent = `🗳️ ${newCount} votes this month`;
      }
    }
  }

  // Show Notification
  function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);

    // Auto-remove after 4 seconds
    setTimeout(() => {
      notification.style.opacity = '0';
      setTimeout(() => notification.remove(), 300);
    }, 4000);

    return notification;
  }

  // Name to Slug Helper
  function nameToSlug(name) {
    return name.toLowerCase().replace(/ /g, '-');
  }

  // Stats Animation
  function animateStats() {
    const statCards = document.querySelectorAll('.stat-card');
    statCards.forEach(card => {
      const numberEl = card.querySelector('.stat-number');
      if (numberEl) {
        const target = parseInt(numberEl.textContent.replace(/[^0-9]/g, ''));
        if (target > 0 && !isNaN(target)) {
          animateCounter(numberEl, target, 2000);
        }
      }
    });
  }

  // Counter Animation
  function animateCounter(element, target, duration) {
    let start = 0;
    const increment = target / (duration / 16);
    
    function update(current) {
      if (current < target) {
        element.textContent = Math.floor(current + increment);
        requestAnimationFrame(() => update(current + increment));
      } else {
        element.textContent = target;
      }
    }
    
    update(start);
  }

  // Initialize Page Elements
  function init() {
    attachVoteListeners();
    
    // Add smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function(e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href').slice(1));
        if (target) {
          target.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });

    // Animate stats after page load
    setTimeout(() => animateStats(), 500);
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
