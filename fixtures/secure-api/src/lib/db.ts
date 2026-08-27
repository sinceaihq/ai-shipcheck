import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq } from 'drizzle-orm';
import postgres from 'postgres';
import { notes } from './schema.js';

const connectionString = process.env.DATABASE_URL;
if (connectionString === undefined) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
}

export const db = drizzle(postgres(connectionString));

const PAGE_SIZE = 50;

export async function listNotes(userId: string) {
  return db.select().from(notes).where(eq(notes.userId, userId)).limit(PAGE_SIZE);
}

export async function findNote(id: string, userId: string) {
  return db
    .select()
    .from(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))
    .limit(1);
}
