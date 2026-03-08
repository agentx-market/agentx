document.addEventListener('DOMContentLoaded', async () => {
  await loadBlogPosts();
});

async function loadBlogPosts() {
  try {
    const response = await fetch('/api/blog');
    const posts = await response.json();
    
    const container = document.getElementById('blog-posts');
    
    if (posts.length === 0) {
      container.innerHTML = '<p class="no-posts">No blog posts yet.</p>';
      return;
    }
    
    posts.forEach(post => {
      const article = createPostCard(post);
      container.appendChild(article);
    });
  } catch (error) {
    console.error('Failed to load blog posts:', error);
    document.getElementById('blog-posts').innerHTML = 
      '<p class="no-posts">Failed to load blog posts.</p>';
  }
}

function createPostCard(post) {
  const article = document.createElement('article');
  article.className = 'blog-card';
  
  const date = new Date(post.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  const excerpt = post.excerpt || post.content.substring(0, 200) + '...';
  
  article.innerHTML = `
    <div class="blog-card-image">
      <img src="${post.featured_image || '/images/blog-default.jpg'}" alt="${post.title}">
    </div>
    <div class="blog-card-content">
      <div class="blog-meta">
        <span class="blog-date">${date}</span>
        ${post.tags ? `<span class="blog-tags">${post.tags.map(tag => `<a href="/blog?tag=${encodeURIComponent(tag)}" class="tag">#${tag}</a>`).join(' ')}</span>` : ''}
      </div>
      <h2 class="blog-title"><a href="/blog/${post.slug}">${post.title}</a></h2>
      <p class="blog-excerpt">${excerpt}</p>
      <a href="/blog/${post.slug}" class="read-more">Read more →</a>
    </div>
  `;
  
  return article;
}
