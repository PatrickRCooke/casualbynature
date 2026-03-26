const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const crypto = require('crypto');

// Maps Stripe product tier to the correct ZIP file
const TIER_FILES = {
  personal:     'casual-by-nature-personal.zip',
  professional: 'casual-by-nature-professional.zip',
  brand:        'casual-by-nature-brand.zip',
};

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
    // Verify the payment with Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      return { statusCode: 402, body: JSON.stringify({ error: 'Payment not completed' }) };
    }

    // Work out which tier was purchased from the product name
    const productName = session.line_items?.data?.[0]?.description || '';
    let tier = 'personal';
    if (productName.toLowerCase().includes('professional')) tier = 'professional';
    if (productName.toLowerCase().includes('brand')) tier = 'brand';

    // Retrieve line items if not already expanded
    let tierFromProduct = tier;
    try {
      const lineItems = await stripe.checkout.sessions.listLineItems(sessionId);
      const name = lineItems.data?.[0]?.description?.toLowerCase() || '';
      if (name.includes('professional')) tierFromProduct = 'professional';
      else if (name.includes('brand')) tierFromProduct = 'brand';
      else tierFromProduct = 'personal';
    } catch (e) {
      // fallback to tier already set
    }

    const file = TIER_FILES[tierFromProduct];

    // Generate a signed token: base64(file|expiry|hmac)
    const secret = process.env.DOWNLOAD_SECRET || 'fallback-secret-change-me';
    const expiry = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    const payload = `${file}|${expiry}`;
    const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const token = Buffer.from(`${payload}|${hmac}`).toString('base64url');

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        file,
        email: session.customer_details?.email || '',
        tier: tierFromProduct,
      }),
    };
  } catch (err) {
    console.error('get-download error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
