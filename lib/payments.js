// Razorpay (best for Indian users: UPI, cards, netbanking). No SDK needed.
// Without keys in .env the app runs in DEMO mode: payments are simulated so you can test the flow.
const crypto = require('crypto');

const KEY_ID = process.env.RAZORPAY_KEY_ID;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const enabled = Boolean(KEY_ID && KEY_SECRET);

async function createOrder(amountInr, receipt) {
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Basic ' + Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64'),
    },
    body: JSON.stringify({ amount: amountInr * 100, currency: 'INR', receipt }), // amount in paise
  });
  if (!res.ok) throw new Error(`Razorpay error: ${await res.text()}`);
  return res.json();
}

function verifySignature(orderId, paymentId, signature) {
  const expected = crypto.createHmac('sha256', KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
  return signature && expected.length === signature.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

module.exports = { enabled, keyId: KEY_ID, createOrder, verifySignature };
