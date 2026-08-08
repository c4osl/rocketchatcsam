import { ILogger, IMessageBuilder, IRead } from '@rocket.chat/apps-engine/definition/accessors';

/**
 * Moves a message to the quarantine room identified by quarantineRoomId (see
 * resolveQuarantineRoomId). If no quarantine room is configured/resolved, or the room has
 * since been deleted, removes the image attachment instead so at least the flagged image
 * doesn't get delivered.
 * @param read
 * @param builder
 * @param logger
 * @param quarantineRoomId
 */
export async function moveToQuarantine(read: IRead, builder: IMessageBuilder, logger: ILogger, quarantineRoomId: string | undefined): Promise<void> {
    if (!quarantineRoomId) {
        logger.warn('No usable quarantine channel is configured; removing the flagged attachment instead.');
        builder.removeAttachment(0);
        return;
    }

    const targetRoom = await read.getRoomReader().getById(quarantineRoomId);
    if (targetRoom) {
        // we have a target room - move it to this room
        // the original user uploading currently does not get notified
        builder.setRoom(targetRoom);
    } else {
        logger.error(
            `Configured quarantine room (id: ${quarantineRoomId}) could not be found, it may have been deleted. Removing the flagged attachment instead.`,
        );
        builder.removeAttachment(0);
    }
}
