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

function makeMatchResult(filename: string, imageMarker: string): IMatchResult {
    return {
        Status: { Code: 3000, Description: 'OK' },
        TrackingId: 'test-tracking-id',
        IsMatch: true,
        ImageData: {
            contentType: 'image/jpeg',
            filename,
            data: Buffer.from(imageMarker),
        },
    } as unknown as IMatchResult;
}

test('does not serialize matched image bytes into the log line', async () => {
    const { logger, warnCalls } = makeLogger();
    const imageMarker = 'unmistakable-image-bytes-marker';

    await handleMatchingMessage(
        [makeMatchResult('img.jpg', imageMarker)],
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

test('logs every matched attachment when a message has more than one', async () => {
    const { logger, warnCalls } = makeLogger();

    await handleMatchingMessage(
        [makeMatchResult('first.jpg', 'first-marker'), makeMatchResult('second.jpg', 'second-marker')],
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

    const matchLogs = warnCalls.filter((call) => call[0] === 'CSEM-MATCH');
    assert.equal(matchLogs.length, 2);
});

test('files a single report covering every matched attachment when automated reporting is enabled', async () => {
    const { logger } = makeLogger();
    const service = new PhotoDNACloudService();
    let reportCallCount = 0;
    let reportedMatchResults: Array<IMatchResult> | undefined;
    service.performReportOperation = async (matchResults: Array<IMatchResult>) => {
        reportCallCount += 1;
        reportedMatchResults = matchResults;
    };

    await handleMatchingMessage(
        [makeMatchResult('first.jpg', 'first-marker'), makeMatchResult('second.jpg', 'second-marker')],
        makeMessage(),
        makeRead(),
        {} as IPersistence,
        makeBuilder(),
        {} as IHttp,
        logger,
        '',
        true,
        service,
    );

    assert.equal(reportCallCount, 1, 'expected a single combined report, not one per matched attachment');
    assert.equal(reportedMatchResults?.length, 2);
});
