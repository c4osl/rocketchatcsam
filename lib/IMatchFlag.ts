import { IAdvancedInfo } from './IAdvancedInfo';

export interface IMatchFlag {
    AdvancedInfo?: Array<IAdvancedInfo>;
    Source?: string;
    Violations?: Array<string>;
    MatchDistance?: number;
}
