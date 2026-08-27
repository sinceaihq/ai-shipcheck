import { client } from '../../../lib/openai';

export async function POST(request: Request) {
  const body = await request.json();

  const completion = await client.chat.completions.create({
    model: body.model,
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: body.prompt },
    ],
  });

  return Response.json({ text: completion.choices[0]?.message.content });
}
