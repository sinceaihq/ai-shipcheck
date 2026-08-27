'use client';

import OpenAI from 'openai';
import { useState } from 'react';

const browserClient = new OpenAI({
  apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true,
});

export function InlineAssistant() {
  const [answer, setAnswer] = useState('');

  async function ask(question: string) {
    const completion = await browserClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: question }],
    });
    setAnswer(completion.choices[0]?.message.content ?? '');
  }

  return (
    <div>
      <button onClick={() => ask('hello')}>Ask</button>
      <p>{answer}</p>
    </div>
  );
}
