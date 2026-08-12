export interface IAdvancedInfo {
    Key: string;
    Value: string;
}

export interface IMatchFlag {
    AdvancedInfo?: Array<IAdvancedInfo>;
    Source?: string;
    Violations?: Array<string>;
    MatchDistance?: number;
}

export interface IMatchDetails {
    MatchFlags: Array<IMatchFlag>;
}

export interface IMatchOperationStatus {
    Code: number;
    Description: string;
    Exception?: string | null;
}

export interface IEvaluateResponse {
    AdultClassificationScore: number;
    IsImageAdultClassified: boolean;
    RacyClassificationScore: number;
    IsImageRacyClassified: boolean;
    Result: boolean;
}

export interface IImageData {
    contentType: string;
    filename: string;
    data: Buffer;
}

export interface IMatchResult {
    Status: IMatchOperationStatus;
    TrackingId: string;
    ContentId?: string;
    IsMatch?: boolean;
    MatchDetails?: IMatchDetails;
    EvaluateResponse?: IEvaluateResponse | null;
    ImageData?: IImageData;
}
