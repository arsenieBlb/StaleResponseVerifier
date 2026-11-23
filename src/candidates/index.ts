import { abortPrevious } from './abortPrevious.ts';
import { guardSuccessOnly } from './guardSuccessOnly.ts';
import { latestWins } from './latestWins.ts';
import { naiveAwait } from './naiveAwait.ts';
import type { Candidate } from '../types.ts';

export const candidates: readonly Candidate[] = [naiveAwait, abortPrevious, guardSuccessOnly, latestWins];
