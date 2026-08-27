import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

export async function GET() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response('unauthorized', { status: 401 });
  }

  const { data } = await supabase.from('posts').select('*');
  return Response.json(data);
}

export async function DELETE() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response('unauthorized', { status: 401 });
  }

  await supabase.from('posts').delete();
  return new Response(null, { status: 204 });
}
