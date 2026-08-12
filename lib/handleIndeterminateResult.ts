import {
    ILogger,
    IMessageBuilder,
    IRead,
} from "@rocket.chat/apps-engine/definition/accessors";
import {IMessage} from "@rocket.chat/apps-engine/definition/messages";
import {moveToQuarantine} from "./moveToQuarantine";

/**
 * Routes a message for manual review when PhotoDNA could not produce a usable match
 * determination for it, rather than letting it pass through as if it were a confirmed
 * non-match. Does not file an NCMEC report, since the image is not a confirmed match.
 */
export async function handleIndeterminateResult(
    reason: string,
    attachmentIndexes: Array<number>,
    message: IMessage,
    read: IRead,
    builder: IMessageBuilder,
    logger: ILogger,
    quarantineRoomId: string | undefined,
): Promise<void> {
    logger.error(
        "PHOTODNA-VERIFICATION-FAILED",
        `message ID: ${message.id}`,
        message.sender,
        reason,
    );

    const notice = `PhotoDNA verification failed (${reason}). Routed for manual review, not a confirmed match.`;
    builder.setText(`${notice}\n\n${builder.getText()}`);

    await moveToQuarantine(
        read,
        builder,
        logger,
        quarantineRoomId,
        attachmentIndexes,
    );
}
