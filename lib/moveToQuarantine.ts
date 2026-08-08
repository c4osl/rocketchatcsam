import { ILogger, IMessageBuilder, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms/IRoom';

/**
 * Moves a message to the configured quarantine channel. If no quarantine channel is
 * configured, or the configured channel can't be found, removes the image attachment
 * instead so at least the flagged image doesn't get delivered.
 * @param read
 * @param builder
 * @param logger
 * @param quarantineChannel
 */
export async function moveToQuarantine(read: IRead, builder: IMessageBuilder, logger: ILogger, quarantineChannel: string): Promise<void> {
    if (quarantineChannel) {
        const targetRoom: IRoom | undefined = await read.getRoomReader().getByName(quarantineChannel);
        if (targetRoom) {
            // we have a target room - move it to this room
            // the original user uploading currently does not get notified
            builder.setRoom(targetRoom);
        } else {
            logger.warn('Defined target Room/Channel does not exist: ' + quarantineChannel);
            // we have no target room - at least remove the image
            builder.removeAttachment(0);
        }
    } else {
        logger.warn('No target channel for quarantined messages provided');
    }
}
