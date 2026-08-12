import {ILogger, IRead} from "@rocket.chat/apps-engine/definition/accessors";

/**
 * Resolves the configured quarantine channel name to a stable room ID, once, so quarantining
 * doesn't silently break if the channel is later renamed. Room IDs are permanent, room names
 * are not.
 * @param quarantineChannel
 * @param read
 * @param logger
 */
export async function resolveQuarantineRoomId(
    quarantineChannel: string,
    read: IRead,
    logger: ILogger,
): Promise<string | undefined> {
    if (!quarantineChannel) {
        return undefined;
    }

    const room = await read
        .getRoomReader()
        .getByName(quarantineChannel.toLowerCase());
    if (!room) {
        logger.error(
            `Configured quarantine channel "${quarantineChannel}" does not exist. Quarantining is completely disabled until this is fixed.`,
        );
        return undefined;
    }
    return room.id;
}
