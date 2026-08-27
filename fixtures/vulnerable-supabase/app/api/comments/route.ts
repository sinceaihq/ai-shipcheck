import { admin } from '../../../lib/supabase-admin';

export async function GET() {
  const { data } = await admin.from('comments').select('*');
  return Response.json(data);
}
