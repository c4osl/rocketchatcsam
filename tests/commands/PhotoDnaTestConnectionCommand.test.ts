import {test} from "node:test";
import {strict as assert} from "node:assert";
import type {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from "@rocket.chat/apps-engine/definition/accessors";
import type {SlashCommandContext} from "@rocket.chat/apps-engine/definition/slashcommands";
import {PhotoDnaTestConnectionCommand} from "../../commands/PhotoDnaTestConnectionCommand";

function makeContext(roles: Array<string>): SlashCommandContext {
    return {
        getSender: () => ({roles, username: "testuser"}),
        getRoom: () => ({id: "room-id"}),
    } as unknown as SlashCommandContext;
}

function makeModify(): {modify: IModify; notifications: Array<string>} {
    const notifications: Array<string> = [];
    const modify = {
        getNotifier: () => ({
            getMessageBuilder: () => {
                let text = "";
                const builder = {
                    setRoom: () => builder,
                    setText: (value: string) => {
                        text = value;
                        return builder;
                    },
                    getMessage: () => ({text}),
                };
                return builder;
            },
            notifyUser: async (_user: unknown, message: {text: string}) => {
                notifications.push(message.text);
            },
        }),
    } as unknown as IModify;
    return {modify, notifications};
}

function makeRead(apiKey: string | undefined): IRead {
    return {
        getEnvironmentReader: () => ({
            getSettings: () => ({
                getValueById: async (_id: string) => apiKey,
            }),
        }),
    } as unknown as IRead;
}

test("rejects a non-admin user without calling the API", async () => {
    const command = new PhotoDnaTestConnectionCommand();
    const {modify, notifications} = makeModify();
    let httpCalled = false;
    const http = {
        post: async () => {
            httpCalled = true;
            return {data: {}};
        },
    } as unknown as IHttp;

    await command.executor(
        makeContext(["user"]),
        makeRead("fake-key"),
        modify,
        http,
        {} as IPersistence,
    );

    assert.equal(httpCalled, false);
    assert.match(notifications[0], /administrator/i);
});

test("reports when the API key setting is not configured", async () => {
    const command = new PhotoDnaTestConnectionCommand();
    const {modify, notifications} = makeModify();
    let httpCalled = false;
    const http = {
        post: async () => {
            httpCalled = true;
            return {data: {}};
        },
    } as unknown as IHttp;

    await command.executor(
        makeContext(["admin"]),
        makeRead(undefined),
        modify,
        http,
        {} as IPersistence,
    );

    assert.equal(httpCalled, false);
    assert.match(notifications[0], /not configured/i);
});

test("reports success for an admin when the API responds with a match", async () => {
    const command = new PhotoDnaTestConnectionCommand();
    const {modify, notifications} = makeModify();
    const http = {
        post: async () => ({
            data: {
                Status: {Code: 3000, Description: "OK"},
                IsMatch: true,
                MatchDetails: {MatchFlags: [{Source: "Test"}]},
            },
        }),
    } as unknown as IHttp;

    await command.executor(
        makeContext(["admin"]),
        makeRead("fake-key"),
        modify,
        http,
        {} as IPersistence,
    );

    assert.match(notifications[0], /^Connection successful/);
});

test("reports failure for an admin when the API rejects the key", async () => {
    const command = new PhotoDnaTestConnectionCommand();
    const {modify, notifications} = makeModify();
    const http = {
        post: async () => ({
            data: {
                statusCode: 401,
                message: "Access denied due to invalid subscription key.",
            },
        }),
    } as unknown as IHttp;

    await command.executor(
        makeContext(["admin"]),
        makeRead("invalid-key"),
        modify,
        http,
        {} as IPersistence,
    );

    assert.match(notifications[0], /401/);
    assert.match(notifications[0], /Access denied/);
});
