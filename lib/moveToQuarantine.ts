import {
    ILogger,
    IMessageBuilder,
    IRead,
} from "@rocket.chat/apps-engine/definition/accessors";

/**
 * Moves a message to the quarantine room identified by quarantineRoomId (see
 * resolveQuarantineRoomId). If no quarantine room is configured/resolved, or the room has
 * since been deleted, removes the specific attachment(s) at attachmentIndexes instead, so at
 * least the flagged image(s) don't get delivered.
 * @param read
 * @param builder
 * @param logger
 * @param quarantineRoomId
 * @param attachmentIndexes
 */
export async function moveToQuarantine(
    read: IRead,
    builder: IMessageBuilder,
    logger: ILogger,
    quarantineRoomId: string | undefined,
    attachmentIndexes: Array<number>,
): Promise<void> {
    if (!quarantineRoomId) {
        logger.warn(
            "No usable quarantine channel is configured; removing the flagged attachment(s) instead.",
        );
        removeAttachments(builder, attachmentIndexes);
        return;
    }

    const targetRoom = await read.getRoomReader().getById(quarantineRoomId);
    if (targetRoom) {
        // we have a target room - move it to this room
        // the original user uploading currently does not get notified
        builder.setRoom(targetRoom);
    } else {
        logger.error(
            `Configured quarantine room (id: ${quarantineRoomId}) could not be found, it may have been deleted. Removing the flagged attachment(s) instead.`,
        );
        removeAttachments(builder, attachmentIndexes);
    }
}

/**
 * Removes attachments by index from highest to lowest, so removing one doesn't shift the
 * position of ones not yet removed.
 * @param builder
 * @param attachmentIndexes
 */
function removeAttachments(
    builder: IMessageBuilder,
    attachmentIndexes: Array<number>,
): void {
    const descending = [...attachmentIndexes].sort((a, b) => b - a);
    for (const index of descending) {
        builder.removeAttachment(index);
    }
}
