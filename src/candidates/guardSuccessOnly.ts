import { errorMessage, initialState } from '../types.ts';
import type { Candidate, SearchState } from '../types.ts';

// Looks fixed: stale successes are dropped, but stale failures still render.
export const guardSuccessOnly: Candidate = {
  id: 'guard-success-only',
  description: 'Drops stale successes with a request token but not stale failures.',
  create(fetcher, onRender) {
    let state: SearchState = initialState;
    let latest = 0;
    const set = (next: SearchState) => {
      state = next;
      onRender(state);
    };

    return {
      getState: () => state,
      search(query) {
        const id = ++latest;
        set({ query, status: 'loading', results: state.results, error: null });
        fetcher(query, new AbortController().signal).then(
          (results) => {
            if (id !== latest) return;
            set({ query, status: 'success', results, error: null });
          },
          (err: unknown) => set({ query, status: 'error', results: [], error: errorMessage(err) }),
        );
      },
    };
  },
};
