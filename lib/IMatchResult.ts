import { IImageData } from './IImageData';
import { IMatchOperationStatus } from './IMatchOperationStatus';
import { IMatchDetails } from './IMatchDetails';

export interface IMatchResult {
    Status: IMatchOperationStatus;
    TrackingId: string;
    ContentId?: string;
    IsMatch?: boolean;
    MatchDetails?: IMatchDetails;
    ImageData?: IImageData;
}
