import { IImageData } from './IImageData';

export interface IMatchResult {
    Status: IMatchOperationStatus;
    TrackingId: string;
    ContentId?: string;
    IsMatch?: boolean;
    MatchDetails?: IMatchDetails;
    ImageData?: IImageData;
}

export interface IMatchOperationStatus {
    Code: number;
    Description: string;
}

export interface IMatchDetails {
    MatchFlags: Array<IMatchFlag>;
}

export interface IMatchFlag {
    AdvancedInfo?: Array<IAdvancedInfo>;
    Source?: string;
    Violations?: Array<string>;
}

export interface IAdvancedInfo {
    Key: string;
    Value: string;
}
