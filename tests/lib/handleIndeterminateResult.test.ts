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
            getByName: async (_name: string) => targetRoom,
        }),
    } as unknown as IRead;
}

function makeBuilder(): { builder: IMessageBuilder; getRoomCalls: Array<IRoom>; getText: () => string } {
    let text = 'original message text';
    const getRoomCalls: Array<IRoom> = [];
    const builder = {
        getText: () => text,
        setText: (value: string) => { text = value; return builder; },
        setRoom: (room: IRoom) => { getRoomCalls.push(room); return builder; },
        removeAttachment: () => builder,
    } as unknown as IMessageBuilder;
    return { builder, getRoomCalls, getText: () => text };
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

    await handleIndeterminateResult('No response was received from the PhotoDNA API.', makeMessage(), makeRead(undefined), builder, logger, '');

    assert.equal(errorCalls.length, 1);
    assert.ok(errorCalls[0].some((arg) => typeof arg === 'string' && arg.includes('No response was received from the PhotoDNA API.')));
});

test('prepends a notice naming the reason to the message text', async () => {
    const { logger } = makeLogger();
    const { builder, getText } = makeBuilder();

    await handleIndeterminateResult('A network error occurred.', makeMessage(), makeRead(undefined), builder, logger, '');

    assert.match(getText(), /^PhotoDNA verification failed \(A network error occurred\.\)/);
    assert.match(getText(), /not a confirmed match/i);
    assert.match(getText(), /original message text$/);
});

test('moves the message to the quarantine channel when one is configured', async () => {
    const { logger } = makeLogger();
    const { builder, getRoomCalls } = makeBuilder();
    const targetRoom = { id: 'quarantine-room-id' } as IRoom;

    await handleIndeterminateResult('reason', makeMessage(), makeRead(targetRoom), builder, logger, 'quarantine-channel');

    assert.deepEqual(getRoomCalls, [targetRoom]);
});
