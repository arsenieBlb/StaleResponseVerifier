import { errorMessage, initialState, isAbortError } from '../types.ts';
import type { Candidate, SearchState } from '../types.ts';

// Correct only if the transport actually rejects when the signal is aborted.
export const abortPrevious: Candidate = {
  id: 'abort-previous',
  description: 'Aborts the previous request and trusts the fetcher to reject it.',
  create(fetcher, onRender) {
    let state: SearchState = initialState;
    let inFlight: AbortController | null = null;
    const set = (next: SearchState) => {
      state = next;
      onRender(state);
    };

    return {
      getState: () => state,
      search(query) {
        inFlight?.abort();
        const controller = new AbortController();
        inFlight = controller;
        set({ query, status: 'loading', results: state.results, error: null });
        fetcher(query, controller.signal).then(
          (results) => set({ query, status: 'success', results, error: null }),
          (err: unknown) => {
            if (isAbortError(err)) return;
            set({ query, status: 'error', results: [], error: errorMessage(err) });
          },
        );
      },
    };
  },
};
