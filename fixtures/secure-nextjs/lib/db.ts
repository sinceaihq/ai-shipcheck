import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

const PAGE_SIZE = 50;

export async function listNotes(userId: string, cursor?: string) {
  return prisma.note.findMany({
    where: { userId },
    take: PAGE_SIZE,
    ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
    orderBy: { createdAt: 'desc' },
  });
}

export async function findNoteForUser(id: string, userId: string) {
  return prisma.note.findFirst({ where: { id, userId } });
}
