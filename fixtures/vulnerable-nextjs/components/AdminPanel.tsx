'use client';

type User = { role: string; email: string };

export function AdminPanel({ user }: { user: User }) {
  if (user.role !== 'admin') {
    return null;
  }

  return (
    <div>
      <h2>Admin tools</h2>
      <button onClick={() => fetch('/api/users', { method: 'DELETE' })}>Delete all users</button>
    </div>
  );
}
