const express = require('express');
const db = require('../db');

const router = express.Router();

const SLOT_PRICE_USD_CENTS = 5000;
const SLOTS_PER_ISSUE = 3;

function getConfiguredAdminIds() {
  return (process.env.NEWSLETTER_ADMIN_IDS || 'marco-seed-operator')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function isAdmin(req) {
  return Boolean(req.operatorId && getConfiguredAdminIds().includes(req.operatorId));
}

function requireAdminPage(req, res, next) {
  if (!req.operatorId) {
    return res.redirect('/auth/github');
  }
  if (!isAdmin(req)) {
    return res.status(403).send('Forbidden');
  }
  next();
}

function requireAdminApi(req, res, next) {
  if (!req.operatorId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

function normalizeWeekStart(input) {
  const baseDate = input ? new Date(`${input}T00:00:00Z`) : new Date();
  if (Number.isNaN(baseDate.getTime())) {
    return null;
  }

  const day = baseDate.getUTCDay();
  const delta = day === 0 ? -6 : 1 - day;
  baseDate.setUTCDate(baseDate.getUTCDate() + delta);
  return baseDate.toISOString().slice(0, 10);
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getBookedSlots(weekStart) {
  return db.prepare(`
    SELECT
      nsb.*,
      o.email AS operator_email,
      o.name AS operator_name,
      i.status AS invoice_status,
      i.total_amount
    FROM newsletter_sponsor_bookings nsb
    LEFT JOIN operators o ON o.id = nsb.operator_id
    LEFT JOIN invoices i ON i.id = nsb.invoice_id
    WHERE nsb.week_start = ?
    ORDER BY nsb.slot_position ASC
  `).all(weekStart);
}

function buildSlotResponse(weekStart) {
  const bookedRows = getBookedSlots(weekStart);
  const bookedByPosition = new Map(bookedRows.map((row) => [row.slot_position, row]));
  const slots = [];

  for (let slotPosition = 1; slotPosition <= SLOTS_PER_ISSUE; slotPosition += 1) {
    const booking = bookedByPosition.get(slotPosition);
    slots.push({
      slotPosition,
      weekStart,
      priceUsd: SLOT_PRICE_USD_CENTS / 100,
      available: !booking,
      booking: booking ? {
        id: booking.id,
        sponsorName: booking.sponsor_name,
        sponsorUrl: booking.sponsor_url,
        logoUrl: booking.logo_url,
        blurb: booking.blurb,
        operatorId: booking.operator_id,
        operatorName: booking.operator_name,
        operatorEmail: booking.operator_email,
        invoiceId: booking.invoice_id,
        invoiceStatus: booking.invoice_status || null,
        status: booking.status,
      } : null,
    });
  }

  return {
    weekStart,
    weekEnd: addDays(weekStart, 6),
    slots,
    sponsoredHtml: renderSponsoredBlocks(weekStart),
  };
}

function renderSponsoredBlocks(weekStart) {
  const bookings = getBookedSlots(weekStart);
  if (bookings.length === 0) {
    return '';
  }

  const blocks = bookings.map((booking) => `
    <article style="margin:0 0 18px;padding:18px;border:1px solid #d8dfef;border-radius:14px;background:#f8fbff;">
      <div style="display:inline-block;margin:0 0 10px;padding:4px 9px;border-radius:999px;background:#10233f;color:#ffffff;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Sponsored</div>
      <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="width:84px;vertical-align:top;padding-right:16px;">
            <img src="${escapeHtml(booking.logo_url)}" alt="${escapeHtml(booking.sponsor_name)} logo" style="display:block;width:72px;height:72px;object-fit:contain;border-radius:12px;background:#ffffff;border:1px solid #d8dfef;padding:8px;">
          </td>
          <td style="vertical-align:top;">
            <h3 style="margin:0 0 8px;font-size:18px;line-height:1.3;color:#10233f;">${escapeHtml(booking.sponsor_name)}</h3>
            <p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#31425f;">${escapeHtml(booking.blurb)}</p>
            <a href="${escapeHtml(booking.sponsor_url)}" style="color:#0f6ad8;font-size:14px;font-weight:600;text-decoration:none;">Visit sponsor</a>
          </td>
        </tr>
      </table>
    </article>
  `).join('');

  return `
    <section aria-label="Sponsored content" style="margin:24px 0;">
      ${blocks}
    </section>
  `;
}

router.get('/admin/newsletter', requireAdminPage, (req, res) => {
  const requestedWeek = normalizeWeekStart(req.query.weekStart);
  const nextWeek = normalizeWeekStart();
  const weekStart = requestedWeek || nextWeek;
  const slotData = buildSlotResponse(weekStart);
  const operators = db.prepare(`
    SELECT id, email, name
    FROM operators
    ORDER BY COALESCE(name, email, id) ASC
  `).all();

  res.render('admin-newsletter', {
    title: 'Newsletter Sponsorships',
    operator: { id: req.operatorId },
    weekStart,
    nextWeek,
    slotPriceUsd: SLOT_PRICE_USD_CENTS / 100,
    slotsPerIssue: SLOTS_PER_ISSUE,
    slotData,
    operators,
  });
});

router.get('/api/newsletter/slots', (req, res) => {
  const weekStart = normalizeWeekStart(req.query.weekStart);
  if (!weekStart) {
    return res.status(400).json({ error: 'Invalid weekStart' });
  }

  res.json(buildSlotResponse(weekStart));
});

router.post('/api/newsletter/book', requireAdminApi, (req, res) => {
  const {
    operatorId,
    weekStart: requestedWeekStart,
    slotPosition,
    sponsorName,
    sponsorUrl,
    logoUrl,
    blurb,
  } = req.body || {};

  const weekStart = normalizeWeekStart(requestedWeekStart);
  const parsedSlotPosition = Number.parseInt(slotPosition, 10);

  if (!operatorId || !weekStart || !Number.isInteger(parsedSlotPosition) || parsedSlotPosition < 1 || parsedSlotPosition > SLOTS_PER_ISSUE) {
    return res.status(400).json({ error: 'Invalid booking request' });
  }
  if (!sponsorName || !sponsorUrl || !logoUrl || !blurb) {
    return res.status(400).json({ error: 'Missing sponsor content' });
  }
  if (String(blurb).trim().length > 220) {
    return res.status(400).json({ error: 'Blurb must be 220 characters or fewer' });
  }

  const operator = db.prepare('SELECT id, email, name FROM operators WHERE id = ?').get(operatorId);
  if (!operator) {
    return res.status(404).json({ error: 'Operator not found' });
  }

  const existingBooking = db.prepare(`
    SELECT id
    FROM newsletter_sponsor_bookings
    WHERE week_start = ? AND slot_position = ?
  `).get(weekStart, parsedSlotPosition);

  if (existingBooking) {
    return res.status(409).json({ error: 'Slot already booked' });
  }

  const now = Date.now();
  const periodStart = new Date(`${weekStart}T00:00:00Z`).getTime();
  const periodEnd = new Date(`${addDays(weekStart, 6)}T23:59:59Z`).getTime();

  const transaction = db.transaction(() => {
    const invoiceResult = db.prepare(`
      INSERT INTO invoices (
        user_id,
        period_start,
        period_end,
        subtotal,
        total_amount,
        status,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      operatorId,
      periodStart,
      periodEnd,
      SLOT_PRICE_USD_CENTS / 100,
      SLOT_PRICE_USD_CENTS / 100,
      'issued',
      now
    );

    const bookingResult = db.prepare(`
      INSERT INTO newsletter_sponsor_bookings (
        operator_id,
        week_start,
        slot_position,
        sponsor_name,
        sponsor_url,
        logo_url,
        blurb,
        price_usd_cents,
        invoice_id,
        status,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      operatorId,
      weekStart,
      parsedSlotPosition,
      String(sponsorName).trim(),
      String(sponsorUrl).trim(),
      String(logoUrl).trim(),
      String(blurb).trim(),
      SLOT_PRICE_USD_CENTS,
      invoiceResult.lastInsertRowid,
      'booked',
      now,
      now
    );

    return {
      bookingId: bookingResult.lastInsertRowid,
      invoiceId: invoiceResult.lastInsertRowid,
    };
  });

  try {
    const result = transaction();
    res.status(201).json({
      success: true,
      bookingId: result.bookingId,
      invoiceId: result.invoiceId,
      invoiceStatus: 'issued',
      slot: buildSlotResponse(weekStart).slots.find((entry) => entry.slotPosition === parsedSlotPosition),
    });
  } catch (error) {
    console.error('[newsletter-sponsors] Booking failed:', error.message);
    res.status(500).json({ error: 'Failed to book newsletter slot' });
  }
});

module.exports = router;
module.exports.renderSponsoredBlocks = renderSponsoredBlocks;
