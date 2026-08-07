import { IHttp, ILogger, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { ISlashCommand, SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';
import { PhotoDNACloudService } from '../lib/PhotoDNACloudService';
import { IMatchResult } from '../lib/IMatchResult';
import { SETTING_PHOTODNA_API_KEY } from '../config/Settings';
import { getPhotoDnaTestImageBuffer } from './photoDnaTestImage';

const ADMIN_ROLE = 'admin';

/**
 * Slash command an administrator can run from within Rocket.Chat to verify the
 * configured PhotoDNA API key and network connectivity, without needing to upload
 * an image or have source/CLI access to the app.
 *
 * Note: ISlashCommand's own `permission` field is not enforced by the server (see
 * https://github.com/RocketChat/Rocket.Chat/issues/14739), so the admin check below
 * is done explicitly rather than relying on it.
 */
export class PhotoDnaTestConnectionCommand implements ISlashCommand {

    public command = 'photodna-test-connection';
    public i18nParamsExample = '';
    public i18nDescription = 'CSEM_Test_Connection_Command_Description';
    public providesPreview = false;

    private readonly photoDnaService = new PhotoDNACloudService();

    public async executor(context: SlashCommandContext, read: IRead, modify: IModify, http: IHttp, _persis: IPersistence): Promise<void> {
        const sender = context.getSender();
        const room = context.getRoom();
        const notifier = modify.getNotifier();

        const reply = async (text: string): Promise<void> => {
            const message = notifier.getMessageBuilder().setRoom(room).setText(text).getMessage();
            await notifier.notifyUser(sender, message);
        };

        if (!sender.roles.includes(ADMIN_ROLE)) {
            await reply('You must be an administrator to run this command.');
            return;
        }

        const apiKey = await read.getEnvironmentReader().getSettings().getValueById(SETTING_PHOTODNA_API_KEY);
        if (!apiKey) {
            await reply('The "API Subscription Key" setting is not configured yet.');
            return;
        }

        const logger = makeSilentLogger();
        const result = await this.photoDnaService.checkConnection(http, read, logger, getPhotoDnaTestImageBuffer());
        await reply(describeResult(result));
    }
}

function makeSilentLogger(): ILogger {
    return {
        debug: () => undefined,
        warn: () => undefined,
    } as unknown as ILogger;
}

function describeResult(result: IMatchResult | undefined): string {
    if (!result) {
        return 'No response was received from the PhotoDNA API. Check your network connectivity.';
    }
    if (result.Status?.Code === 3000) {
        const source = result.MatchDetails?.MatchFlags?.[0]?.Source ?? 'n/a';
        return `Connection successful. PhotoDNA responded with a valid match (Source: ${source}).`;
    }
    // an error response (e.g. an invalid key) comes back shaped as
    // { statusCode, message } rather than the usual { Status, ... }
    const rawError = result as unknown as { statusCode?: number; message?: string };
    const detail = rawError.message ?? result.Status?.Description ?? 'Unknown error';
    const code = rawError.statusCode ?? result.Status?.Code ?? 'unknown';
    return `PhotoDNA did not return a successful response (code: ${code}). ${detail}`;
}
