// A model's name as the player says it, on the AI's card and under its analysis (D-81, D-82): the game's PGN keeps the id the host wrote.

/** Who played or reviewed, as the page signs it: the model's name and the effort in the host's word, no other words (Stefano), «Opus 5.5 · xhigh». */
export function signature(model: string, effort?: string): string
{
    return effort === undefined ? modelName(model) : `${modelName(model)} · ${effort}`;
}

/**
 * The name of a Claude model, from its id however the host writes it: claude-opus-5-5, us.anthropic.claude-opus-5-5-20261101-v1:0 and
 * claude-opus-5-5@20261101 are Opus 5.5, claude-3-5-sonnet-20241022 is Sonnet 3.5; an id of another model stays as it is.
 */
export function modelName(id: string): string
{
    const [, family, major, minor] = currentId.exec(id) ?? [];
    const [, oldMajor, oldMinor, oldFamily] = family === undefined ? oldId.exec(id) ?? [] : [];
    const name = family ?? oldFamily;
    const version = [major ?? oldMajor, minor ?? oldMinor].filter((part) => part !== undefined).join(".");
    return name === undefined ? id : `${name[0]!.toUpperCase()}${name.slice(1).toLowerCase()} ${version}`;
}

// The family, then the version, whose minor never runs into the date after it: claude-opus-4-20250514 is Opus 4.
const currentId = /claude-(opus|sonnet|haiku|fable)-(\d{1,2})(?:-(\d{1,2}))?(?!\d)/i;
// Before the fourth generation the version came first.
const oldId = /claude-(\d)(?:-(\d))?-(opus|sonnet|haiku)/i;
