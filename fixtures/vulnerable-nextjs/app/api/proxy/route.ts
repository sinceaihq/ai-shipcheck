export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const host = searchParams.get('host');

  for (let attempt = 0; attempt < 5; attempt++) {
    const upstream = await fetch(`https://${host}/v1/status`);
    if (upstream.ok) {
      return Response.json(await upstream.json());
    }
  }

  try {
    return Response.json({ error: 'upstream unavailable' }, { status: 502 });
  } catch (error) {
    return new Response('failed', { status: 500 });
  }
}
