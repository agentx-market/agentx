const searchInput = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');
const sortSelect = document.getElementById('sortSelect');
const agentGrid = document.getElementById('agentGrid');
const noResults = document.getElementById('noResults');

// Load categories on page load
loadCategories();

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
    if (agents.length === 0) {
      noResults.style.display = 'block';
      return;
    }
    noResults.style.display = 'none';

    agents.forEach(agent => {
      const card = document.createElement('div');
      card.className = 'agent-card';
      const imageUrl = agent.image_url || '/images/agent-default.png';
      card.innerHTML = `
        <img src="${imageUrl}" alt="${agent.name}" class="agent-image">
        <h3>${agent.name}</h3>
        <p class="description">${agent.description || 'No description'}</p>
        <div class="meta">
          <span class="category">${agent.category || 'Uncategorized'}</span>
          <span class="uptime">Uptime: ${(agent.uptime_percent || 0).toFixed(1)}%</span>
        </div>
        <a href="/agents/${agent.slug || agent.id}" class="view-btn">View Details</a>
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
