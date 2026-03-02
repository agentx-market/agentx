module.exports = {
  github: {
    clientID: process.env.GITHUB_OAUTH_CLIENT_ID || 'YOUR_GITHUB_CLIENT_ID',
    clientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET || 'YOUR_GITHUB_SECRET',
    callbackURL: 'https://agentx.market/auth/github/callback',
  },
  google: {
    clientID: process.env.GOOGLE_OAUTH_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID',
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || 'YOUR_GOOGLE_SECRET',
    callbackURL: 'https://agentx.market/auth/google/callback',
  },
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-in-prod',
};
