import { errorMessage, initialState } from '../types.ts';
import type { Candidate, SearchState } from '../types.ts';

export const latestWins: Candidate = {
  id: 'latest-wins',
  description: 'Aborts the previous request and ignores every settlement that is not from the latest request.',
  create(fetcher, onRender) {
    let state: SearchState = initialState;
    let latest = 0;
    let inFlight: AbortController | null = null;
    const set = (next: SearchState) => {
      state = next;
      onRender(state);
    };

    return {
      getState: () => state,
      search(query) {
        const id = ++latest;
        inFlight?.abort();
        const controller = new AbortController();
        inFlight = controller;
        set({ query, status: 'loading', results: state.results, error: null });
        fetcher(query, controller.signal).then(
          (results) => {
            if (id !== latest) return;
            set({ query, status: 'success', results, error: null });
          },
          (err: unknown) => {
            if (id !== latest) return;
            set({ query, status: 'error', results: [], error: errorMessage(err) });
          },
        );
      },
    };
  },
};
