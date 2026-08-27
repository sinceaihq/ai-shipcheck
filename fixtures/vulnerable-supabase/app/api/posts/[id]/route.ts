import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response('unauthorized', { status: 401 });
  }

  const { id } = await params;
  const { data } = await supabase.from('posts').select('*').eq('id', id).single();

  return Response.json(data);
}
