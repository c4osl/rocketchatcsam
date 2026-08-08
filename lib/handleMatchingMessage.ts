import { IHttp, ILogger, IMessageBuilder, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IMessage } from '@rocket.chat/apps-engine/definition/messages';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms/IRoom';
import { IMatchResult } from './IMatchResult';
import { PhotoDNACloudService } from './PhotoDNACloudService';

/**
 * Quarantines a message that matched the PhotoDNA service, and files an NCMEC report if enabled.
 * @param matchResult
 * @param message
 * @param read
 * @param persistence
 * @param builder
 * @param http
 * @param logger
 * @param quarantineChannel
 * @param enableAutomatedReport
 * @param photoDnaService
 */
export async function handleMatchingMessage(
    matchResult: IMatchResult,
    message: IMessage,
    read: IRead,
    persistence: IPersistence,
    builder: IMessageBuilder,
    http: IHttp,
    logger: ILogger,
    quarantineChannel: string,
    enableAutomatedReport: boolean,
    photoDnaService: PhotoDNACloudService,
): Promise<void> {
    const matchResultForLog: Record<string, unknown> = { ...matchResult };
    delete matchResultForLog['ImageData'];
    logger.warn(
        'CSEM-MATCH',
        `enable automated report: ${enableAutomatedReport}`,
        `message ID: ${message.id}`,
        message.sender,
        JSON.stringify(matchResultForLog),
    );

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

    if (enableAutomatedReport) {
        const result = await photoDnaService.performReportOperation(matchResult, http, message, read);
        logger.warn('Violation-Report-Result', result);
    }
}
