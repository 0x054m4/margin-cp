import { randomUUID } from 'node:crypto';
import { entrySchema, progressSchema } from '../domain.js';
import { fail, publicItem } from './library.js';

// Reading progress is stored with the book's journal entries, so deleting a book
// also deletes its progress (library.remove clears every item under this key).
const PROGRESS = 'PROGRESS';

export function createJournalService(store, library) {
  const journalKey = (owner, bookId) => `${owner}#BOOK#${bookId}`;

  return {
    async list(owner, bookId) {
      await library.requireBook(owner, bookId);
      const items = await store.list(journalKey(owner, bookId));
      return items.filter(item => item.sk !== PROGRESS).map(publicItem);
    },

    async add(owner, bookId, input) {
      const book = await library.requireBook(owner, bookId);
      const entry = entrySchema.parse(input);
      // Planning notes are useful before reading; captured passages require a started book.
      if (entry.kind === 'highlight' && book.status === 'to-read') {
        throw fail(409, 'Start reading this book before saving highlights. Planning notes are available now.');
      }
      // A highlight cannot point to a page the book does not have.
      const progress = await store.get(journalKey(owner, bookId), PROGRESS);
      if (entry.page !== null && progress && entry.page > progress.pageCount) {
        throw fail(400, `This book has only ${progress.pageCount} pages`);
      }
      const id = randomUUID();
      return publicItem(await store.put({ ...entry, id, pk: journalKey(owner, bookId), sk: id,
        createdAt: new Date().toISOString() }));
    },

    async remove(owner, bookId, entryId) {
      await library.requireBook(owner, bookId);
      const pk = journalKey(owner, bookId);
      if (entryId === PROGRESS || !await store.get(pk, entryId)) throw fail(404, 'Entry not found');
      await store.remove(pk, entryId);
    },

    async getProgress(owner, bookId) {
      const book = await library.requireBook(owner, bookId);
      const progress = await store.get(journalKey(owner, bookId), PROGRESS);
      // A finished book is always 100% read, even if it was marked finished by editing the book.
      if (book.status === 'finished') {
        const pageCount = progress?.pageCount ?? null;
        return { pageCount, currentPage: pageCount ?? 0, percentage: 100, updatedAt: progress?.updatedAt ?? null };
      }
      if (!progress) return { pageCount: null, currentPage: 0, percentage: 0, updatedAt: null };
      const { pk, sk, ...result } = progress;
      return result;
    },

    async updateProgress(owner, bookId, input) {
      const book = await library.requireBook(owner, bookId);
      const { pageCount, currentPage } = progressSchema.parse(input);

      // Rule 1: progress is only tracked for books the reader has started.
      if (book.status === 'to-read') {
        throw fail(409, 'Set the book to Reading before recording progress');
      }
      // Rule 1b: a finished book keeps 100%; it must be re-opened (status Reading) to change progress.
      if (book.status === 'finished') {
        throw fail(409, 'This book is finished. Set it back to Reading to change its progress');
      }

      // Rule 2: the server calculates the percentage; the client cannot send it.
      const percentage = Math.round((currentPage / pageCount) * 100);
      const progress = await store.put({ pk: journalKey(owner, bookId), sk: PROGRESS,
        pageCount, currentPage, percentage, updatedAt: new Date().toISOString() });

      // Rule 3: reaching the last page finishes the book (uses the Library service rules).
      let bookStatus = book.status;
      if (currentPage === pageCount && book.status !== 'finished') {
        const { pk, sk, id, createdAt, updatedAt, ...fields } = book;
        const today = new Date().toISOString().slice(0, 10);
        const finished = await library.save(owner, { ...fields, status: 'finished', finishedAt: today }, bookId);
        bookStatus = finished.status;
      }

      const { pk, sk, ...result } = progress;
      return { ...result, bookStatus };
    }
  };
}
