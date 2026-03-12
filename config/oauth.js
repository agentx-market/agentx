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
  twitter: {
    clientID: process.env.TWITTER_CLIENT_ID || 'YOUR_TWITTER_CLIENT_ID',
    clientSecret: process.env.TWITTER_CLIENT_SECRET || 'YOUR_TWITTER_SECRET',
    callbackURL: process.env.TWITTER_CALLBACK_URL || 'https://agentx.market/auth/twitter/callback',
  },
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-in-prod',
};
