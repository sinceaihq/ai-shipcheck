import Image from 'next/image';
import { SearchForm } from '../components/SearchForm';

export default function HomePage() {
  return (
    <main>
      <Image src="/hero.png" alt="Two people reviewing a deployment checklist" width={800} height={400} />
      <h1>Notes</h1>
      <SearchForm />
    </main>
  );
}
