import { randomUUID } from 'node:crypto';
import { statistics } from '../domain.js';
import { fail } from './library.js';

export function createInsightsService(store, library) {
  return {
    async stats(owner) { return statistics(await library.list(owner)); },
    async enableSharing(owner) {
      const existing = await store.get(owner, 'SETTINGS');
      const token = existing?.token || randomUUID();
      await store.put({ pk: 'SHARE', sk: token, owner });
      await store.put({ pk: owner, sk: 'SETTINGS', token });
      return { token };
    },
    async disableSharing(owner) {
      const settings = await store.get(owner, 'SETTINGS');
      if (settings?.token) await store.remove('SHARE', settings.token);
      await store.remove(owner, 'SETTINGS');
    },
    async publicList(token) {
      const share = await store.get('SHARE', token);
      if (!share) throw fail(404, 'List not found');
      // Check both sides: partial writes/revocations must never leave an active public link.
      const settings = await store.get(share.owner, 'SETTINGS');
      if (settings?.token !== token) throw fail(404, 'List not found');
      const { nextUp } = await this.stats(share.owner);
      return { title: 'Next up', books: nextUp.map(({ title, author, genre, status }) => ({ title, author, genre, status })) };
    }
  };
}
