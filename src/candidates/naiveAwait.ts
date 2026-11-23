import { errorMessage, initialState } from '../types.ts';
import type { Candidate, SearchState } from '../types.ts';

// Typical first-draft output: render whatever response arrives.
export const naiveAwait: Candidate = {
  id: 'naive-await',
  description: 'Renders every response as soon as it arrives.',
  create(fetcher, onRender) {
    let state: SearchState = initialState;
    const set = (next: SearchState) => {
      state = next;
      onRender(state);
    };

    return {
      getState: () => state,
      search(query) {
        set({ query, status: 'loading', results: state.results, error: null });
        fetcher(query, new AbortController().signal).then(
          (results) => set({ query, status: 'success', results, error: null }),
          (err: unknown) => set({ query, status: 'error', results: [], error: errorMessage(err) }),
        );
      },
    };
  },
};
