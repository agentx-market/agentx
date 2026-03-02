#!/bin/bash
# Helper script for sending email replies. Used by email processing agent.
# Usage: bash ~/marco_web/send_reply.sh "to@email.com" "Re: Subject" "Reply body text" ["in-reply-to-msg-id"] ["inbound_email_id"]
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

TO="$1"
SUBJECT="$2"
BODY="$3"
IN_REPLY_TO="${4:-}"
INBOUND_EMAIL_ID="${5:-}"

# Get SENDGRID_API_KEY from environment, or extract from webserver plist as fallback (for manual CLI usage)
if [ -z "${SENDGRID_API_KEY:-}" ]; then
  PLIST="$HOME/Library/LaunchAgents/com.marco.webserver.plist"
  if [ -f "$PLIST" ]; then
    SENDGRID_API_KEY=$(/usr/libexec/PlistBuddy -c "Print :EnvironmentVariables:SENDGRID_API_KEY" "$PLIST" 2>/dev/null || true)
  fi
  if [ -z "${SENDGRID_API_KEY:-}" ]; then
    echo '{"success":false,"error":"SENDGRID_API_KEY not found in env or plist"}'
    exit 1
  fi
  export SENDGRID_API_KEY
fi

cd /Users/marco/marco_web
node -e "
require('./email').send({
  to: process.argv[1],
  subject: process.argv[2],
  text: process.argv[3],
  inReplyTo: process.argv[4] || undefined,
  inboundEmailId: process.argv[5] ? parseInt(process.argv[5], 10) : undefined
}).then(r => console.log(JSON.stringify(r)));
" "$TO" "$SUBJECT" "$BODY" "$IN_REPLY_TO" "$INBOUND_EMAIL_ID"
