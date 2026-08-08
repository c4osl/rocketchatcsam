import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { IHttp, ILogger, IMessageBuilder, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import type { IMessage } from '@rocket.chat/apps-engine/definition/messages';
import { handleMatchingMessage } from '../../lib/handleMatchingMessage';
import { IMatchResult } from '../../lib/IMatchResult';
import { PhotoDNACloudService } from '../../lib/PhotoDNACloudService';

function makeLogger(): { logger: ILogger; warnCalls: Array<Array<unknown>> } {
    const warnCalls: Array<Array<unknown>> = [];
    const logger = {
        warn: (...args: Array<unknown>) => { warnCalls.push(args); },
    } as unknown as ILogger;
    return { logger, warnCalls };
}

function makeRead(): IRead {
    return {
        getRoomReader: () => ({
            getByName: async (_name: string) => undefined,
        }),
    } as unknown as IRead;
}

function makeBuilder(): IMessageBuilder {
    return {
        removeAttachment: () => undefined,
        setRoom: () => undefined,
    } as unknown as IMessageBuilder;
}

function makeMessage(): IMessage {
    return {
        id: 'message-id',
        sender: { username: 'testuser' },
    } as unknown as IMessage;
}

test('does not serialize matched image bytes into the log line', async () => {
    const { logger, warnCalls } = makeLogger();
    const imageMarker = 'unmistakable-image-bytes-marker';
    const matchResult = {
        Status: { Code: 3000, Description: 'OK' },
        TrackingId: 'test-tracking-id',
        IsMatch: true,
        ImageData: {
            contentType: 'image/jpeg',
            filename: 'img.jpg',
            data: Buffer.from(imageMarker),
        },
    } as unknown as IMatchResult;

    await handleMatchingMessage(
        matchResult,
        makeMessage(),
        makeRead(),
        {} as IPersistence,
        makeBuilder(),
        {} as IHttp,
        logger,
        '',
        false,
        new PhotoDNACloudService(),
    );

    const serializedCalls = JSON.stringify(warnCalls);
    assert.ok(!serializedCalls.includes(imageMarker));
    assert.ok(!serializedCalls.includes(Buffer.from(imageMarker).toString('base64')));
});
