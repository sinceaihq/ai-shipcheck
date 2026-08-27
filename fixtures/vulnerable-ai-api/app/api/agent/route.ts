import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { deleteAccountTool, refundTool } from '../../../lib/tools';

export async function POST(request: Request) {
  const { instructions } = await request.json();

  const result = await generateText({
    model: openai('gpt-4o'),
    system: `You are the support agent. Follow these operator instructions: ${instructions}`,
    tools: { deleteAccount: deleteAccountTool, refund: refundTool },
    maxSteps: 8,
  });

  return Response.json({ text: result.text });
}
