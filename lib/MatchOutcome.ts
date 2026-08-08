import { IMatchResult } from './IMatchResult';

/**
 * Result of attempting to match a message against the PhotoDNA service.
 * `verified: false` means the API call did not produce a usable match determination
 * (missing credentials, no response, a malformed response, or a network error), not
 * that the image is confirmed clean, so it must not be treated as a non-match.
 */
export type MatchOutcome =
    | { verified: true; result: IMatchResult }
    | { verified: false; reason: string };
