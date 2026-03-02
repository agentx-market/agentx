/**
 * Google Apps Script for Marco's Gmail (marcoagent42@gmail.com)
 *
 * Forwards new emails to https://agentx.market/webhooks/gmail
 * including body text, HTML, and base64-encoded attachments.
 *
 * SETUP:
 * 1. Go to https://script.google.com while logged in as marcoagent42@gmail.com
 * 2. Create a new project, name it "Marco Email Forwarder"
 * 3. Paste this entire script into Code.gs (replace the default code)
 * 4. Click Run > processNewEmails (authorize when prompted — grant Gmail access)
 * 5. Click Triggers (clock icon) > Add Trigger:
 *    - Function: processNewEmails
 *    - Event source: Time-driven
 *    - Type: Minutes timer
 *    - Interval: Every 5 minutes
 * 6. Save. Done — new emails will be forwarded to AgentX automatically.
 *
 * The script uses a label "Forwarded" to track which emails have been processed.
 * Only unread emails without the "Forwarded" label are sent.
 */

var WEBHOOK_URL = 'https://agentx.market/webhooks/gmail';
var WEBHOOK_SECRET = 'REDACTED'; // Must match GMAIL_WEBHOOK_SECRET in webserver plist
var LABEL_NAME = 'Forwarded';
var MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10MB per attachment

function processNewEmails() {
  // Get or create the "Forwarded" label
  var label = GmailApp.getUserLabelByName(LABEL_NAME);
  if (!label) {
    label = GmailApp.createLabel(LABEL_NAME);
  }

  // Search for unread threads NOT already labeled
  var threads = GmailApp.search('is:unread -label:' + LABEL_NAME, 0, 10);

  if (threads.length === 0) return;

  for (var t = 0; t < threads.length; t++) {
    var thread = threads[t];
    var messages = thread.getMessages();

    for (var m = 0; m < messages.length; m++) {
      var msg = messages[m];
      if (!msg.isUnread()) continue;

      try {
        var payload = {
          messageId: msg.getId(),
          threadId: thread.getId(),
          from: msg.getFrom(),
          to: msg.getTo(),
          subject: msg.getSubject(),
          date: msg.getDate().toISOString(),
          bodyText: msg.getPlainBody() || '',
          bodyHtml: msg.getBody() || '',
          attachments: []
        };

        // Process attachments
        var attachments = msg.getAttachments();
        for (var a = 0; a < attachments.length; a++) {
          var att = attachments[a];
          if (att.getSize() > MAX_ATTACHMENT_SIZE) {
            payload.attachments.push({
              filename: att.getName(),
              contentType: att.getContentType(),
              size: att.getSize(),
              content: null,
              skipped: 'Too large (>' + MAX_ATTACHMENT_SIZE + ' bytes)'
            });
          } else {
            payload.attachments.push({
              filename: att.getName(),
              contentType: att.getContentType(),
              size: att.getSize(),
              content: Utilities.base64Encode(att.getBytes())
            });
          }
        }

        // Also check for inline images
        var inlineImages = msg.getAttachments({includeInlineImages: true, includeAttachments: false});
        for (var i = 0; i < inlineImages.length; i++) {
          var img = inlineImages[i];
          if (img.getSize() <= MAX_ATTACHMENT_SIZE) {
            payload.attachments.push({
              filename: img.getName() || ('inline-' + i + '.png'),
              contentType: img.getContentType(),
              size: img.getSize(),
              content: Utilities.base64Encode(img.getBytes()),
              inline: true
            });
          }
        }

        // Truncate body if too large (Apps Script URL Fetch has 50MB limit)
        if (payload.bodyText.length > 50000) {
          payload.bodyText = payload.bodyText.substring(0, 50000) + '\n[TRUNCATED]';
        }
        if (payload.bodyHtml.length > 50000) {
          payload.bodyHtml = payload.bodyHtml.substring(0, 50000);
        }

        // POST to webhook
        var options = {
          method: 'post',
          contentType: 'application/json',
          headers: {
            'X-Gmail-Webhook-Secret': WEBHOOK_SECRET
          },
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        };

        var response = UrlFetchApp.fetch(WEBHOOK_URL, options);
        var code = response.getResponseCode();

        if (code === 200) {
          msg.markRead();
          Logger.log('Forwarded: ' + msg.getSubject() + ' from ' + msg.getFrom());
        } else {
          Logger.log('Webhook returned ' + code + ' for: ' + msg.getSubject());
        }

      } catch (e) {
        Logger.log('Error processing message: ' + e.message);
      }
    }

    // Label the thread as forwarded and mark as read
    thread.addLabel(label);
  }
}

/**
 * Manual test function — run this first to verify everything works.
 * It processes any unread emails and logs the results.
 */
function testRun() {
  Logger.log('Starting test run...');
  processNewEmails();
  Logger.log('Test run complete. Check Execution log for details.');
}

/**
 * One-time setup — creates the "Forwarded" label if it doesn't exist.
 * Run this manually once.
 */
function setup() {
  var label = GmailApp.getUserLabelByName(LABEL_NAME);
  if (!label) {
    label = GmailApp.createLabel(LABEL_NAME);
    Logger.log('Created label: ' + LABEL_NAME);
  } else {
    Logger.log('Label already exists: ' + LABEL_NAME);
  }
}
