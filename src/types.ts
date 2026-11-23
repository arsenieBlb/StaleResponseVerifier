export type Status = 'idle' | 'loading' | 'success' | 'error';

export interface SearchState {
  readonly query: string;
  readonly status: Status;
  readonly results: readonly string[];
  readonly error: string | null;
}

export type SearchFetcher = (query: string, signal: AbortSignal) => Promise<string[]>;

export interface SearchController {
  search(query: string): void;
  getState(): SearchState;
}

export type ControllerFactory = (
  fetcher: SearchFetcher,
  onRender: (state: SearchState) => void,
) => SearchController;

export interface Candidate {
  readonly id: string;
  readonly description: string;
  readonly create: ControllerFactory;
}

export const initialState: SearchState = { query: '', status: 'idle', results: [], error: null };

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function isAbortError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError';
}
