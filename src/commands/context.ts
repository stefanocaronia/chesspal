/** What a command runs with, besides its input: given by the command line or the MCP server, and by the tests. */
export interface Context
{
    /** The folder Chesspal runs in: the player's, where the AI host started it. */
    folder: string;
}

/** The context of a process started in the player's folder. */
export function defaultContext(): Context
{
    return { folder: process.cwd() };
}
