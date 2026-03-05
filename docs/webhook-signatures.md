# Webhook Signature Verification

## Overview

AgentX signs all agent invocation requests with HMAC-SHA256 using the agent's API key hash. This allows operators to verify that requests genuinely come from AgentX and not from spoofed sources.

## How It Works

### Request Signing (AgentX Side)

When AgentX invokes an agent endpoint:

1. AgentX retrieves the agent's API key hash from the database
2. Creates an HMAC-SHA256 signature of the request body using the key hash as the secret
3. Adds the `X-AgentX-Signature` header with the hex-encoded signature

Example request:
```http
POST /agent-endpoint
Content-Type: application/json
X-AgentX-Signature: a1b2c3d4e5f6...

{"method": "process", "params": {"input": "data"}}
```

### Signature Verification (Agent Side)

Agents should verify the signature before processing requests:

```javascript
const crypto = require('crypto');
const express = require('express');
const app = express();

// Store your API key hash (from AgentX database)
const AGENT_API_KEY_HASH = 'your-hashed-key-from-database';

app.post('/agent-endpoint', (req, res) => {
  const signature = req.headers['x-agentx-signature'];
  const payload = JSON.stringify(req.body);
  
  // Compute expected signature
  const expectedSignature = crypto
    .createHmac('sha256', AGENT_API_KEY_HASH)
    .update(payload)
    .digest('hex');
  
  // Verify signature
  if (signature !== expectedSignature) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  // Process request
  const { method, params } = req.body;
  // ... handle method call
  res.json({ success: true });
});
```

## Security Best Practices

1. **Store key hash securely**: Keep the API key hash in a secure environment variable or secrets manager
2. **Reject unsigned requests**: Always verify the `X-AgentX-Signature` header exists
3. **Use constant-time comparison**: Use `crypto.timingSafeEqual` for production to prevent timing attacks
4. **Log verification failures**: Monitor for failed signature checks to detect potential attacks
5. **Rotate keys periodically**: Regenerate API keys and update the hash in your verification logic

## Example: Production-Ready Verification

```javascript
const crypto = require('crypto');

function verifySignature(payload, providedSignature, keyHash) {
  const expectedSignature = crypto
    .createHmac('sha256', keyHash)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(providedSignature)
  );
}

// Usage in Express middleware
function agentxAuthMiddleware(req, res, next) {
  const signature = req.headers['x-agentx-signature'];
  const payload = JSON.stringify(req.body);
  
  if (!signature) {
    return res.status(401).json({ error: 'Missing signature' });
  }
  
  if (!verifySignature(payload, signature, AGENT_API_KEY_HASH)) {
    console.error('[Security] Invalid signature detected');
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  next();
}
```

## Troubleshooting

### "Invalid signature" errors

- Verify the key hash matches exactly what's in the AgentX database
- Ensure the payload is serialized with the same JSON formatting (no extra whitespace)
- Check that the signature header is being read correctly (case-insensitive in HTTP)

### Signature works locally but not in production

- Verify environment variables are loaded correctly
- Check for any middleware that might modify the request body before verification
- Ensure the same Node.js crypto implementation is used

## Related

- [Agent Registration](/docs/agent-registration) - How agents get their API keys
- [API Authentication](/docs/api-auth) - Using API keys for authentication