import {
    IConfigurationExtend,
    IEnvironmentRead,
    IRead,
    IHttp,
    IPersistence,
    IMessageBuilder,
    IConfigurationModify,
} from "@rocket.chat/apps-engine/definition/accessors";
import {App} from "@rocket.chat/apps-engine/definition/App";
import {
    IMessage,
    IPreMessageSentModify,
} from "@rocket.chat/apps-engine/definition/messages";
import {ISetting} from "@rocket.chat/apps-engine/definition/settings";

import {IMatchResult} from "./lib/IMatchResult";
import {settingDefinitions} from "./config/settingDefinitions";
import {
    SETTING_QUARANTINE_CHANNEL,
    SETTING_LIMIT_ANALYSIS_TO_CHANNELS,
    SETTING_WATCH_DMS,
    SETTING_ENABLE_AUTOMATED_REPORT,
} from "./config/Settings";
import {PhotoDNACloudService} from "./lib/PhotoDNACloudService";
import {handleIndeterminateResult} from "./lib/handleIndeterminateResult";
import {handleMatchingMessage} from "./lib/handleMatchingMessage";
import {resolveQuarantineRoomId} from "./lib/resolveQuarantineRoomId";
import {resolveWatchedRoomIds} from "./lib/resolveWatchedRoomIds";
import {PhotoDnaTestConnectionCommand} from "./commands/PhotoDnaTestConnectionCommand";

// https://developer.rocket.chat/reference/api/schema-definition/room
const ROOM_TYPES = Object.freeze({
    dm: "d",
    chatroom: "c",
    private: "p",
    livechat: "l",
});

export class PhotoDnaScanningApp extends App implements IPreMessageSentModify {
    private lazyPhotoDnaService: PhotoDNACloudService | undefined;

    private quarantineChannel: string;
    private quarantineRoomId: string | undefined;
    private enableAutomatedReport: boolean;
    private watchedRoomsId: Set<string> | undefined;
    private watchDMs: boolean;

    private get photoDnaService(): PhotoDNACloudService {
        if (!this.lazyPhotoDnaService) {
            this.lazyPhotoDnaService = new PhotoDNACloudService();
        }
        return this.lazyPhotoDnaService;
    }

    protected async extendConfiguration(
        configuration: IConfigurationExtend,
        _environmentRead: IEnvironmentRead,
    ): Promise<void> {
        for (const setting of settingDefinitions) {
            await configuration.settings.provideSetting(setting);
        }
        await configuration.slashCommands.provideSlashCommand(
            new PhotoDnaTestConnectionCommand(),
        );
    }

    public async onEnable(
        environment: IEnvironmentRead,
        _configurationModify: IConfigurationModify,
    ): Promise<boolean> {
        this.quarantineChannel = await environment
            .getSettings()
            .getValueById(SETTING_QUARANTINE_CHANNEL);
        this.quarantineRoomId = await resolveQuarantineRoomId(
            this.quarantineChannel,
            this.getAccessors().reader,
            this.getLogger(),
        );
        this.enableAutomatedReport = await environment
            .getSettings()
            .getValueById(SETTING_ENABLE_AUTOMATED_REPORT);
        const limitRoomNamesCsv = await environment
            .getSettings()
            .getValueById(SETTING_LIMIT_ANALYSIS_TO_CHANNELS);
        this.watchedRoomsId = await resolveWatchedRoomIds(
            limitRoomNamesCsv,
            this.getAccessors().reader,
            this.getLogger(),
        );
        this.watchDMs = await environment
            .getSettings()
            .getValueById(SETTING_WATCH_DMS);
        return true;
    }

    public async onSettingUpdated(
        setting: ISetting,
        _configurationModify: IConfigurationModify,
        read: IRead,
        _http: IHttp,
    ): Promise<void> {
        if (SETTING_QUARANTINE_CHANNEL === setting.id) {
            this.quarantineChannel = setting.value;
            this.quarantineRoomId = await resolveQuarantineRoomId(
                this.quarantineChannel,
                read,
                this.getLogger(),
            );
        } else if (SETTING_LIMIT_ANALYSIS_TO_CHANNELS === setting.id) {
            this.watchedRoomsId = await resolveWatchedRoomIds(
                setting.value,
                read,
                this.getLogger(),
            );
        } else if (SETTING_WATCH_DMS === setting.id) {
            this.watchDMs = setting.value;
        } else if (SETTING_ENABLE_AUTOMATED_REPORT === setting.id) {
            this.enableAutomatedReport = setting.value;
        }
    }

    public async checkPreMessageSentModify(
        message: IMessage,
        _read: IRead,
        _http: IHttp,
    ): Promise<boolean> {
        if (
            this.watchedRoomsId === undefined ||
            this.watchedRoomsId.size === 0 ||
            this.watchedRoomsId.has(message.room.id) ||
            (this.watchDMs && message.room.type === ROOM_TYPES.dm)
        ) {
            return this.photoDnaService.preMatchMessage(
                message,
                this.getLogger(),
            );
        } else {
            return false;
        }
    }

    public async executePreMessageSentModify(
        message: IMessage,
        builder: IMessageBuilder,
        read: IRead,
        http: IHttp,
        _persistence: IPersistence,
    ): Promise<IMessage> {
        const logger = this.getLogger();
        const attachmentOutcomes = await this.photoDnaService.matchMessage(
            message,
            logger,
            read,
            http,
        );

        const matchedResults: Array<IMatchResult> = [];
        const matchedAttachmentIndexes: Array<number> = [];
        const unverifiedReasons: Array<string> = [];
        const unverifiedAttachmentIndexes: Array<number> = [];
        for (const {attachmentIndex, outcome} of attachmentOutcomes) {
            if (outcome.verified) {
                if (outcome.result.IsMatch) {
                    matchedResults.push(outcome.result);
                    matchedAttachmentIndexes.push(attachmentIndex);
                }
            } else {
                unverifiedReasons.push(outcome.reason);
                unverifiedAttachmentIndexes.push(attachmentIndex);
            }
        }

        if (matchedResults.length > 0) {
            await handleMatchingMessage(
                matchedResults,
                matchedAttachmentIndexes,
                message,
                read,
                builder,
                http,
                logger,
                this.quarantineRoomId,
                this.enableAutomatedReport,
                this.photoDnaService,
            );
        } else if (unverifiedReasons.length > 0) {
            await handleIndeterminateResult(
                unverifiedReasons.join(" | "),
                unverifiedAttachmentIndexes,
                message,
                read,
                builder,
                logger,
                this.quarantineRoomId,
            );
        }
        return builder.getMessage();
    }
}
