// Which of a site's ratings counts (D-106): the rapid, and when it is missing or provisional the classical, then the blitz.
import { type Speed, speeds } from "../profiles/index.ts";

/** A site's rating at one speed, as it gives it: established once it is no longer provisional. */
export interface Candidate
{
    readonly value: number;
    readonly deviation: number;
    readonly established: boolean;
    readonly played?: string;
}

/** The rating that counts, with its speed. */
export interface Played
{
    readonly speed: Speed;
    readonly value: number;
    readonly deviation: number;
    readonly played?: string;
}

/** The first established rating in the order the speeds count: none when every one is missing or provisional. */
export function counted(at: (speed: Speed) => Candidate | undefined): Played | undefined
{
    for (const speed of speeds) {
        const candidate = at(speed);

        if (candidate?.established === true) {
            const { value, deviation, played } = candidate;
            return { speed, value: Math.round(value), deviation: Math.round(deviation), ...(played === undefined ? {} : { played }) };
        }
    }

    return undefined;
}
