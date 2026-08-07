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

function makeMessage(attachment: Record<string, unknown> | undefined): IMessage {
    return {
        id: 'message-id',
        room: { id: 'room-id' },
        sender: { name: 'Test User', username: 'testuser' },
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        attachments: attachment ? [attachment] : undefined,
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

    const result = await service.matchMessage(message, makeLogger(), read, http);

    assert.ok(requestedUrl?.endsWith('/Match'));
    assert.ok(requestedContent);
    const sentBody = JSON.parse(requestedContent as string);
    assert.equal(sentBody.DataRepresentation, 'inline');
    assert.equal(sentBody.Value, imageBuffer.toString('base64'));

    assert.equal(result?.IsMatch, true);
    assert.equal(result?.TrackingId, 'test-tracking-id');
    assert.equal(result?.ImageData?.filename, 'img_130.jpg');
});
