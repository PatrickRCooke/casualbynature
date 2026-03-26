const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const crypto = require('crypto');
const nodemailer = require('nodemailer');

// Maps tier to ZIP file
const TIER_FILES = {
  personal:     'casual-by-nature-personal.zip',
  professional: 'casual-by-nature-professional.zip',
  brand:        'casual-by-nature-brand.zip',
};

const TIER_LABELS = {
  personal:     'Personal License',
  professional: 'Professional License',
  brand:        'Brand / Extended License',
};

// Gmail transporter
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let sessionId;
  try {
    const body = JSON.parse(event.body);
    sessionId = body.sessionId;
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request' }) };
  }

  if (!sessionId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing session ID' }) };
  }

  try {
    // Verify payment with Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      return { statusCode: 402, body: JSON.stringify({ error: 'Payment not completed' }) };
    }

    // Work out tier from line items
    let tier = 'personal';
    try {
      const lineItems = await stripe.checkout.sessions.listLineItems(sessionId);
      const name = lineItems.data?.[0]?.description?.toLowerCase() || '';
      if (name.includes('professional')) tier = 'professional';
      else if (name.includes('brand')) tier = 'brand';
      else tier = 'personal';
    } catch (e) {
      console.error('Line items error:', e);
    }

    const file = TIER_FILES[tier];
    const tierLabel = TIER_LABELS[tier];
    const customerEmail = session.customer_details?.email || '';
    const customerName = session.customer_details?.name || 'there';

    // Generate signed expiring download token
    const secret = process.env.DOWNLOAD_SECRET || 'fallback-secret-change-me';
    const expiry = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    const payload = `${file}|${expiry}`;
    const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const token = Buffer.from(`${payload}|${hmac}`).toString('base64url');

    const origin = event.headers.origin || 'https://casualbynature.gilbertcooke.com';
    const downloadUrl = `${origin}/.netlify/functions/serve-file?token=${encodeURIComponent(token)}`;

    // Send email if we have an address
    if (customerEmail) {
      const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#242424;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#242424;padding:48px 24px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;max-width:560px;width:100%;">
          <tr>
            <td style="background:#242424;padding:32px 48px;border-top:4px solid #DDFF00;">
              <p style="margin:0;color:#DDFF00;font-size:13px;letter-spacing:0.2em;text-transform:uppercase;">
                Casual by Nature
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:48px 48px 32px;">
              <h1 style="margin:0 0 8px;font-size:32px;color:#242424;line-height:1.1;">
                Your font is ready.
              </h1>
              <div style="width:40px;height:3px;background:#DDFF00;margin:20px 0 28px;"></div>
              <p style="margin:0 0 16px;font-size:16px;color:#242424;line-height:1.7;">
                Hi ${customerName},
              </p>
              <p style="margin:0 0 16px;font-size:16px;color:#555;line-height:1.7;">
                Thank you for purchasing the <strong style="color:#242424;">${tierLabel}</strong> for Casual by Nature. Your font files are ready to download below.
              </p>
              <p style="margin:0 0 36px;font-size:16px;color:#555;line-height:1.7;">
                This link is personal to you and expires in <strong style="color:#242424;">24 hours</strong>.
              </p>
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#DDFF00;">
                    <a href="${downloadUrl}" style="display:inline-block;padding:16px 40px;font-size:16px;font-weight:bold;color:#242424;text-decoration:none;font-family:Georgia,serif;">
                      ↓ Download Your Font Files
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:28px 0 0;font-size:13px;color:#999;line-height:1.6;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${downloadUrl}" style="color:#555;word-break:break-all;">${downloadUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 48px 40px;border-top:1px solid #E0DAD0;">
              <p style="margin:0;font-size:12px;color:#999;line-height:1.6;">
                You're receiving this because you purchased a Casual by Nature font license.<br>
                Questions? Reply to this email and we'll get back to you.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

      await transporter.sendMail({
        from: `"Casual by Nature" <${process.env.GMAIL_USER}>`,
        to: customerEmail,
        subject: `Your Casual by Nature font files — ${tierLabel}`,
        html: emailHtml,
        text: `Hi ${customerName},\n\nThank you for purchasing the ${tierLabel} for Casual by Nature.\n\nDownload your font files here (link expires in 24 hours):\n${downloadUrl}\n\nQuestions? Just reply to this email.\n\nCasual by Nature`,
      });

      console.log('Download email sent to', customerEmail);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, file, email: customerEmail, tier }),
    };
  } catch (err) {
    console.error('get-download error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
