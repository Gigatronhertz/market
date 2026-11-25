'use strict';
// Default settings, plans, editable notification templates and the first admin account.
// Everything here is idempotent: it only fills in what is missing, so admin edits survive restarts.

const crypto = require('crypto');
const db = require('./db');
const { hashPassword, nowIso, randomToken } = require('./util');

const DEFAULT_SETTINGS = {
  disclaimer_text:
    'Naija Market Day is not liable for transactions between buyers and vendors. All payments and deliveries are arranged directly between the buyer and the vendor.',
  sender_email: 'hello@naijamarketday.example',
  booth_hold_minutes: 15, // Open question 7: how long a booth is held while paying
  waitlist_pay_hours: 48, // Open question 6: time a waitlisted vendor has to pay an offered booth
  buyer_reply_hours: 24, // Open question 5: shown to buyers in every chat
  unfinished_reminder_days: 2, // how often unfinished applications are reminded
  max_unfinished_reminders: 5,
  pre_market_reminder_days: 1, // "including the day before"
  banner_slots_per_city: 6, // ADM-52: 5 or 6
  sms_enabled: false, // Open question 8: bulk SMS not in first release unless confirmed
  user_event_submissions: true, // WEB-29; see the Q15 answer, which asks for admin-managed events
  hide_no_shows_from_directory: false, // Open question 12
  food_certificate_required: true, // VEN-12
  otp_ttl_minutes: 10, // VEN-04
  otp_max_attempts: 5, // VEN-04
  stripe_mode: 'simulated', // simulated | test | live; set by the STRIPE_* environment variables
};

const DEFAULT_PLANS = [
  { code: 'monthly', name: 'Monthly', price_cents: 2500, period_days: 30, free_days: 14 },
  { code: 'annual', name: 'Annual', price_cents: 25000, period_days: 365, free_days: 30 },
];

// Every automatic message in the requirements, stored as an editable template.
// Variables are written as {{name}} and filled in when the message is sent.
const DEFAULT_TEMPLATES = [
  { key: 'guest_confirmation', name: 'Guest registration confirmation', audience: 'guests', trigger_type: 'action', subject: 'You are registered for {{market_name}}',
    body: 'Hi {{first_name}},\n\nYou are registered for {{market_name}} in {{city}} on {{market_date}} at {{venue}}.\n\nShow this QR code at the entrance:\n{{qr_link}}\n\nSee you there!' },
  { key: 'guest_reminder', name: 'Guest reminder before the market', audience: 'guests', trigger_type: 'before_market', offset_days: 1, subject: 'Tomorrow: {{market_name}}',
    body: 'Hi {{first_name}},\n\nJust a reminder: {{market_name}} is on {{market_date}} at {{venue}}.\n\nYour QR code: {{qr_link}}' },
  { key: 'vendor_welcome', name: 'Welcome to the vendor portal', audience: 'vendors', trigger_type: 'action', subject: 'Welcome to Naija Market Day',
    body: 'Hi {{first_name}},\n\nYour booth fee for {{market_name}} is paid. Set a password to sign in to your vendor portal:\n{{link}}' },
  { key: 'application_unfinished', name: 'Unfinished application reminder', audience: 'vendors', trigger_type: 'action', subject: 'Finish your application for {{market_name}}',
    body: 'Hi {{first_name}},\n\nYour application for {{market_name}} is not finished yet. Continue here:\n{{link}}' },
  { key: 'payment_receipt', name: 'Booth fee receipt', audience: 'vendors', trigger_type: 'action', subject: 'Payment received for {{market_name}}',
    body: 'Hi {{first_name}},\n\nWe received your booth fee of {{amount}} for {{market_name}}. Your receipt is in your vendor portal.' },
  { key: 'application_received', name: 'Application received', audience: 'vendors', trigger_type: 'action', subject: 'We received your application for {{market_name}}',
    body: 'Hi {{first_name}},\n\nYour application for {{market_name}} is paid and under review. We will email you when there is an update.' },
  { key: 'admin_new_application', name: 'New paid application (admin)', audience: 'system', trigger_type: 'action', subject: 'New application: {{business_name}} for {{market_name}}',
    body: 'A new paid application is waiting for review.\n\nBusiness: {{business_name}}\nMarket: {{market_name}}\nLink: {{link}}' },
  { key: 'more_info_requested', name: 'More information requested', audience: 'vendors', trigger_type: 'action', subject: 'More information needed for {{market_name}}',
    body: 'Hi {{first_name}},\n\nWe need a bit more information about your application for {{market_name}}:\n\n{{message}}\n\nUpdate and resubmit here:\n{{link}}' },
  { key: 'application_approved', name: 'Application approved', audience: 'vendors', trigger_type: 'action', subject: 'Approved: booth {{booth_number}} at {{market_name}}',
    body: 'Hi {{first_name}},\n\nYou are approved for {{market_name}} on {{market_date}} at {{venue}}.\n\nYour booth: {{booth_number}}\nYour vendor QR code: {{qr_link}}' },
  { key: 'application_declined', name: 'Application declined', audience: 'vendors', trigger_type: 'action', subject: 'Your application for {{market_name}}',
    body: 'Hi {{first_name}},\n\nUnfortunately we could not approve your application for {{market_name}}. Your booth fee of {{amount}} has been refunded automatically.' },
  { key: 'waitlist_joined', name: 'Waitlist confirmation', audience: 'vendors', trigger_type: 'action', subject: 'You are on the waitlist for {{market_name}}',
    body: 'Hi {{first_name}},\n\nThe booth you wanted is taken. You are on the waitlist for {{market_name}} and we will tell you if a booth is offered.' },
  { key: 'waitlist_offer', name: 'Booth offered from the waitlist', audience: 'vendors', trigger_type: 'action', subject: 'A booth is available at {{market_name}}',
    body: 'Hi {{first_name}},\n\nA booth is available for you at {{market_name}}. Accept the terms and pay here within {{hours}} hours:\n{{link}}' },
  { key: 'vendor_reminder', name: 'Vendor reminder before the market', audience: 'vendors', trigger_type: 'before_market', offset_days: 1, subject: 'Tomorrow: {{market_name}}',
    body: 'Hi {{first_name}},\n\n{{market_name}} is on {{market_date}} at {{venue}}. Your booth is {{booth_number}}. Set-up details: arrive from {{start_time}}.' },
  { key: 'guest_thank_you', name: 'Thank you and vendor directory (guests)', audience: 'guests', trigger_type: 'after_market', offset_days: 0, subject: 'Thank you for coming to {{market_name}}',
    body: 'Hi {{first_name}},\n\nThank you for coming to {{market_name}}. Here is the vendor directory so you can contact the vendors you met:\n{{directory_link}}' },
  { key: 'vendor_after_market', name: 'After-market note (vendors)', audience: 'vendors', trigger_type: 'after_market', offset_days: 0, subject: 'Thank you for trading at {{market_name}}',
    body: 'Hi {{first_name}},\n\nThank you for being part of {{market_name}}.' },
  { key: 'subscription_update', name: 'Marketplace subscription update', audience: 'vendors', trigger_type: 'action', subject: 'Marketplace subscription update',
    body: 'Hi {{first_name}},\n\n{{message}}' },
  { key: 'buyer_chat_started', name: 'New buyer chat (vendor)', audience: 'vendors', trigger_type: 'action', subject: 'New request from a buyer',
    body: 'Hi {{first_name}},\n\nA buyer wants to know about these items:\n\n{{message}}\n\nReply in your vendor portal: {{link}}' },
  { key: 'vendor_replied', name: 'Vendor replied (buyer)', audience: 'buyers', trigger_type: 'action', subject: 'A vendor replied to your request',
    body: 'Hi {{first_name}},\n\n{{business_name}} has replied to your request. Open the chat: {{link}}' },
  { key: 'contact_inquiry_admin', name: 'Contact inquiry (admin mailbox)', audience: 'system', trigger_type: 'action', subject: 'New inquiry: {{topic}}',
    body: 'From: {{name}} <{{email}}>\nTopic: {{topic}}\n\n{{message}}' },
  { key: 'contact_thanks', name: 'Contact thank-you (sender)', audience: 'system', trigger_type: 'action', subject: 'Thank you for contacting Naija Market Day',
    body: 'Hi {{first_name}},\n\nThank you for your message. We will get back to you soon.' },
  { key: 'newsletter_confirm', name: 'Newsletter confirmation', audience: 'subscribers', trigger_type: 'action', subject: 'You are subscribed',
    body: 'Thanks for subscribing to Naija Market Day news.\n\nUnsubscribe at any time: {{unsubscribe_link}}' },
  { key: 'event_submitted_admin', name: 'Community event submitted (admin)', audience: 'system', trigger_type: 'action', subject: 'New community event to review: {{title}}',
    body: 'Submitted by {{name}}: {{title}} on {{event_date}} at {{place}}.' },
  { key: 'event_published', name: 'Community event published', audience: 'system', trigger_type: 'action', subject: 'Your event is published: {{title}}',
    body: 'Hi {{first_name}},\n\nYour event "{{title}}" is now published on the Events page.' },
  { key: 'bulk_message', name: 'Bulk message (manual)', audience: 'manual', trigger_type: 'manual', subject: '{{subject}}', body: '{{message}}' },
  { key: 'directory_email', name: 'Directory email (manual)', audience: 'guests', trigger_type: 'manual', subject: 'Vendor directory for {{market_name}}',
    body: 'Hi {{first_name}},\n\nHere is the vendor directory for {{market_name}}:\n{{directory_link}}' },
  { key: 'vendor_otp', name: 'One-time sign-in code', audience: 'vendors', trigger_type: 'action', subject: 'Your Naija Market Day sign-in code',
    body: 'Your sign-in code is {{code}}. It expires in {{minutes}} minutes and can be used once.' },
  { key: 'password_reset', name: 'Password reset', audience: 'system', trigger_type: 'action', subject: 'Reset your password',
    body: 'Hi {{first_name}},\n\nReset your password here (valid for 1 hour):\n{{link}}' },
  { key: 'staff_invite', name: 'Invitation to the admin or check-in workspace', audience: 'system', trigger_type: 'action', subject: 'You have been invited to Naija Market Day',
    body: 'Hi {{first_name}},\n\nYou have been invited as {{role}}. Set your password here:\n{{link}}' },
  { key: 'listing_hidden', name: 'Listing hidden by admin', audience: 'vendors', trigger_type: 'action', subject: 'A listing was hidden',
    body: 'Hi {{first_name}},\n\nYour listing "{{listing_name}}" was hidden from Marketplace by the Naija Market Day team. Reason: {{message}}' },
];

const DEFAULT_RESOURCES = [
  { section: 'faq', title: 'How do I apply for a market?', body: 'Choose a market, enter your email and follow the steps. You only pay once the application is complete.' },
  { section: 'faq', title: 'Can I apply to more than one market?', body: 'Yes. Each application is separate, with its own booth, payment and QR code.' },
  { section: 'insurance', title: 'Vendor insurance guidance', body: 'Check whether your city requires liability insurance for food and general vendors.' },
  { section: 'training', title: 'Vendor training videos', body: 'Short videos on setting up a booth, food safety and working the entrance.' },
];

function seedDefaults() {
  const d = db.conn();
  const now = nowIso();
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    d.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(key, JSON.stringify(value));
  }
  for (const p of DEFAULT_PLANS) {
    d.prepare('INSERT OR IGNORE INTO plans (code, name, price_cents, period_days, free_days) VALUES (?, ?, ?, ?, ?)')
      .run(p.code, p.name, p.price_cents, p.period_days, p.free_days);
  }
  for (const t of DEFAULT_TEMPLATES) {
    d.prepare(
      `INSERT OR IGNORE INTO notification_templates
       (key, name, audience, trigger_type, offset_days, subject, body, active, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
    ).run(t.key, t.name, t.audience, t.trigger_type, t.offset_days || 0, t.subject, t.body, now);
  }
  const resCount = d.prepare('SELECT COUNT(*) AS n FROM resources').get().n;
  if (resCount === 0) {
    DEFAULT_RESOURCES.forEach((r, i) =>
      d.prepare('INSERT INTO resources (section, title, body, url, sort_order) VALUES (?, ?, ?, ?, ?)')
        .run(r.section, r.title, r.body, '', i)
    );
  }
}

// Creates the first admin if none exists. Uses ADMIN_EMAIL / ADMIN_PASSWORD when set,
// otherwise generates a password and prints it once to the server log.
function ensureAdmin() {
  const d = db.conn();
  const existing = d.prepare("SELECT id FROM users WHERE roles LIKE '%admin%' AND status != 'removed' LIMIT 1").get();
  if (existing) return null;
  const email = (process.env.ADMIN_EMAIL || 'admin@naijamarketday.example').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || randomToken(12);
  d.prepare(
    `INSERT INTO users (email, name, roles, status, password_hash, created_at)
     VALUES (?, 'Site admin', 'admin', 'active', ?, ?)
     ON CONFLICT(email) DO UPDATE SET roles = 'admin', status = 'active', password_hash = excluded.password_hash`
  ).run(email, hashPassword(password), nowIso());
  return process.env.ADMIN_PASSWORD ? null : { email, password };
}

module.exports = { seedDefaults, ensureAdmin, DEFAULT_SETTINGS, DEFAULT_TEMPLATES, crypto };
