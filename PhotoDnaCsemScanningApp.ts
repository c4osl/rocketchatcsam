import {
    IAppAccessors,
    ILogger,
    IConfigurationExtend,
    IEnvironmentRead,
    IRead,
    IHttp,
    IPersistence,
    IMessageBuilder,
    IConfigurationModify,
} from '@rocket.chat/apps-engine/definition/accessors';
import { App } from '@rocket.chat/apps-engine/definition/App';
import { IMessage, IPreMessageSentModify } from '@rocket.chat/apps-engine/definition/messages';
import { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';
import { SettingType, ISetting } from '@rocket.chat/apps-engine/definition/settings';

import { PhotoDNACloudService } from './lib/PhotoDNACloudService';
import { IMatchResult } from './lib/IMatchResult';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms/IRoom';
import { SETTING_PHOTODNA_API_KEY, SETTING_QUARANTINE_CHANNEL, SETTING_LIMIT_ANALYSIS_TO_CHANNELS, SETTING_WATCH_DMS, SETTING_NCMEC_USER, SETTING_NCMEC_PASSWORD, SETTING_ENABLE_AUTOMATED_REPORT, SETTING_NCMEC_ORGNAME, SETTING_NCMEC_REPORTER_NAME, SETTING_NCMEC_REPORTER_EMAIL, SETTING_NCMEC_ENABLE_TEST_MODE } from './config/Settings';

export class PhotoDnaCsemScanningApp extends App implements IPreMessageSentModify {

    private photoDnaService: PhotoDNACloudService;

    private quarantineChannel: string;
    private enableAutomatedReport: boolean;
    private watchedRoomsId: Set<string> | undefined;
    private watchDMs: boolean;

    public constructor(info: IAppInfo, logger: ILogger, accessors: IAppAccessors) {
        super(info, logger, accessors);
        this.photoDnaService = new PhotoDNACloudService();
    }

    protected async extendConfiguration(configuration: IConfigurationExtend, _environmentRead: IEnvironmentRead): Promise<void> {
        await configuration.settings.provideSetting({
            id: SETTING_PHOTODNA_API_KEY,
            type: SettingType.STRING,
            packageValue: '',
            required: true,
            public: false,
            i18nLabel: 'CSEM_Api_Key_Label',
            i18nDescription: 'CSEM_Api_Key_Description',
        });
        await configuration.settings.provideSetting({
            id: SETTING_QUARANTINE_CHANNEL,
            type: SettingType.STRING,
            packageValue: 'csem-quarantine',
            required: true,
            public: false,
            i18nLabel: 'CSEM_Quarantine_Target_Channel_Label',
            i18nDescription: 'CSEM_Quarantine_Target_Channel_Description',
        });
        await configuration.settings.provideSetting({
            id: SETTING_LIMIT_ANALYSIS_TO_CHANNELS,
            type: SettingType.STRING,
            packageValue: '',
            required: true,
            public: false,
            i18nLabel: 'CSEM_Limit_Analysis_To_Channels_Csv_Label',
            i18nDescription: 'CSEM_Limit_Analysis_To_Channels_Csv_Description',
        });
        await configuration.settings.provideSetting({
            id: SETTING_WATCH_DMS,
            type: SettingType.BOOLEAN,
            packageValue: false,
            required: true,
            public: false,
            i18nLabel: 'CSEM_Watch_DMs_Label',
            i18nDescription: 'CSEM_Watch_DMs_Description',
        });
        await configuration.settings.provideSetting({
            id: SETTING_ENABLE_AUTOMATED_REPORT,
            type: SettingType.BOOLEAN,
            packageValue: false,
            required: true,
            public: false,
            i18nLabel: 'CSEM_Enable_Automated_Report_Label',
            i18nDescription: 'CSEM_Enable_Automated_Report_Description',
        });
        await configuration.settings.provideSetting({
            id: SETTING_NCMEC_ORGNAME,
            type: SettingType.STRING,
            packageValue: 'TestOrg',
            required: true,
            public: false,
            i18nLabel: 'CSEM_NCMEC_OrgName_Label',
            i18nDescription: 'CSEM_NCMEC_OrgName_Description',
        });
        await configuration.settings.provideSetting({
            id: SETTING_NCMEC_REPORTER_NAME,
            type: SettingType.STRING,
            packageValue: 'ReporterName',
            required: true,
            public: false,
            i18nLabel: 'CSEM_NCMEC_ReporterName_Label',
            i18nDescription: 'CSEM_NCMEC_ReporterName_Description',
        });
        await configuration.settings.provideSetting({
            id: SETTING_NCMEC_REPORTER_EMAIL,
            type: SettingType.STRING,
            packageValue: 'test@example.org',
            required: true,
            public: false,
            i18nLabel: 'CSEM_NCMEC_ReporterEmail_Label',
            i18nDescription: 'CSEM_NCMEC_ReporterEmail_Description',
        });
        await configuration.settings.provideSetting({
            id: SETTING_NCMEC_USER,
            type: SettingType.STRING,
            packageValue: '',
            required: true,
            public: false,
            i18nLabel: 'CSEM_NCMEC_User_Label',
            i18nDescription: 'CSEM_NCMEC_User_Description',
        });
        await configuration.settings.provideSetting({
            id: SETTING_NCMEC_PASSWORD,
            type: SettingType.STRING,
            packageValue: '',
            required: true,
            public: false,
            i18nLabel: 'CSEM_NCMEC_Password_Label',
            i18nDescription: 'CSEM_NCMEC_Password_Description',
        });
        await configuration.settings.provideSetting({
            id: SETTING_NCMEC_ENABLE_TEST_MODE,
            type: SettingType.BOOLEAN,
            packageValue: true,
            required: true,
            public: false,
            i18nLabel: 'CSEM_NCMEC_TestMode_Label',
            i18nDescription: 'CSEM_NCMEC_TestMode_Description',
        });
    }

    public async onEnable(environment: IEnvironmentRead, _configurationModify: IConfigurationModify): Promise<boolean> {
        this.quarantineChannel = await environment.getSettings().getValueById(SETTING_QUARANTINE_CHANNEL);
        this.enableAutomatedReport = await environment.getSettings().getValueById(SETTING_ENABLE_AUTOMATED_REPORT);
        const limitRoomNamesCsv = await environment.getSettings().getValueById(SETTING_LIMIT_ANALYSIS_TO_CHANNELS);
        this.initLimitRoomNamesSet(limitRoomNamesCsv);
        this.watchDMs = await environment.getSettings().getValueById(SETTING_WATCH_DMS);
        return true;
    }

    public async onSettingUpdated(setting: ISetting, _configurationModify: IConfigurationModify, _read: IRead, _http: IHttp): Promise<void> {
        if (SETTING_QUARANTINE_CHANNEL === setting.id) {
            this.quarantineChannel = setting.value;
        } else if (SETTING_LIMIT_ANALYSIS_TO_CHANNELS === setting.id) {
            await this.initLimitRoomNamesSet(setting.value);
        } else if (SETTING_WATCH_DMS === setting.id) {
            this.watchDMs = setting.value;
        } else if (SETTING_ENABLE_AUTOMATED_REPORT === setting.id) {
            this.enableAutomatedReport = setting.value;
        }
    }

    private async initLimitRoomNamesSet(limitRoomNamesCsv: string) {
        this.watchedRoomsId = undefined;
        if (limitRoomNamesCsv && limitRoomNamesCsv.length > 0) {
            this.watchedRoomsId = new Set<string>();
            const _csvRoomNames = limitRoomNamesCsv.trim();
            const _csvRoomsArray = _csvRoomNames.split(',');
            for (const roomName of _csvRoomsArray) {
                const room = await this.getAccessors().reader.getRoomReader().getByName(roomName.toLowerCase());
                if (room) {
                    this.getLogger().debug(`Watching room '${roomName}'`);
                    this.watchedRoomsId!.add(room.id);
                } else {
                    this.getLogger().warn(`Room not found for name '${roomName}'. Not adding to watch list.`);
                }
            }
        }
    }

    public async checkPreMessageSentModify(message: IMessage, _read: IRead, _http: IHttp): Promise<boolean> {
        // https://developer.rocket.chat/reference/api/schema-definition/room
        const roomTypes = {
            dm: 'd',
            chatroom: 'c',
            private: 'p',
            livechat: 'l',
        };
        if (
            this.watchedRoomsId === undefined
            || this.watchedRoomsId.size === 0
            || this.watchedRoomsId.has(message.room.id)
            || (this.watchDMs && message.room.type === roomTypes.dm)
        ) {
            return this.photoDnaService.preMatchMessage(message, this.getLogger());
        } else {
            return false;
        }
    }

    public async executePreMessageSentModify(
        message: IMessage,
        builder: IMessageBuilder,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
    ): Promise<IMessage> {
        const logger = this.getLogger();
        const result = await this.photoDnaService.matchMessage(message, logger, read, http);
        if (result && result.IsMatch) {
            this.handleMatchingMessage(result, message, read, persistence, builder, http, logger);
        }
        return builder.getMessage();
    }

    private async handleMatchingMessage(
        matchResult: IMatchResult,
        message: IMessage,
        read: IRead,
        persistence: IPersistence,
        builder: IMessageBuilder,
        http: IHttp,
        logger: ILogger,
    ): Promise<void> {
        logger.warn(
            'CSEM-MATCH',
            `enable automated report: ${this.enableAutomatedReport}`,
            `message ID: ${message.id}`,
            message.sender,
            JSON.stringify(matchResult),
        );

        if (this.quarantineChannel) {
            const targetRoom: IRoom | undefined = await read.getRoomReader().getByName(this.quarantineChannel);
            if (targetRoom) {
                // we have a target room - move it to this room
                // the original user uploading currently does not get notified
                builder.setRoom(targetRoom);
            } else {
                logger.warn('Defined target Room/Channel does not exist: ' + this.quarantineChannel);
                // we have no target room - at least remove the image
                builder.removeAttachment(0);
            }
        } else {
            logger.warn('No target channel for quarantined messages provided');
        }

        if (this.enableAutomatedReport) {
            const result = await this.photoDnaService.performReportOperation(matchResult, http, message, read);
            logger.warn('Violation-Report-Result', result);
        }
    }

}
