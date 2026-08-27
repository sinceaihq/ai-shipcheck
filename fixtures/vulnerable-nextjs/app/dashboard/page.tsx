import { listInvoices } from '../../lib/db';

export default async function DashboardPage() {
  const invoices = await listInvoices();
  return (
    <section>
      <h1>Invoices</h1>
      <ul>
        {invoices.map((invoice) => (
          <li key={invoice.id}>{invoice.total}</li>
        ))}
      </ul>
    </section>
  );
}
