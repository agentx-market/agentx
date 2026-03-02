const https = require('https');

async function getGitHubAccountAge(githubUsername) {
  return new Promise((resolve, reject) => {
    https.get(
      `https://api.github.com/users/${githubUsername}`,
      { headers: { 'User-Agent': 'agentx-abuse-prevention' } },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const user = JSON.parse(data);
            if (res.statusCode !== 200) {
              return reject(new Error('GitHub user not found'));
            }
            const createdAt = new Date(user.created_at);
            const ageMs = Date.now() - createdAt.getTime();
            const ageDays = ageMs / (1000 * 60 * 60 * 24);
            resolve(ageDays);
          } catch (err) {
            reject(err);
          }
        });
      }
    ).on('error', reject);
  });
}

module.exports = { getGitHubAccountAge };
