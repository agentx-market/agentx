// Browse page — agent grid with search, filter, sort, and category chips.
const searchInput = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');
const sortSelect = document.getElementById('sortSelect');
const agentGrid = document.getElementById('agentGrid');
const noResults = document.getElementById('noResults');
const emptyState = document.getElementById('emptyState');
const categoryChips = document.getElementById('categoryChips');

// Load categories and category counts on page load
loadCategories();
loadCategoryCounts();

// Event listeners
searchInput.addEventListener('input', debounce(loadAgents, 300));
categoryFilter.addEventListener('change', loadAgents);
sortSelect.addEventListener('change', loadAgents);

async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    const categories = await res.json();
    categories.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat;
      option.textContent = cat;
      categoryFilter.appendChild(option);
    });
  } catch (err) {
    console.error('Failed to load categories:', err);
  }
}

async function loadCategoryCounts() {
  try {
    const res = await fetch('/api/category-counts');
    const categoryCounts = await res.json();
    
    // Clear existing chips
    categoryChips.innerHTML = '';
    
    // Create chips for each category
    categoryCounts.forEach(cat => {
      const chip = document.createElement('button');
      chip.className = 'category-chip';
      chip.dataset.category = cat.category;
      chip.innerHTML = `
        ${cat.category}
        <span class="chip-count">${cat.count}</span>
      `;
      categoryChips.appendChild(chip);
    });
    
    // Add event listeners to chips
    document.querySelectorAll('.category-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const category = chip.dataset.category;
        categoryFilter.value = category;
        loadAgents();
        
        // Update active chip state
        updateActiveChip(category);
        
        // Scroll to top of grid
        agentGrid.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  } catch (err) {
    console.error('Failed to load category counts:', err);
  }
}

function updateActiveChip(selectedCategory) {
  document.querySelectorAll('.category-chip').forEach(chip => {
    if (chip.dataset.category === selectedCategory) {
      chip.classList.add('active');
    } else {
      chip.classList.remove('active');
    }
  });
}

async function loadAgents() {
  const search = searchInput.value;
  const category = categoryFilter.value;
  const sort = sortSelect.value;

  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (category) params.append('category', category);
  params.append('sort', sort);

  try {
    const res = await fetch(`/api/browse?${params}`);
    const { agents } = await res.json();

    agentGrid.innerHTML = '';
    noResults.style.display = 'none';
    if (emptyState) emptyState.style.display = 'none';

    if (agents.length === 0) {
      if (search || category) {
        noResults.style.display = 'block';
      } else if (emptyState) {
        emptyState.style.display = 'block';
      }
      return;
    }

    agents.forEach(agent => {
      const card = document.createElement('div');
      card.className = 'agent-card';

      const initial = (agent.name || '?')[0].toUpperCase();
      const uptime = (agent.uptime_percent || 0).toFixed(1);
      const uptimeClass = uptime >= 99 ? 'uptime-good' : uptime >= 95 ? 'uptime-warn' : 'uptime-bad';
      const description = agent.description || 'No description provided.';
      const slug = agent.slug || agent.id;
      
      // Build category badges
      const categoryBadges = agent.categories.map(cat => 
        `<span class="agent-category-badge">${cat}</span>`
      ).join('');

      card.innerHTML = `
        <div class="card-header">
          <div class="agent-avatar">${initial}</div>
          <div>
            <h3>${agent.name}</h3>
            <div class="agent-categories">${categoryBadges}</div>
          </div>
        </div>
        <p class="description">${description}</p>
        <div class="agent-meta">
          <span class="meta-item"><strong class="${uptimeClass}">${uptime}%</strong> uptime</span>
        </div>
        <div class="agent-actions">
          <a href="/agents/${slug}" class="btn btn-secondary btn-small">View Details</a>
          ${!agent.operator_id ? `<a href="/contact?agent=${encodeURIComponent(agent.name)}" class="btn btn-primary btn-small">Claim this listing</a>` : ''}
        </div>
      `;
      agentGrid.appendChild(card);
    });
  } catch (err) {
    console.error('Failed to load agents:', err);
  }
}

function debounce(fn, ms) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), ms);
  };
}

loadAgents();
