import {test} from "node:test";
import {strict as assert} from "node:assert";
import type {
    ILogger,
    IRead,
} from "@rocket.chat/apps-engine/definition/accessors";
import type {IRoom} from "@rocket.chat/apps-engine/definition/rooms/IRoom";
import {resolveQuarantineRoomId} from "../../lib/resolveQuarantineRoomId";

function makeLogger(): {logger: ILogger; errorCalls: Array<Array<unknown>>} {
    const errorCalls: Array<Array<unknown>> = [];
    const logger = {
        error: (...args: Array<unknown>) => {
            errorCalls.push(args);
        },
    } as unknown as ILogger;
    return {logger, errorCalls};
}

function makeRead(room: IRoom | undefined): {
    read: IRead;
    getByNameCalls: Array<string>;
} {
    const getByNameCalls: Array<string> = [];
    const read = {
        getRoomReader: () => ({
            getByName: async (name: string) => {
                getByNameCalls.push(name);
                return room;
            },
        }),
    } as unknown as IRead;
    return {read, getByNameCalls};
}

test("returns undefined without a lookup when no channel is configured", async () => {
    const {logger} = makeLogger();
    const {read, getByNameCalls} = makeRead(undefined);

    const roomId = await resolveQuarantineRoomId("", read, logger);

    assert.equal(roomId, undefined);
    assert.equal(getByNameCalls.length, 0);
});

test("resolves the configured channel name to its room id", async () => {
    const {logger} = makeLogger();
    const targetRoom = {id: "quarantine-room-id"} as IRoom;
    const {read, getByNameCalls} = makeRead(targetRoom);

    const roomId = await resolveQuarantineRoomId(
        "photodna-quarantine",
        read,
        logger,
    );

    assert.equal(roomId, "quarantine-room-id");
    assert.deepEqual(getByNameCalls, ["photodna-quarantine"]);
});

test("lowercases the configured channel name before looking it up, matching resolveWatchedRoomIds", async () => {
    const {logger} = makeLogger();
    const targetRoom = {id: "quarantine-room-id"} as IRoom;
    const {read, getByNameCalls} = makeRead(targetRoom);

    const roomId = await resolveQuarantineRoomId(
        "PhotoDNA-Quarantine",
        read,
        logger,
    );

    assert.equal(roomId, "quarantine-room-id");
    assert.deepEqual(getByNameCalls, ["photodna-quarantine"]);
});

test("logs at error severity and returns undefined when the configured channel does not exist", async () => {
    const {logger, errorCalls} = makeLogger();
    const {read} = makeRead(undefined);

    const roomId = await resolveQuarantineRoomId(
        "typo-channel-name",
        read,
        logger,
    );

    assert.equal(roomId, undefined);
    assert.equal(errorCalls.length, 1);
    assert.ok(
        errorCalls[0].some(
            (arg) =>
                typeof arg === "string" && arg.includes("typo-channel-name"),
        ),
    );
});
