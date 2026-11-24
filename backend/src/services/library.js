import { randomUUID } from 'node:crypto';
import { bookSchema } from '../domain.js';
export const fail = (status, message) => Object.assign(new Error(message), { status });
export const publicItem = ({ pk, sk, ...item }) => item;

export function createLibraryService(store) {
  return {
    async list(owner) {
      return (await store.list(owner)).filter(item => item.sk.startsWith('BOOK#')).map(publicItem);
    },
    async requireBook(owner, id) {
      const book = await store.get(owner, 'BOOK#' + id);
      // Identical response for unknown and foreign IDs avoids disclosing their existence.
      if (!book) throw fail(404, 'Book not found');
      return book;
    },
    async save(owner, input, id = null) {
      const old = id ? await this.requireBook(owner, id) : null;
      const book = bookSchema.parse(input);
      if (!old && book.coverKey) throw fail(400, 'Upload a cover after creating the book');
      if (old && book.coverKey && !book.coverKey.startsWith(`covers/${owner.slice(5)}/${id}/`)) {
        throw fail(403, 'You cannot attach another book’s cover');
      }
      // Starting or finishing a book consumes its shortlist slot.
      if (['reading', 'finished'].includes(book.status)) book.nextUp = false;
      id ||= randomUUID();
      return publicItem(await store.put({ ...old, ...book, id, pk: owner, sk: 'BOOK#' + id,
        createdAt: old?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() }));
    },
    async remove(owner, id) {
      await this.requireBook(owner, id);
      await store.remove(owner, 'BOOK#' + id);
      for (const entry of await store.list(owner + '#BOOK#' + id)) await store.remove(entry.pk, entry.sk);
    }
  };
}
