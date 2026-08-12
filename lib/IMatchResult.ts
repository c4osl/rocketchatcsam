import {IImageData} from "./IImageData";
import {IMatchOperationStatus} from "./IMatchOperationStatus";
import {IMatchDetails} from "./IMatchDetails";
import {IEvaluateResponse} from "./IEvaluateResponse";

export interface IMatchResult {
    Status: IMatchOperationStatus;
    TrackingId: string;
    ContentId?: string;
    IsMatch?: boolean;
    MatchDetails?: IMatchDetails;
    EvaluateResponse?: IEvaluateResponse | null;
    ImageData?: IImageData;
}
