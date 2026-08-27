import { requireUser } from '../../lib/auth';
import { listNotes } from '../../lib/db';

export default async function DashboardPage() {
  const user = await requireUser();
  if (user === null) {
    return <p>Please sign in to view your notes.</p>;
  }

  const notes = await listNotes(user.id);

  return (
    <section>
      <h1>Your notes</h1>
      <ul>
        {notes.map((note) => (
          <li key={note.id}>{note.title}</li>
        ))}
      </ul>
    </section>
  );
}
