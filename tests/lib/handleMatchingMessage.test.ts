import {test} from "node:test";
import {strict as assert} from "node:assert";
import type {
    IHttp,
    ILogger,
    IMessageBuilder,
    IRead,
} from "@rocket.chat/apps-engine/definition/accessors";
import type {IMessage} from "@rocket.chat/apps-engine/definition/messages";
import {handleMatchingMessage} from "../../lib/handleMatchingMessage";
import {IMatchResult} from "../../lib/IMatchResult";
import {PhotoDNACloudService} from "../../lib/PhotoDNACloudService";

function makeLogger(): {logger: ILogger; warnCalls: Array<Array<unknown>>} {
    const warnCalls: Array<Array<unknown>> = [];
    const logger = {
        warn: (...args: Array<unknown>) => {
            warnCalls.push(args);
        },
    } as unknown as ILogger;
    return {logger, warnCalls};
}

function makeRead(): IRead {
    return {
        getRoomReader: () => ({
            getByName: async (_name: string) => undefined,
        }),
    } as unknown as IRead;
}

/**
 * Simulates a real attachments array: removeAttachment(position) splices whatever is
 * currently at that position, exactly like the real IMessageBuilder does, so tests can
 * assert on which attachments actually survive rather than on the exact sequence of
 * removeAttachment calls used to get there.
 */
function makeBuilder(attachmentLabels: Array<string> = []): {
    builder: IMessageBuilder;
    getRemainingLabels: () => Array<string>;
} {
    const attachments = [...attachmentLabels];
    const builder = {
        removeAttachment: (index: number) => {
            if (index < 0 || index >= attachments.length) {
                throw new Error(`No attachment at position ${index}`);
            }
            attachments.splice(index, 1);
            return builder;
        },
        setRoom: () => builder,
    } as unknown as IMessageBuilder;
    return {builder, getRemainingLabels: () => attachments};
}

function makeMessage(): IMessage {
    return {
        id: "message-id",
        sender: {username: "testuser"},
    } as unknown as IMessage;
}

function makeMatchResult(filename: string, imageMarker: string): IMatchResult {
    return {
        Status: {Code: 3000, Description: "OK"},
        TrackingId: "test-tracking-id",
        IsMatch: true,
        ImageData: {
            contentType: "image/jpeg",
            filename,
            data: Buffer.from(imageMarker),
        },
    } as unknown as IMatchResult;
}

test("does not serialize matched image bytes into the log line", async () => {
    const {logger, warnCalls} = makeLogger();
    const {builder} = makeBuilder(["img.jpg"]);
    const imageMarker = "unmistakable-image-bytes-marker";

    await handleMatchingMessage(
        [makeMatchResult("img.jpg", imageMarker)],
        [0],
        makeMessage(),
        makeRead(),
        builder,
        {} as IHttp,
        logger,
        undefined,
        false,
        new PhotoDNACloudService(),
    );

    const serializedCalls = JSON.stringify(warnCalls);
    assert.ok(!serializedCalls.includes(imageMarker));
    assert.ok(
        !serializedCalls.includes(Buffer.from(imageMarker).toString("base64")),
    );
});

test("logs every matched attachment when a message has more than one", async () => {
    const {logger, warnCalls} = makeLogger();
    const {builder} = makeBuilder(["first.jpg", "second.jpg"]);

    await handleMatchingMessage(
        [
            makeMatchResult("first.jpg", "first-marker"),
            makeMatchResult("second.jpg", "second-marker"),
        ],
        [0, 1],
        makeMessage(),
        makeRead(),
        builder,
        {} as IHttp,
        logger,
        undefined,
        false,
        new PhotoDNACloudService(),
    );

    const matchLogs = warnCalls.filter((call) => call[0] === "PHOTODNA-MATCH");
    assert.equal(matchLogs.length, 2);
});

test("files a single report covering every matched attachment when automated reporting is enabled", async () => {
    const {logger} = makeLogger();
    const {builder} = makeBuilder(["first.jpg", "second.jpg"]);
    const service = new PhotoDNACloudService();
    let reportCallCount = 0;
    let reportedMatchResults: Array<IMatchResult> | undefined;
    service.performReportOperation = async (
        matchResults: Array<IMatchResult>,
    ) => {
        reportCallCount += 1;
        reportedMatchResults = matchResults;
    };

    await handleMatchingMessage(
        [
            makeMatchResult("first.jpg", "first-marker"),
            makeMatchResult("second.jpg", "second-marker"),
        ],
        [0, 1],
        makeMessage(),
        makeRead(),
        builder,
        {} as IHttp,
        logger,
        undefined,
        true,
        service,
    );

    assert.equal(
        reportCallCount,
        1,
        "expected a single combined report, not one per matched attachment",
    );
    assert.equal(reportedMatchResults?.length, 2);
});

test("when quarantine is unavailable, removes only the attachment(s) that matched, leaving the rest of the message intact", async () => {
    const {logger} = makeLogger();
    // 4 attachments. Only the third (index 2) matched
    const {builder, getRemainingLabels} = makeBuilder([
        "first",
        "second",
        "third",
        "fourth",
    ]);

    await handleMatchingMessage(
        [makeMatchResult("third.jpg", "third-marker")],
        [2],
        makeMessage(),
        makeRead(),
        builder,
        {} as IHttp,
        logger,
        undefined,
        false,
        new PhotoDNACloudService(),
    );

    assert.deepEqual(getRemainingLabels(), ["first", "second", "fourth"]);
});

test("when quarantine is unavailable and multiple attachments matched, removes exactly those and nothing else", async () => {
    const {logger} = makeLogger();
    // 4 attachments. The second (index 1) and fourth (index 3) matched
    const {builder, getRemainingLabels} = makeBuilder([
        "first",
        "second",
        "third",
        "fourth",
    ]);

    await handleMatchingMessage(
        [
            makeMatchResult("second.jpg", "second-marker"),
            makeMatchResult("fourth.jpg", "fourth-marker"),
        ],
        [1, 3],
        makeMessage(),
        makeRead(),
        builder,
        {} as IHttp,
        logger,
        undefined,
        false,
        new PhotoDNACloudService(),
    );

    assert.deepEqual(getRemainingLabels(), ["first", "third"]);
});
