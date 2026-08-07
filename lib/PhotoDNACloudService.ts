import { IHttp, ILogger, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IImageData } from './IImageData';
import { IMatchResult } from './IMatchResult';
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
     * contains an image we can handle
     * @param message
     * @param logger
     */
    public async preMatchMessage(message: IMessage, logger: ILogger): Promise<boolean> {
        // is there an attachment ?
        if (!message.attachments) {
            return false;
        }
        // is it an image ?
        if (!message.attachments[0].imageUrl) {
            return false;
        }

        const imageAttachment: any = message.attachments[0];
        const imageMimeType = imageAttachment.imageType;
        // does the PhotoDNA service support this attachment ?
        if (!this.isSupportedImageMimeType(imageMimeType)) {
            logger.warn('Could not perform match operation on unsupported image type ' + imageMimeType);
            return false;
        }
        logger.debug(`Will attempt to match message from ${message.sender.name} in room #   ${message.room.id} at ${message.createdAt}.`);
        return true;
    }

    /**
     * Matches the message against the PhotoDNA service. Before executing this method, be sure to call preMatchMessage
     * @param message
     * @param logger
     * @param read
     * @param http
     */
    public async matchMessage(message: IMessage, logger: ILogger, read: IRead, http: IHttp): Promise<IMatchResult | undefined> {
        const imageAttachment: any = message.attachments![0];
        const imageMimeType = imageAttachment.imageType;
        const imageFileName = imageAttachment.title.value;
        // determine image id and load it
        const imageId = imageAttachment.imageUrl.substring(0, imageAttachment.imageUrl.lastIndexOf('/')).replace('/file-upload/', '')
        // TODO better way to find image id?
        const imageBuffer = await read.getUploadReader().getBufferById(imageId)
        if (!imageBuffer) {
            logger.warn('Could not load image buffer for image id ' + imageId);
            return undefined;
        }

        const result = await this.performMatchOperation(http, read, {
            contentType: imageMimeType,
            filename: imageFileName,
            data: imageBuffer
        }, logger);
        logger.debug(`Performed match operation on ${imageFileName} with match result: ${result?.IsMatch}.`);
        return result;
    }

    /**
     * Performs a match operation against a small sample image, to verify the configured
     * API key and network connectivity without needing a real message attachment.
     * @param http
     * @param read
     * @param logger
     * @param testImageBuffer
     */
    public async checkConnection(http: IHttp, read: IRead, logger: ILogger, testImageBuffer: Buffer): Promise<IMatchResult | undefined> {
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
    private async performMatchOperation(http: IHttp, read: IRead, imageData: IImageData, logger: ILogger): Promise<IMatchResult | undefined> {
        const apiKey = await read.getEnvironmentReader().getSettings().getValueById(SETTING_PHOTODNA_API_KEY);
        if (!apiKey) {
            logger.warn('SETTING_PHOTODNA_API_KEY was not found in environment.')
            return undefined;
        }

        const content = JSON.stringify({
            'DataRepresentation': 'inline',
            'Value': imageData.data.toString('base64')
        })

        const result = await http.post(this.Match_Post_Url, {
            content,
            params: {
                'enhance': 'false'
            },
            headers: {
                'Content-Type': 'application/json',
                'Ocp-Apim-Subscription-Key': apiKey
            }
        })

        if (!result) {
            logger.warn('We did not receive a response from the PhotoDNA API.')
            return undefined;
        }

        if (!result.data) {
            logger.warn('We received a response from the API, but it does not contain data.');
            return undefined;
        }

        logger.debug('We received data back from the API:', result.data);
        const matchResult = result.data as IMatchResult;
        matchResult.ImageData = imageData;
        return matchResult;
    }

    /**
     * Report a content violation to NCMEC
     * @param matchResult
     * @param http
     * @param message
     * @param read
     * @see https://developer.microsoftmoderator.com/docs/services/57c7426e2703740ec4c9f4c3/operations/57c77fdee3a97812ecf8bdeb
     */
    public async performReportOperation(matchResult: IMatchResult, http: IHttp, message: IMessage, read: IRead): Promise<any> {
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
                'ViolationContentCollection': [
                    {
                        'Name': (matchResult.ImageData) ? matchResult.ImageData.filename : 'noFileName',
                        'Value': (matchResult.ImageData) ? matchResult.ImageData.data.toString('base64') : 'noImageData'
                    }
                ],
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
}
