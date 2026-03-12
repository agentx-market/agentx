const { Resvg } = require('@resvg/resvg-js');

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatStatValue(value, suffix = '') {
  if (value === null || value === undefined || value === '') return 'Pending';
  if (typeof value === 'number') return `${value.toLocaleString()}${suffix}`;
  return `${value}${suffix}`;
}

function buildAgentOgImage(agent, shareStats, imageVersion) {
  const ratingValue = shareStats.rating !== null ? `${shareStats.rating.toFixed(1)} / 5` : 'Unrated';
  const uptimeValue = shareStats.uptime !== null ? `${shareStats.uptime.toFixed(1)}%` : 'Pending';
  const apiCallsValue = formatStatValue(shareStats.apiCalls);
  const description = escapeXml((agent.description || 'Live operator listing on AgentX.').slice(0, 180));
  const name = escapeXml(agent.name);
  const pricing = escapeXml(agent.pricing || 'Contact for pricing');

  const svg = `
  <svg width="1200" height="630" viewBox="0 0 1200 630" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
        <stop stop-color="#0B1220"/>
        <stop offset="0.55" stop-color="#142A4B"/>
        <stop offset="1" stop-color="#1B6FFF"/>
      </linearGradient>
      <linearGradient id="panel" x1="180" y1="120" x2="1010" y2="530" gradientUnits="userSpaceOnUse">
        <stop stop-color="rgba(255,255,255,0.18)"/>
        <stop offset="1" stop-color="rgba(255,255,255,0.08)"/>
      </linearGradient>
    </defs>
    <rect width="1200" height="630" fill="url(#bg)"/>
    <circle cx="1030" cy="80" r="170" fill="rgba(255,255,255,0.08)"/>
    <circle cx="140" cy="570" r="190" fill="rgba(16,185,129,0.14)"/>
    <rect x="72" y="72" width="1056" height="486" rx="36" fill="url(#panel)" stroke="rgba(255,255,255,0.18)"/>

    <text x="120" y="138" fill="#A7C7FF" font-size="26" font-family="Arial, sans-serif" font-weight="700" letter-spacing="3">AGENTX MARKET</text>
    <text x="120" y="230" fill="#FFFFFF" font-size="64" font-family="Arial, sans-serif" font-weight="700">${name}</text>
    <text x="120" y="286" fill="#D6E6FF" font-size="28" font-family="Arial, sans-serif">${description}</text>

    <rect x="120" y="340" width="280" height="140" rx="24" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.18)"/>
    <text x="152" y="386" fill="#A7C7FF" font-size="22" font-family="Arial, sans-serif" font-weight="700">API CALLS</text>
    <text x="152" y="444" fill="#FFFFFF" font-size="44" font-family="Arial, sans-serif" font-weight="700">${escapeXml(apiCallsValue)}</text>

    <rect x="430" y="340" width="280" height="140" rx="24" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.18)"/>
    <text x="462" y="386" fill="#A7C7FF" font-size="22" font-family="Arial, sans-serif" font-weight="700">UPTIME</text>
    <text x="462" y="444" fill="#FFFFFF" font-size="44" font-family="Arial, sans-serif" font-weight="700">${escapeXml(uptimeValue)}</text>

    <rect x="740" y="340" width="280" height="140" rx="24" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.18)"/>
    <text x="772" y="386" fill="#A7C7FF" font-size="22" font-family="Arial, sans-serif" font-weight="700">RATING</text>
    <text x="772" y="444" fill="#FFFFFF" font-size="44" font-family="Arial, sans-serif" font-weight="700">${escapeXml(ratingValue)}</text>

    <text x="120" y="530" fill="#FFFFFF" font-size="26" font-family="Arial, sans-serif">agentx.market/agents/${escapeXml(agent.slug)}</text>
    <text x="826" y="530" fill="#D6E6FF" font-size="22" font-family="Arial, sans-serif">v${escapeXml(imageVersion)} • ${pricing}</text>
  </svg>`;

  const resvg = new Resvg(svg, {
    fitTo: {
      mode: 'width',
      value: 1200,
    },
  });

  return resvg.render().asPng();
}

module.exports = { buildAgentOgImage };
