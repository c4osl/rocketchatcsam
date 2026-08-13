import {
    IHttp,
    ILogger,
    IMessageBuilder,
    IRead,
} from "@rocket.chat/apps-engine/definition/accessors";
import {IMessage} from "@rocket.chat/apps-engine/definition/messages";
import {IMatchResult} from "./IMatchResult";
import {moveToQuarantine} from "./moveToQuarantine";
import {PhotoDNACloudService} from "./PhotoDNACloudService";

/**
 * Quarantines a message that matched the PhotoDNA service, and files a single NCMEC
 * report covering every matched attachment, if enabled.
 */
export async function handleMatchingMessage(
    matchResults: Array<IMatchResult>,
    matchedAttachmentIndexes: Array<number>,
    message: IMessage,
    read: IRead,
    builder: IMessageBuilder,
    http: IHttp,
    logger: ILogger,
    quarantineRoomId: string | undefined,
    enableAutomatedReport: boolean,
    photoDnaService: PhotoDNACloudService,
): Promise<void> {
    for (const matchResult of matchResults) {
        const matchResultForLog: Record<string, unknown> = {...matchResult};
        delete matchResultForLog["ImageData"];
        logger.warn(
            "PHOTODNA-MATCH",
            `enable automated report: ${enableAutomatedReport}`,
            `message ID: ${message.id}`,
            message.sender,
            JSON.stringify(matchResultForLog),
        );
    }

    await moveToQuarantine(
        read,
        builder,
        logger,
        quarantineRoomId,
        matchedAttachmentIndexes,
    );

    if (enableAutomatedReport) {
        await photoDnaService.performReportOperation(
            matchResults,
            http,
            message,
            read,
            logger,
        );
    }
}
