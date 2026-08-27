'use client';

export function Checkout({ amount }: { amount: number }) {
  const stripeKey = process.env.NEXT_PUBLIC_STRIPE_SECRET_KEY;

  async function pay() {
    await fetch('https://api.stripe.com/v1/charges', {
      method: 'POST',
      headers: { Authorization: `Bearer ${stripeKey}` },
      body: new URLSearchParams({ amount: String(amount) }),
    });
  }

  return <button onClick={pay}>Pay {amount}</button>;
}
