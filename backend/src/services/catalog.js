import { fail } from './library.js';

// Open Library data is untrusted: accept the page count only if it is a sensible whole number.
function safePageCount(value) {
  return Number.isInteger(value) && value >= 1 && value <= 100000 ? value : null;
}

// Only user-entered catalog search terms leave the app; notes/tokens are never forwarded.
export function createCatalogService({ fetcher = fetch } = {}) {
  const cache = new Map();
  return {
    async search(query) {
      if (typeof query !== 'string' || query.trim().length < 2 || query.length > 120) {
        throw fail(400, 'Search must contain 2–120 characters');
      }
      const q = query.trim();
      const previous = cache.get(q);
      if (previous && previous.expires > Date.now()) return previous.results;
      const url = new URL('https://openlibrary.org/search.json');
      url.search = new URLSearchParams({ q, limit: '8', fields: 'key,title,author_name,number_of_pages_median' });
      try {
        const response = await fetcher(url, { signal: AbortSignal.timeout(6000), redirect: 'error',
          headers: { Accept: 'application/json', 'User-Agent': 'MarginReadingList/1.0' } });
        if (!response.ok) throw Object.assign(new Error('Catalog unavailable'), { upstreamStatus: response.status });
        const body = await response.json();
        if (!Array.isArray(body.docs)) throw new Error('Invalid catalog response');
        const results = body.docs.filter(b => typeof b.title === 'string' && typeof b.key === 'string'
          && /^(\/works\/)?OL\d+W$/.test(b.key)).slice(0, 8).map(b => ({
          title: b.title.slice(0, 200), author: (Array.isArray(b.author_name) ? b.author_name.filter(a => typeof a === 'string').join(', ') : '').slice(0, 200),
          sourceUrl: 'https://openlibrary.org/works/' + b.key.replace('/works/', ''),
          pages: safePageCount(b.number_of_pages_median)
        }));
        if (cache.size >= 100) cache.delete(cache.keys().next().value);
        cache.set(q, { results, expires: Date.now() + 300000 });
        return results;
      } catch (error) { console.warn('Catalog request failed', { name: error.name, upstreamStatus: error.upstreamStatus || null }); throw fail(502, 'Book catalog is unavailable. Please try again or enter book details manually.'); }
    }
  };
}
