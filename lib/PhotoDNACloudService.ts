import { IHttp, ILogger, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IImageData } from './IImageData';
import { IMatchResult } from './IMatchResult';
import { MatchOutcome } from './MatchOutcome';
import { IMessage } from '@rocket.chat/apps-engine/definition/messages';
import { SETTING_PHOTODNA_API_KEY, SETTING_NCMEC_USER, SETTING_NCMEC_PASSWORD, SETTING_NCMEC_ORGNAME, SETTING_NCMEC_REPORTER_NAME, SETTING_NCMEC_REPORTER_EMAIL, SETTING_NCMEC_ENABLE_TEST_MODE } from '../config/Settings';

/**
 * Microsoft PhotoDNA cloud service
 * @see https://www.microsoft.com/en-us/photodna
 */
export class PhotoDNACloudService {

    private readonly Match_Post_Url = 'https://api.microsoftmoderator.com/photodna/v1.0/Match';
    private readonly Report_Post_Url = 'https://api.microsoftmoderator.com/photodna/v1.0/Report';

    /**
     * Determine whether matchMessage is to be executed, which is the case if this message
     * contains at least one image we can handle
     * @param message
     * @param logger
     */
    public async preMatchMessage(message: IMessage, logger: ILogger): Promise<boolean> {
        if (!message.attachments) {
            return false;
        }

        const hasScannableImage = (message.attachments as Array<any>).some((attachment) => this.isScannableImageAttachment(attachment));
        if (!hasScannableImage) {
            return false;
        }
        logger.debug(`Will attempt to match message from ${message.sender.name} in room #   ${message.room.id} at ${message.createdAt}.`);
        return true;
    }

    /**
     * Matches every scannable image attachment on the message against the PhotoDNA service,
     * one at a time, returning one outcome per attachment. Before executing this method, be
     * sure to call preMatchMessage
     * @param message
     * @param logger
     * @param read
     * @param http
     */
    public async matchMessage(message: IMessage, logger: ILogger, read: IRead, http: IHttp): Promise<Array<MatchOutcome>> {
        const imageAttachments = (message.attachments as Array<any> ?? []).filter((attachment) => this.isScannableImageAttachment(attachment));

        const outcomes: Array<MatchOutcome> = [];
        for (const imageAttachment of imageAttachments) {
            const imageMimeType = imageAttachment.imageType;
            const imageFileName = imageAttachment.title.value;
            // determine image id and load it
            const imageId = imageAttachment.imageUrl.substring(0, imageAttachment.imageUrl.lastIndexOf('/')).replace('/file-upload/', '')
            // TODO better way to find image id?
            const imageBuffer = await read.getUploadReader().getBufferById(imageId)
            if (!imageBuffer) {
                outcomes.push({ verified: false, reason: `Could not load the image buffer for attachment "${imageFileName}".` });
                continue;
            }

            const outcome = await this.performMatchOperation(http, read, {
                contentType: imageMimeType,
                filename: imageFileName,
                data: imageBuffer
            }, logger);
            logger.debug(`Performed match operation on ${imageFileName}. verified: ${outcome.verified}.`);
            outcomes.push(outcome);
        }
        return outcomes;
    }

    /**
     * Performs a match operation against a small sample image, to verify the configured
     * API key and network connectivity without needing a real message attachment.
     * @param http
     * @param read
     * @param logger
     * @param testImageBuffer
     */
    public async checkConnection(http: IHttp, read: IRead, logger: ILogger, testImageBuffer: Buffer): Promise<MatchOutcome> {
        return this.performMatchOperation(http, read, {
            contentType: 'image/jpeg',
            filename: 'photodna-connection-test.jpg',
            data: testImageBuffer,
        }, logger);
    }

    /**
     * Perform the match operation as defined by the PhotoDNA cloud service api
     * @param http
     * @param read
     * @param imageData
     * @see https://developer.microsoftmoderator.com/docs/services/57c7426e2703740ec4c9f4c3/operations/57c7426f27037407c8cc69e6
     */
    private async performMatchOperation(http: IHttp, read: IRead, imageData: IImageData, logger: ILogger): Promise<MatchOutcome> {
        const apiKey = await read.getEnvironmentReader().getSettings().getValueById(SETTING_PHOTODNA_API_KEY);
        if (!apiKey) {
            return { verified: false, reason: 'The "API Subscription Key" setting is not configured.' };
        }

        const content = JSON.stringify({
            'DataRepresentation': 'inline',
            'Value': imageData.data.toString('base64')
        })

        let result;
        try {
            result = await http.post(this.Match_Post_Url, {
                content,
                params: {
                    'enhance': 'false'
                },
                headers: {
                    'Content-Type': 'application/json',
                    'Ocp-Apim-Subscription-Key': apiKey
                }
            })
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            return { verified: false, reason: `A network error occurred while contacting the PhotoDNA API: ${detail}` };
        }

        if (!result) {
            return { verified: false, reason: 'No response was received from the PhotoDNA API.' };
        }

        if (!result.data) {
            return { verified: false, reason: 'The PhotoDNA API response did not include any data.' };
        }

        logger.debug('We received data back from the API:', result.data);
        const data = result.data as Partial<IMatchResult> & { statusCode?: number; message?: string };
        if (data.Status?.Code !== 3000 || typeof data.IsMatch !== 'boolean') {
            const code = data.statusCode ?? data.Status?.Code ?? 'unknown';
            const detail = data.message ?? data.Status?.Description ?? 'unknown error';
            return { verified: false, reason: `PhotoDNA returned an unexpected response (code: ${code}): ${detail}` };
        }

        const matchResult = data as IMatchResult;
        matchResult.ImageData = imageData;
        return { verified: true, result: matchResult };
    }

    /**
     * Report one or more content violations from the same message to NCMEC in a single report
     * @param matchResults
     * @param http
     * @param message
     * @param read
     * @see https://developer.microsoftmoderator.com/docs/services/57c7426e2703740ec4c9f4c3/operations/57c77fdee3a97812ecf8bdeb
     */
    public async performReportOperation(matchResults: Array<IMatchResult>, http: IHttp, message: IMessage, read: IRead): Promise<any> {
        const apiKey = await read.getEnvironmentReader().getSettings().getValueById(SETTING_PHOTODNA_API_KEY);
        const ncmecUser = await read.getEnvironmentReader().getSettings().getValueById(SETTING_NCMEC_USER);
        const ncmecPassword = await read.getEnvironmentReader().getSettings().getValueById(SETTING_NCMEC_PASSWORD);
        const ncmecOrgName = await read.getEnvironmentReader().getSettings().getValueById(SETTING_NCMEC_ORGNAME);
        const ncmecReporterName = await read.getEnvironmentReader().getSettings().getValueById(SETTING_NCMEC_REPORTER_NAME);
        const ncmecReporterEmail = await read.getEnvironmentReader().getSettings().getValueById(SETTING_NCMEC_REPORTER_EMAIL);
        const enableTestMode = await read.getEnvironmentReader().getSettings().getValueById(SETTING_NCMEC_ENABLE_TEST_MODE);
        if (apiKey && ncmecUser && ncmecPassword) {
            const reportBody: Record<string, unknown> = {
                'OrgName': ncmecOrgName,
                'ReporterName': ncmecReporterName,
                'ReporterEmail': ncmecReporterEmail,
                'IncidentTime': (message.createdAt) ? message.createdAt.toISOString() : '',
                'ReporteeName': message.sender.username,
                'ReporteeIPAddress': '127.0.0.1',
                'ViolationContentCollection': matchResults.map((matchResult) => ({
                    'Name': (matchResult.ImageData) ? matchResult.ImageData.filename : 'noFileName',
                    'Value': (matchResult.ImageData) ? matchResult.ImageData.data.toString('base64') : 'noImageData'
                })),
                'AdditionalMetadata': [
                    {
                        'Key': 'IsTest', 'Value': 'true'
                    }
                ]
            };
            if (!enableTestMode) {
                delete reportBody['AdditionalMetadata'];
            }
            const content = JSON.stringify(reportBody);
            const result = await http.post(this.Report_Post_Url, {
                content,
                headers: {
                    'Ocp-Apim-Subscription-Key': apiKey,
                    'x-usr': ncmecUser,
                    'x-pwd': ncmecPassword
                }
            });
            return result;
        }
    }

    public isSupportedImageMimeType(mimeType: string): boolean {
        switch (mimeType) {
            case ('image/gif'):
            case ('image/jpeg'):
            case ('image/png'):
            case ('image/bmp'):
            case ('image/tiff'):
                return true;
        }
        return false;
    }

    /**
     * The single source of truth for whether an attachment is one PhotoDNA can scan,
     * shared by preMatchMessage and matchMessage so their filtering can't drift apart.
     * @param attachment
     */
    private isScannableImageAttachment(attachment: any): boolean {
        return Boolean(attachment.imageUrl) && this.isSupportedImageMimeType(attachment.imageType);
    }
}
