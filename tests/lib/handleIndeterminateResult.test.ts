import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { ILogger, IMessageBuilder, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import type { IMessage } from '@rocket.chat/apps-engine/definition/messages';
import type { IRoom } from '@rocket.chat/apps-engine/definition/rooms/IRoom';
import { handleIndeterminateResult } from '../../lib/handleIndeterminateResult';

function makeLogger(): { logger: ILogger; errorCalls: Array<Array<unknown>> } {
    const errorCalls: Array<Array<unknown>> = [];
    const logger = {
        warn: () => undefined,
        error: (...args: Array<unknown>) => { errorCalls.push(args); },
    } as unknown as ILogger;
    return { logger, errorCalls };
}

function makeRead(targetRoom: IRoom | undefined): IRead {
    return {
        getRoomReader: () => ({
            getById: async (_id: string) => targetRoom,
        }),
    } as unknown as IRead;
}

/**
 * Simulates a real attachments array: removeAttachment(position) splices whatever is
 * currently at that position, exactly like the real IMessageBuilder does, so tests can
 * assert on which attachments actually survive rather than on the exact sequence of
 * removeAttachment calls used to get there.
 */
function makeBuilder(attachmentLabels: Array<string> = ['attachment']): {
    builder: IMessageBuilder;
    getRoomCalls: Array<IRoom>;
    getText: () => string;
    getRemainingLabels: () => Array<string>;
} {
    let text = 'original message text';
    const getRoomCalls: Array<IRoom> = [];
    const attachments = [...attachmentLabels];
    const builder = {
        getText: () => text,
        setText: (value: string) => { text = value; return builder; },
        setRoom: (room: IRoom) => { getRoomCalls.push(room); return builder; },
        removeAttachment: (index: number) => {
            if (index < 0 || index >= attachments.length) {
                throw new Error(`No attachment at position ${index}`);
            }
            attachments.splice(index, 1);
            return builder;
        },
    } as unknown as IMessageBuilder;
    return { builder, getRoomCalls, getText: () => text, getRemainingLabels: () => attachments };
}

function makeMessage(): IMessage {
    return {
        id: 'message-id',
        sender: { username: 'testuser' },
    } as unknown as IMessage;
}

test('logs at error severity and includes the reason', async () => {
    const { logger, errorCalls } = makeLogger();
    const { builder } = makeBuilder();

    await handleIndeterminateResult('No response was received from the PhotoDNA API.', [0], makeMessage(), makeRead(undefined), builder, logger, undefined);

    assert.equal(errorCalls.length, 1);
    assert.ok(errorCalls[0].some((arg) => typeof arg === 'string' && arg.includes('No response was received from the PhotoDNA API.')));
});

test('prepends a notice naming the reason to the message text', async () => {
    const { logger } = makeLogger();
    const { builder, getText } = makeBuilder();

    await handleIndeterminateResult('A network error occurred.', [0], makeMessage(), makeRead(undefined), builder, logger, undefined);

    assert.match(getText(), /^PhotoDNA verification failed \(A network error occurred\.\)/);
    assert.match(getText(), /not a confirmed match/i);
    assert.match(getText(), /original message text$/);
});

test('moves the message to the quarantine channel when one is configured', async () => {
    const { logger } = makeLogger();
    const { builder, getRoomCalls } = makeBuilder();
    const targetRoom = { id: 'quarantine-room-id' } as IRoom;

    await handleIndeterminateResult('reason', [0], makeMessage(), makeRead(targetRoom), builder, logger, 'quarantine-room-id');

    assert.deepEqual(getRoomCalls, [targetRoom]);
});

test('logs at error severity when the configured quarantine room can no longer be found', async () => {
    const { logger, errorCalls } = makeLogger();
    const { builder } = makeBuilder();

    await handleIndeterminateResult('reason', [0], makeMessage(), makeRead(undefined), builder, logger, 'quarantine-room-id');

    assert.equal(errorCalls.length, 2, 'expected one error for the verification failure and one for the missing quarantine room');
    assert.ok(errorCalls.some((call) => call.some((arg) => typeof arg === 'string' && /could not be found/i.test(arg))));
});

test('when quarantine is unavailable, removes only the attachment(s) that were indeterminate, leaving the rest of the message intact', async () => {
    const { logger } = makeLogger();
    // 3 attachments. Only the third (index 2) was indeterminate
    const { builder, getRemainingLabels } = makeBuilder(['first', 'second', 'third']);

    await handleIndeterminateResult('reason', [2], makeMessage(), makeRead(undefined), builder, logger, undefined);

    assert.deepEqual(getRemainingLabels(), ['first', 'second']);
});
