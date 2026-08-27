import Stripe from 'stripe';
import { logger } from '../../../../lib/logger';
import { prisma } from '../../../../lib/db';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '');

export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature');
  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      payload,
      signature ?? '',
      process.env.STRIPE_WEBHOOK_SECRET ?? '',
    );
  } catch (error) {
    logger.warn({ err: error }, 'rejected stripe webhook with invalid signature');
    return new Response('invalid signature', { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    await prisma.subscription.updateMany({
      where: { checkoutSessionId: session.id },
      data: { status: 'active' },
    });
  }

  return Response.json({ received: true });
}
