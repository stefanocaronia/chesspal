// Who plays as the AI (D-82): the model and effort the host tied to its last move, kept in this process's memory and never in a file, since only the
// MCP server reads them; the command line knows none.
import type { AiModel } from "../core/index.ts";

/** Notes the AI's model for the games of a folder, after its move: a change shows from the next move. Whether it changed. */
export function noteAiModel(folder: string, noted: AiModel): boolean
{
    const known = models.get(folder);

    if (known?.model === noted.model && known.effort === noted.effort) {
        return false;
    }

    models.set(folder, noted);
    return true;
}

/** The AI's model last noted for the games of a folder in this process; none on the command line, or before the AI's first move. */
export function aiModelOf(folder: string): AiModel | undefined
{
    return models.get(folder);
}

// By the game's folder, the profile's, where the games are archived.
const models = new Map<string, AiModel>();
