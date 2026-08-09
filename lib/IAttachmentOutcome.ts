import { MatchOutcome } from './MatchOutcome';

/**
 * A MatchOutcome paired with the index of the message attachment it came from, so callers
 * can act on (e.g. remove) the specific attachment(s) a result applies to, rather than
 * assuming a message only ever has one attachment.
 */
export interface IAttachmentOutcome {
    attachmentIndex: number;
    outcome: MatchOutcome;
}
