import {ILogger, IRead} from "@rocket.chat/apps-engine/definition/accessors";

/**
 * Resolves the configured comma-separated list of room names into the set of room IDs to watch.
 * Returns undefined when no room names are configured, meaning every room should be watched.
 * @param limitRoomNamesCsv
 * @param read
 * @param logger
 */
export async function resolveWatchedRoomIds(
    limitRoomNamesCsv: string,
    read: IRead,
    logger: ILogger,
): Promise<Set<string> | undefined> {
    if (!limitRoomNamesCsv || limitRoomNamesCsv.length === 0) {
        return undefined;
    }

    const watchedRoomsId = new Set<string>();
    const roomNames = limitRoomNamesCsv.trim().split(",");
    for (const roomName of roomNames) {
        const room = await read
            .getRoomReader()
            .getByName(roomName.toLowerCase());
        if (room) {
            logger.debug(`Watching room '${roomName}'`);
            watchedRoomsId.add(room.id);
        } else {
            logger.warn(
                `Room not found for name '${roomName}'. Not adding to watch list.`,
            );
        }
    }
    return watchedRoomsId;
}
