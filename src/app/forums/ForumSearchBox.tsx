/** Search box for the forums (used on the forums home and the search page). */
export function ForumSearchBox({ q = "" }: { q?: string }) {
  return (
    <form action="/forums/search" role="search" className="mb-6 flex max-w-xl gap-2">
      <label htmlFor="forum-q" className="sr-only">
        Search the forums
      </label>
      <input id="forum-q" name="q" defaultValue={q} placeholder="Search threads and posts…" className="input" />
      <button className="btn-primary">Search</button>
    </form>
  );
}
