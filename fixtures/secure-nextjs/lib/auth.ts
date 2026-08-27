import { getServerSession } from 'next-auth';

export async function requireUser() {
  const session = await getServerSession();
  if (session?.user?.email === undefined) {
    return null;
  }
  return { id: session.user.email };
}
