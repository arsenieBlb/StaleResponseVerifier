// The kind of example-based tests usually written for a search box.
// Every candidate passes them, including the three with race conditions.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { candidates } from '../src/candidates/index.ts';
import type { SearchFetcher } from '../src/types.ts';

function manualFetcher() {
  const pending = new Map<string, { resolve: (r: string[]) => void; reject: (e: unknown) => void }>();
  const fetcher: SearchFetcher = (query) =>
    new Promise((resolve, reject) => {
      pending.set(query, { resolve, reject });
    });
  const settle = async (query: string, outcome: string[] | Error) => {
    const p = pending.get(query)!;
    if (outcome instanceof Error) p.reject(outcome);
    else p.resolve(outcome);
    await new Promise((r) => setImmediate(r));
  };
  return { fetcher, settle };
}

for (const candidate of candidates) {
  describe(`hand-written examples: ${candidate.id}`, () => {
    test('shows results for a single query', async () => {
      const { fetcher, settle } = manualFetcher();
      const ui = candidate.create(fetcher, () => {});
      ui.search('cat');
      assert.equal(ui.getState().status, 'loading');
      await settle('cat', ['cat:1']);
      assert.deepEqual(ui.getState(), { query: 'cat', status: 'success', results: ['cat:1'], error: null });
    });

    test('shows an error for a failed query', async () => {
      const { fetcher, settle } = manualFetcher();
      const ui = candidate.create(fetcher, () => {});
      ui.search('cat');
      await settle('cat', new Error('boom'));
      assert.equal(ui.getState().status, 'error');
      assert.equal(ui.getState().error, 'boom');
    });

    test('keeps up with typing when each response arrives before the next keystroke', async () => {
      const { fetcher, settle } = manualFetcher();
      const ui = candidate.create(fetcher, () => {});
      for (const q of ['c', 'ca', 'cat']) {
        ui.search(q);
        await settle(q, [`${q}:1`]);
      }
      assert.deepEqual(ui.getState().results, ['cat:1']);
    });

    test('shows the latest results when overlapping responses arrive in order', async () => {
      const { fetcher, settle } = manualFetcher();
      const ui = candidate.create(fetcher, () => {});
      ui.search('cat');
      ui.search('cats');
      await settle('cat', ['cat:1']);
      await settle('cats', ['cats:1']);
      assert.equal(ui.getState().query, 'cats');
      assert.deepEqual(ui.getState().results, ['cats:1']);
    });

    test('recovers when a retry succeeds after a failure', async () => {
      const { fetcher, settle } = manualFetcher();
      const ui = candidate.create(fetcher, () => {});
      ui.search('cat');
      await settle('cat', new Error('503'));
      ui.search('cats');
      await settle('cats', ['cats:1']);
      assert.equal(ui.getState().status, 'success');
      assert.deepEqual(ui.getState().results, ['cats:1']);
    });
  });
}
