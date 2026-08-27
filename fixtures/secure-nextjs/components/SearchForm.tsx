'use client';

import { useState } from 'react';

export function SearchForm() {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setOpen(true);
      }}
    >
      <label htmlFor="search-term">Search notes</label>
      <input
        id="search-term"
        name="term"
        type="search"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
      />
      <button type="submit">Search</button>
      <button type="button" aria-label="Clear search" onClick={() => setTerm('')}>
        <svg aria-hidden="true" viewBox="0 0 16 16" />
      </button>
      {open ? <p>Searching for {term}</p> : null}
    </form>
  );
}
