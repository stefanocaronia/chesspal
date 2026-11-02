/** What a command runs with, besides its input: given by the command line or the MCP server, and by the tests. */
export interface Context
{
    /** The folder Chesspal runs in: the player's, where the AI host started it. */
    folder: string;
    /** A number from 0 to 1, as Math.random gives: the colour drawn for the AI. */
    random: () => number;
    /** The time now: when a game starts. */
    now: () => Date;
}

/** The context of a process started in the player's folder. */
export function defaultContext(): Context
{
    return { folder: process.cwd(), random: Math.random, now: () => new Date() };
}
