import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { IHttp, IRead, ILogger } from '@rocket.chat/apps-engine/definition/accessors';
import type { IMessage } from '@rocket.chat/apps-engine/definition/messages';
import { PhotoDNACloudService } from '../../lib/PhotoDNACloudService';

function makeLogger(): ILogger {
    return {
        debug: () => undefined,
        warn: () => undefined,
    } as unknown as ILogger;
}

function makeMessage(attachments: Array<Record<string, unknown>> | Record<string, unknown> | undefined): IMessage {
    const list = attachments === undefined ? undefined : Array.isArray(attachments) ? attachments : [attachments];
    return {
        id: 'message-id',
        room: { id: 'room-id' },
        sender: { name: 'Test User', username: 'testuser' },
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        attachments: list,
    } as unknown as IMessage;
}

test('isSupportedImageMimeType accepts the documented PhotoDNA mime types', () => {
    const service = new PhotoDNACloudService();
    for (const mime of ['image/gif', 'image/jpeg', 'image/png', 'image/bmp', 'image/tiff']) {
        assert.equal(service.isSupportedImageMimeType(mime), true, mime);
    }
});

test('isSupportedImageMimeType rejects an unsupported mime type', () => {
    const service = new PhotoDNACloudService();
    assert.equal(service.isSupportedImageMimeType('image/webp'), false);
});

test('preMatchMessage returns false when the message has no attachments', async () => {
    const service = new PhotoDNACloudService();
    const result = await service.preMatchMessage(makeMessage(undefined), makeLogger());
    assert.equal(result, false);
});

test('preMatchMessage returns false when the attachment is not an image', async () => {
    const service = new PhotoDNACloudService();
    const result = await service.preMatchMessage(makeMessage({ imageUrl: undefined }), makeLogger());
    assert.equal(result, false);
});

test('preMatchMessage returns false for an unsupported image type', async () => {
    const service = new PhotoDNACloudService();
    const message = makeMessage({ imageUrl: 'https://example.org/file-upload/abc/img.webp', imageType: 'image/webp' });
    const result = await service.preMatchMessage(message, makeLogger());
    assert.equal(result, false);
});

test('preMatchMessage returns true for a supported image type', async () => {
    const service = new PhotoDNACloudService();
    const message = makeMessage({ imageUrl: 'https://example.org/file-upload/abc/img.jpg', imageType: 'image/jpeg' });
    const result = await service.preMatchMessage(message, makeLogger());
    assert.equal(result, true);
});

test('preMatchMessage returns true when a later attachment is a supported image, even if an earlier one is not', async () => {
    const service = new PhotoDNACloudService();
    const message = makeMessage([
        { imageUrl: 'https://example.org/file-upload/abc/doc.webp', imageType: 'image/webp' },
        { imageUrl: 'https://example.org/file-upload/abc/img.jpg', imageType: 'image/jpeg' },
    ]);
    const result = await service.preMatchMessage(message, makeLogger());
    assert.equal(result, true);
});

test('matchMessage sends the image buffer to PhotoDNA and parses a match response', async () => {
    const service = new PhotoDNACloudService();
    const imageBuffer = fs.readFileSync(path.join(process.cwd(), 'tests', 'fixtures', 'SampleImages', 'img_130.jpg'));

    const message = makeMessage({
        imageUrl: 'https://example.org/file-upload/upload-id-123/img_130.jpg',
        imageType: 'image/jpeg',
        title: { value: 'img_130.jpg' },
    });

    let requestedUrl: string | undefined;
    let requestedContent: string | undefined;
    const http = {
        post: async (url: string, options: { content?: string }) => {
            requestedUrl = url;
            requestedContent = options.content;
            return {
                data: {
                    Status: { Code: 3000, Description: 'OK' },
                    TrackingId: 'test-tracking-id',
                    IsMatch: true,
                    MatchDetails: {
                        MatchFlags: [{ Source: 'Test', Violations: ['A1'], MatchDistance: 0 }],
                    },
                },
            };
        },
    } as unknown as IHttp;

    const read = {
        getUploadReader: () => ({
            getBufferById: async (_id: string) => imageBuffer,
        }),
        getEnvironmentReader: () => ({
            getSettings: () => ({
                getValueById: async (_id: string) => 'fake-api-key',
            }),
        }),
    } as unknown as IRead;

    const outcomes = await service.matchMessage(message, makeLogger(), read, http);

    assert.ok(requestedUrl?.endsWith('/Match'));
    assert.ok(requestedContent);
    const sentBody = JSON.parse(requestedContent as string);
    assert.equal(sentBody.DataRepresentation, 'inline');
    assert.equal(sentBody.Value, imageBuffer.toString('base64'));

    assert.equal(outcomes.length, 1);
    assert.equal(outcomes[0].verified, true);
    assert.ok(outcomes[0].verified);
    assert.equal(outcomes[0].result.IsMatch, true);
    assert.equal(outcomes[0].result.TrackingId, 'test-tracking-id');
    assert.equal(outcomes[0].result.ImageData?.filename, 'img_130.jpg');
});

test('matchMessage scans every image attachment, not just the first', async () => {
    const service = new PhotoDNACloudService();
    const imageBuffer = fs.readFileSync(path.join(process.cwd(), 'tests', 'fixtures', 'SampleImages', 'img_130.jpg'));

    const message = makeMessage([
        { imageUrl: 'https://example.org/file-upload/upload-id-1/clean.jpg', imageType: 'image/jpeg', title: { value: 'clean.jpg' } },
        { imageUrl: 'https://example.org/file-upload/upload-id-2/img_130.jpg', imageType: 'image/jpeg', title: { value: 'img_130.jpg' } },
    ]);

    let callCount = 0;
    const http = {
        post: async () => {
            callCount += 1;
            const isMatch = callCount === 2;
            return {
                data: {
                    Status: { Code: 3000, Description: 'OK' },
                    TrackingId: `tracking-${callCount}`,
                    IsMatch: isMatch,
                    MatchDetails: isMatch ? { MatchFlags: [{ Source: 'Test', Violations: ['A1'], MatchDistance: 0 }] } : undefined,
                },
            };
        },
    } as unknown as IHttp;

    const read = {
        getUploadReader: () => ({
            getBufferById: async (_id: string) => imageBuffer,
        }),
        getEnvironmentReader: () => ({
            getSettings: () => ({
                getValueById: async (_id: string) => 'fake-api-key',
            }),
        }),
    } as unknown as IRead;

    const outcomes = await service.matchMessage(message, makeLogger(), read, http);

    assert.equal(callCount, 2, 'both attachments should have been sent to PhotoDNA, not just the first');
    assert.equal(outcomes.length, 2);
    assert.equal(outcomes[0].verified, true);
    assert.ok(outcomes[0].verified);
    assert.equal(outcomes[0].result.IsMatch, false);
    assert.equal(outcomes[1].verified, true);
    assert.ok(outcomes[1].verified);
    assert.equal(outcomes[1].result.IsMatch, true);
});

test('matchMessage skips non-image and unsupported attachments while still scanning the rest', async () => {
    const service = new PhotoDNACloudService();
    const imageBuffer = fs.readFileSync(path.join(process.cwd(), 'tests', 'fixtures', 'SampleImages', 'img_130.jpg'));

    const message = makeMessage([
        { imageUrl: undefined },
        { imageUrl: 'https://example.org/file-upload/upload-id-1/doc.webp', imageType: 'image/webp' },
        { imageUrl: 'https://example.org/file-upload/upload-id-2/img_130.jpg', imageType: 'image/jpeg', title: { value: 'img_130.jpg' } },
    ]);

    const http = {
        post: async () => ({
            data: {
                Status: { Code: 3000, Description: 'OK' },
                TrackingId: 'test-tracking-id',
                IsMatch: true,
                MatchDetails: { MatchFlags: [{ Source: 'Test', Violations: ['A1'], MatchDistance: 0 }] },
            },
        }),
    } as unknown as IHttp;

    const read = {
        getUploadReader: () => ({
            getBufferById: async (_id: string) => imageBuffer,
        }),
        getEnvironmentReader: () => ({
            getSettings: () => ({
                getValueById: async (_id: string) => 'fake-api-key',
            }),
        }),
    } as unknown as IRead;

    const outcomes = await service.matchMessage(message, makeLogger(), read, http);

    assert.equal(outcomes.length, 1);
    assert.equal(outcomes[0].verified, true);
});

test('matchMessage reports an indeterminate outcome when the image buffer cannot be loaded', async () => {
    const service = new PhotoDNACloudService();
    const message = makeMessage({
        imageUrl: 'https://example.org/file-upload/upload-id-123/img_130.jpg',
        imageType: 'image/jpeg',
        title: { value: 'img_130.jpg' },
    });

    const http = { post: async () => ({ data: {} }) } as unknown as IHttp;
    const read = {
        getUploadReader: () => ({
            getBufferById: async (_id: string) => undefined,
        }),
        getEnvironmentReader: () => ({
            getSettings: () => ({
                getValueById: async (_id: string) => 'fake-api-key',
            }),
        }),
    } as unknown as IRead;

    const outcomes = await service.matchMessage(message, makeLogger(), read, http);

    assert.equal(outcomes.length, 1);
    assert.equal(outcomes[0].verified, false);
    assert.ok(!outcomes[0].verified);
    assert.match(outcomes[0].reason, /image buffer/i);
});

test('checkConnection parses a successful response from the API', async () => {
    const service = new PhotoDNACloudService();
    const imageBuffer = fs.readFileSync(path.join(process.cwd(), 'tests', 'fixtures', 'SampleImages', 'img_130.jpg'));

    const http = {
        post: async () => ({
            data: {
                Status: { Code: 3000, Description: 'OK' },
                TrackingId: 'test-tracking-id',
                IsMatch: true,
                MatchDetails: { MatchFlags: [{ Source: 'Test', Violations: ['A1'], MatchDistance: 0 }] },
            },
        }),
    } as unknown as IHttp;

    const read = {
        getEnvironmentReader: () => ({
            getSettings: () => ({
                getValueById: async (_id: string) => 'fake-api-key',
            }),
        }),
    } as unknown as IRead;

    const outcome = await service.checkConnection(http, read, makeLogger(), imageBuffer);
    assert.equal(outcome.verified, true);
    assert.ok(outcome.verified);
    assert.equal(outcome.result.Status?.Code, 3000);
    assert.equal(outcome.result.IsMatch, true);
});

test('checkConnection reports an indeterminate outcome when the API key setting is not configured', async () => {
    const service = new PhotoDNACloudService();
    const imageBuffer = fs.readFileSync(path.join(process.cwd(), 'tests', 'fixtures', 'SampleImages', 'img_130.jpg'));

    const http = { post: async () => ({ data: {} }) } as unknown as IHttp;
    const read = {
        getEnvironmentReader: () => ({
            getSettings: () => ({
                getValueById: async (_id: string) => undefined,
            }),
        }),
    } as unknown as IRead;

    const outcome = await service.checkConnection(http, read, makeLogger(), imageBuffer);
    assert.equal(outcome.verified, false);
    assert.ok(!outcome.verified);
    assert.match(outcome.reason, /not configured/i);
});

test('checkConnection reports an indeterminate outcome when no response is received', async () => {
    const service = new PhotoDNACloudService();
    const imageBuffer = fs.readFileSync(path.join(process.cwd(), 'tests', 'fixtures', 'SampleImages', 'img_130.jpg'));

    const http = { post: async () => undefined } as unknown as IHttp;
    const read = {
        getEnvironmentReader: () => ({
            getSettings: () => ({
                getValueById: async (_id: string) => 'fake-api-key',
            }),
        }),
    } as unknown as IRead;

    const outcome = await service.checkConnection(http, read, makeLogger(), imageBuffer);
    assert.equal(outcome.verified, false);
    assert.ok(!outcome.verified);
    assert.match(outcome.reason, /no response/i);
});

test('checkConnection reports an indeterminate outcome when the response has no data', async () => {
    const service = new PhotoDNACloudService();
    const imageBuffer = fs.readFileSync(path.join(process.cwd(), 'tests', 'fixtures', 'SampleImages', 'img_130.jpg'));

    const http = { post: async () => ({}) } as unknown as IHttp;
    const read = {
        getEnvironmentReader: () => ({
            getSettings: () => ({
                getValueById: async (_id: string) => 'fake-api-key',
            }),
        }),
    } as unknown as IRead;

    const outcome = await service.checkConnection(http, read, makeLogger(), imageBuffer);
    assert.equal(outcome.verified, false);
    assert.ok(!outcome.verified);
    assert.match(outcome.reason, /did not include any data/i);
});

test('checkConnection reports an indeterminate outcome for an API error response (e.g. an invalid key)', async () => {
    const service = new PhotoDNACloudService();
    const imageBuffer = fs.readFileSync(path.join(process.cwd(), 'tests', 'fixtures', 'SampleImages', 'img_130.jpg'));

    const http = {
        post: async () => ({
            data: { statusCode: 401, message: 'Access denied due to invalid subscription key.' },
        }),
    } as unknown as IHttp;

    const read = {
        getEnvironmentReader: () => ({
            getSettings: () => ({
                getValueById: async (_id: string) => 'invalid-key',
            }),
        }),
    } as unknown as IRead;

    const outcome = await service.checkConnection(http, read, makeLogger(), imageBuffer);
    assert.equal(outcome.verified, false);
    assert.ok(!outcome.verified);
    assert.match(outcome.reason, /401/);
    assert.match(outcome.reason, /Access denied/);
});

test('checkConnection reports an indeterminate outcome when the API call throws', async () => {
    const service = new PhotoDNACloudService();
    const imageBuffer = fs.readFileSync(path.join(process.cwd(), 'tests', 'fixtures', 'SampleImages', 'img_130.jpg'));

    const http = { post: async () => { throw new Error('socket hang up'); } } as unknown as IHttp;
    const read = {
        getEnvironmentReader: () => ({
            getSettings: () => ({
                getValueById: async (_id: string) => 'fake-api-key',
            }),
        }),
    } as unknown as IRead;

    const outcome = await service.checkConnection(http, read, makeLogger(), imageBuffer);
    assert.equal(outcome.verified, false);
    assert.ok(!outcome.verified);
    assert.match(outcome.reason, /network error/i);
    assert.match(outcome.reason, /socket hang up/);
});

function makeReportRead(enableTestMode: boolean): IRead {
    const settingValues: Record<string, unknown> = {
        'photodna-api-key': 'fake-api-key',
        'ncmec-user': 'fake-user',
        'ncmec-password': 'fake-password',
        'ncmec-orgname': 'TestOrg',
        'ncmec-reporter-name': 'Reporter',
        'ncmec-reporter-email': 'test@example.org',
        'ncmec-enable-test-mode': enableTestMode,
    };
    return {
        getEnvironmentReader: () => ({
            getSettings: () => ({
                getValueById: async (id: string) => settingValues[id],
            }),
        }),
    } as unknown as IRead;
}

test('performReportOperation includes the IsTest flag when test mode is enabled', async () => {
    const service = new PhotoDNACloudService();
    const message = makeMessage(undefined);

    let requestedContent: string | undefined;
    const http = {
        post: async (_url: string, options: { content?: string }) => {
            requestedContent = options.content;
            return { data: { ok: true } };
        },
    } as unknown as IHttp;

    const matchResult = { Status: { Code: 3000, Description: 'OK' }, TrackingId: 'x' };
    await service.performReportOperation([matchResult], http, message, makeReportRead(true), makeLogger());

    assert.ok(requestedContent);
    const sentBody = JSON.parse(requestedContent as string);
    assert.ok('AdditionalMetadata' in sentBody);
});

test('performReportOperation omits the IsTest flag when test mode is disabled', async () => {
    const service = new PhotoDNACloudService();
    const message = makeMessage(undefined);

    let requestedContent: string | undefined;
    const http = {
        post: async (_url: string, options: { content?: string }) => {
            requestedContent = options.content;
            return { data: { ok: true } };
        },
    } as unknown as IHttp;

    const matchResult = { Status: { Code: 3000, Description: 'OK' }, TrackingId: 'x' };
    await service.performReportOperation([matchResult], http, message, makeReportRead(false), makeLogger());

    assert.ok(requestedContent);
    const sentBody = JSON.parse(requestedContent as string);
    assert.ok(!('AdditionalMetadata' in sentBody));
});

test('performReportOperation includes every matched image in a single ViolationContentCollection', async () => {
    const service = new PhotoDNACloudService();
    const message = makeMessage(undefined);

    let requestedContent: string | undefined;
    const http = {
        post: async (_url: string, options: { content?: string }) => {
            requestedContent = options.content;
            return { data: { ok: true } };
        },
    } as unknown as IHttp;

    const matchResults = [
        {
            Status: { Code: 3000, Description: 'OK' },
            TrackingId: 'x',
            ImageData: { contentType: 'image/jpeg', filename: 'first.jpg', data: Buffer.from('first') },
        },
        {
            Status: { Code: 3000, Description: 'OK' },
            TrackingId: 'y',
            ImageData: { contentType: 'image/jpeg', filename: 'second.jpg', data: Buffer.from('second') },
        },
    ];
    await service.performReportOperation(matchResults, http, message, makeReportRead(false), makeLogger());

    assert.ok(requestedContent);
    const sentBody = JSON.parse(requestedContent as string);
    assert.equal(sentBody.ViolationContentCollection.length, 2);
    assert.equal(sentBody.ViolationContentCollection[0].Name, 'first.jpg');
    assert.equal(sentBody.ViolationContentCollection[1].Name, 'second.jpg');
});

test('performReportOperation logs distinctly and does not call the API when NCMEC credentials are not configured', async () => {
    const service = new PhotoDNACloudService();
    const message = makeMessage(undefined);

    let httpCalled = false;
    const http = { post: async () => { httpCalled = true; return { data: { ok: true } }; } } as unknown as IHttp;
    const read = {
        getEnvironmentReader: () => ({
            getSettings: () => ({
                getValueById: async (_id: string) => undefined,
            }),
        }),
    } as unknown as IRead;

    const errorCalls: Array<Array<unknown>> = [];
    const logger = { error: (...args: Array<unknown>) => { errorCalls.push(args); }, warn: () => undefined } as unknown as ILogger;

    const matchResult = { Status: { Code: 3000, Description: 'OK' }, TrackingId: 'x' };
    await service.performReportOperation([matchResult], http, message, read, logger);

    assert.equal(httpCalled, false);
    assert.equal(errorCalls.length, 1);
    assert.equal(errorCalls[0][0], 'NCMEC-REPORT-SKIPPED');
});

test('performReportOperation logs distinctly when the NCMEC API call throws', async () => {
    const service = new PhotoDNACloudService();
    const message = makeMessage(undefined);

    const http = { post: async () => { throw new Error('socket hang up'); } } as unknown as IHttp;
    const errorCalls: Array<Array<unknown>> = [];
    const logger = { error: (...args: Array<unknown>) => { errorCalls.push(args); }, warn: () => undefined } as unknown as ILogger;

    const matchResult = { Status: { Code: 3000, Description: 'OK' }, TrackingId: 'x' };
    await service.performReportOperation([matchResult], http, message, makeReportRead(false), logger);

    assert.equal(errorCalls.length, 1);
    assert.equal(errorCalls[0][0], 'NCMEC-REPORT-FAILED');
    assert.ok(errorCalls[0].some((arg) => typeof arg === 'string' && /socket hang up/.test(arg)));
});

test('performReportOperation logs distinctly when the NCMEC API response has no data', async () => {
    const service = new PhotoDNACloudService();
    const message = makeMessage(undefined);

    const http = { post: async () => ({}) } as unknown as IHttp;
    const errorCalls: Array<Array<unknown>> = [];
    const logger = { error: (...args: Array<unknown>) => { errorCalls.push(args); }, warn: () => undefined } as unknown as ILogger;

    const matchResult = { Status: { Code: 3000, Description: 'OK' }, TrackingId: 'x' };
    await service.performReportOperation([matchResult], http, message, makeReportRead(false), logger);

    assert.equal(errorCalls.length, 1);
    assert.equal(errorCalls[0][0], 'NCMEC-REPORT-FAILED');
});
