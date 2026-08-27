'use client';

import { useState } from 'react';
import _ from 'lodash';

export default function HomePage() {
  const [open, setOpen] = useState(false);
  const bio = '<b>hello</b>';

  return (
    <main>
      <img src="/hero.png" />

      <div onClick={() => setOpen(!open)}>Toggle the panel</div>

      <form action="/api/users" method="post">
        <input type="email" placeholder="Email address" name="email" />
        <textarea name="notes" placeholder="Notes" />
      </form>

      <a href="#" onClick={() => setOpen(false)}>
        Dismiss
      </a>

      <span tabIndex={3}>Focus me first</span>

      <button className="icon-button">
        <svg viewBox="0 0 16 16" />
      </button>

      <div dangerouslySetInnerHTML={{ __html: bio }} />

      <p>{_.capitalize('rendered with lodash')}</p>
    </main>
  );
}
