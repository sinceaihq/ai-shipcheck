import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  datasources: {
    db: { url: 'postgresql://appuser:Hx9Kd2NbTgH5sYcJf8Ae@db.production.internal:5432/appdb' },
  },
});

export async function listInvoices() {
  return prisma.invoice.findMany();
}

export async function invoiceTotals(customerIds: string[]) {
  const totals = [];
  for (const customerId of customerIds) {
    const invoices = await prisma.invoice.findMany({ where: { customerId }, take: 50 });
    totals.push(invoices.length);
  }
  return totals;
}

export async function searchUsers(term: string) {
  return prisma.$queryRawUnsafe(`SELECT * FROM users WHERE name LIKE '%${term}%'`);
}
