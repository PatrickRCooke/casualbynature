const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const PRODUCTS = {
  personal: {
    name: 'Casual by Nature — Personal License',
    description: 'All 4 weights (TTF) · Personal use · Desktop & print · Unlimited personal projects',
    amount: 1900,
  },
  professional: {
    name: 'Casual by Nature — Professional License',
    description: 'All 4 weights (TTF) · Commercial use · Desktop, print & digital · Up to 5 seats · Web font (WOFF2)',
    amount: 4900,
  },
  brand: {
    name: 'Casual by Nature — Brand / Extended License',
    description: 'All 4 weights (TTF + WOFF2) · Unlimited commercial use · Unlimited seats · App & ebook · Social & broadcast',
    amount: 12900,
  },
};

exports.handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let tier;
  try {
    const body = JSON.parse(event.body);
    tier = body.tier;
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const product = PRODUCTS[tier];
  if (!product) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid license tier' }) };
  }

  const origin = 'https://extraordinary-marigold-f9fada.netlify.app';

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      ui_mode: 'embedded',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: product.name,
              description: product.description,
            },
            unit_amount: product.amount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      return_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}&tier=${tier}`,
      customer_creation: 'always',
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ clientSecret: session.client_secret }),
    };
  } catch (err) {
    console.error('Stripe error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
