/**
 * Integration test: verifies the app can actually reach the live PhotoDNA cloud
 * service with a real API key. Unlike the mocked tests in tests/lib/, this makes
 * a real network call, so it requires PHOTODNA_API_KEY to be set and is not part
 * of the default `npm test` run. See README.md's Testing section for how to run it.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { IHttp, IHttpRequest, IHttpResponse, IRead, ILogger } from '@rocket.chat/apps-engine/definition/accessors';
import { RequestMethod } from '@rocket.chat/apps-engine/definition/accessors/IHttp';
import type { IMessage } from '@rocket.chat/apps-engine/definition/messages';
import { PhotoDNACloudService } from '../../lib/PhotoDNACloudService';

const apiKey = process.env.PHOTODNA_API_KEY;
const imagePath = path.join(process.cwd(), 'tests', 'fixtures', 'SampleImages', 'img_130.jpg');

function makeLogger(): ILogger {
    return {
        debug: () => undefined,
        warn: () => undefined,
    } as unknown as ILogger;
}

/**
 * IHttp adapter backed by a real network call, so this test exercises the app's
 * actual request-building code against the live service instead of a mock.
 */
function makeLiveHttp(): IHttp {
    async function post(url: string, options?: IHttpRequest): Promise<IHttpResponse> {
        const query = options?.params ? `?${new URLSearchParams(options.params).toString()}` : '';
        const response = await fetch(url + query, {
            method: 'POST',
            headers: options?.headers,
            body: options?.content,
        });
        const text = await response.text();
        let data: unknown;
        try {
            data = JSON.parse(text);
        } catch {
            data = text;
        }
        return {
            url,
            method: RequestMethod.POST,
            statusCode: response.status,
            headers: Object.fromEntries(response.headers.entries()),
            content: text,
            data,
        } as IHttpResponse;
    }

    return { post } as unknown as IHttp;
}

function makeRead(imageBuffer: Buffer): IRead {
    return {
        getEnvironmentReader: () => ({
            getSettings: () => ({
                getValueById: async (_id: string) => apiKey,
            }),
        }),
        getUploadReader: () => ({
            getBufferById: async (_id: string) => imageBuffer,
        }),
    } as unknown as IRead;
}

function makeMessage(imageFileName: string): IMessage {
    return {
        id: 'integration-test',
        room: { id: 'integration-test-room' },
        sender: { name: 'Integration Test', username: 'integration-test' },
        createdAt: new Date(),
        attachments: [{
            imageUrl: `https://example.org/file-upload/integration-test/${imageFileName}`,
            imageType: 'image/jpeg',
            title: { value: imageFileName },
        }],
    } as unknown as IMessage;
}

/**
 * JSON.stringify replacer that swaps any Buffer for a short summary, so a failed
 * assertion doesn't dump the raw image bytes into the test output.
 */
function redactBuffers(_key: string, value: unknown): unknown {
    if (value && typeof value === 'object' && (value as { type?: string }).type === 'Buffer' && Array.isArray((value as { data?: unknown }).data)) {
        return `<Buffer, ${(value as { data: Array<number> }).data.length} bytes>`;
    }
    return value;
}

test(
    'PhotoDNACloudService can authenticate and match against the live PhotoDNA API',
    { skip: apiKey ? false : 'set PHOTODNA_API_KEY to run this integration test' },
    async () => {
        const service = new PhotoDNACloudService();
        const imageBuffer = fs.readFileSync(imagePath);
        const message = makeMessage(path.basename(imagePath));

        const result = await service.matchMessage(message, makeLogger(), makeRead(imageBuffer), makeLiveHttp());

        // A missing result, or a Status.Code other than 3000 (e.g. 401 for an invalid
        // key), means the connection or credential is broken, not the app's own logic.
        assert.ok(result, 'expected a parsed match result from the live API');
        assert.equal(
            result?.Status?.Code,
            3000,
            `expected Status.Code 3000 (OK); the API responded with: ${JSON.stringify(result, redactBuffers)}`,
        );

        // img_130.jpg is one of Microsoft's official PhotoDNA sample images, documented
        // to always match against the "Test" source.
        assert.equal(result?.IsMatch, true);
        assert.equal(result?.MatchDetails?.MatchFlags?.[0]?.Source, 'Test');
    },
);
