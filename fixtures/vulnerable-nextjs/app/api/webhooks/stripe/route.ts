import { prisma } from '../../../../lib/db';

export async function POST(request: Request) {
  const event = await request.json();

  if (event.type === 'checkout.session.completed') {
    await prisma.subscription.update({
      where: { id: event.data.object.client_reference_id },
      data: { status: 'active' },
    });
  }

  return Response.json({ received: true });
}
