/**
 * Integration test: verifies the app can actually reach the live PhotoDNA cloud
 * service with a real API key. Unlike the mocked tests in tests/lib/, this makes
 * a real network call, so it requires PHOTODNA_API_KEY to be set and is not part
 * of the default `npm test` run. See README.md's Testing section for how to run it.
 */
import {test} from "node:test";
import {strict as assert} from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import type {
    IHttp,
    IHttpRequest,
    IHttpResponse,
    IRead,
    ILogger,
} from "@rocket.chat/apps-engine/definition/accessors";
import {RequestMethod} from "@rocket.chat/apps-engine/definition/accessors/IHttp";
import type {IMessage} from "@rocket.chat/apps-engine/definition/messages";
import {PhotoDNACloudService} from "../../lib/PhotoDNACloudService";

const apiKey = process.env.PHOTODNA_API_KEY;
const imagePath = path.join(
    process.cwd(),
    "tests",
    "fixtures",
    "SampleImages",
    "img_130.jpg",
);

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
    async function post(
        url: string,
        options?: IHttpRequest,
    ): Promise<IHttpResponse> {
        const query = options?.params
            ? `?${new URLSearchParams(options.params).toString()}`
            : "";
        const response = await fetch(url + query, {
            method: "POST",
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

    return {post} as unknown as IHttp;
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
        id: "integration-test",
        room: {id: "integration-test-room"},
        sender: {name: "Integration Test", username: "integration-test"},
        createdAt: new Date(),
        attachments: [
            {
                imageUrl: `https://example.org/file-upload/integration-test/${imageFileName}`,
                imageType: "image/jpeg",
                title: {value: imageFileName},
                fileId: "integration-test-file-id",
            },
        ],
    } as unknown as IMessage;
}

test(
    "PhotoDNACloudService can authenticate and match against the live PhotoDNA API",
    {
        skip: apiKey
            ? false
            : "set PHOTODNA_API_KEY to run this integration test",
    },
    async () => {
        const service = new PhotoDNACloudService();
        const imageBuffer = fs.readFileSync(imagePath);
        const message = makeMessage(path.basename(imagePath));

        const attachmentOutcomes = await service.matchMessage(
            message,
            makeLogger(),
            makeRead(imageBuffer),
            makeLiveHttp(),
        );

        assert.equal(attachmentOutcomes.length, 1);
        const outcome = attachmentOutcomes[0].outcome;

        // An unverified outcome (e.g. a 401 for an invalid key) means the connection or
        // credential is broken, not the app's own logic.
        if (!outcome.verified) {
            assert.fail(
                `expected a verified match result from the live API, got: ${outcome.reason}`,
            );
        }

        // img_130.jpg is one of Microsoft's official PhotoDNA sample images, documented
        // to always match against the "Test" source.
        assert.equal(outcome.result.IsMatch, true);
        assert.equal(
            outcome.result.MatchDetails?.MatchFlags?.[0]?.Source,
            "Test",
        );
    },
);
