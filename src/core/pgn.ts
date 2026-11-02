// PGN in and out, our own: chess.js drops NAGs and variations. Every move read is checked by a Game.
import { Game } from "./game.ts";
import { cleanComment, type GameRecord, recordedMove } from "./record.ts";

/**
 * A game as PGN: the seven standard tags first, then its others (SetUp before a FEN), the moves with their judgments, in lines under 80 characters.
 * The judgments $1 to $6 are written as !, ?, !!, ??, !? and ?!, which players read and every tool takes.
 */
export function writePgn(record: GameRecord): string
{
    const roster = sevenTags.map(([name, unknown]) => tagLine(name, record.tags[name] ?? unknown));
    // SetUp goes first, before the FEN it announces.
    const { SetUp: setUp = record.tags.FEN === undefined ? undefined : "1", ...tags } = record.tags;
    const others = Object.entries(setUp === undefined ? tags : { SetUp: setUp, ...tags }).filter(([name]) => !sevenTagNames.has(name)).map(([name, value]) => tagLine(name, value));
    return `${[...roster, ...others].join("\n")}\n\n${wrapped(movetext(record))}\n`;
}

/** The games of a PGN text, with their tags, moves, NAGs (! and ? too) and comments; variations are skipped. Every move is checked: an error names its line. */
export function readPgn(text: string): GameRecord[]
{
    return new PgnReader(text).read();
}

/** The day of a date, in its own time zone, as PGN's Date tag writes it: 2026.11.02. */
export function pgnDate(date: Date): string
{
    const two = (value: number): string => String(value).padStart(2, "0");
    return `${date.getFullYear()}.${two(date.getMonth() + 1)}.${two(date.getDate())}`;
}

// The seven tags of every PGN, in their order, with the value for an unknown one.
const sevenTags = [["Event", "?"], ["Site", "?"], ["Date", "????.??.??"], ["Round", "?"], ["White", "?"], ["Black", "?"], ["Result", "*"]] as const;
const sevenTagNames = new Set<string>(sevenTags.map(([name]) => name));

// The judgments written after a move, NAGs $1 to $6.
const glyphs = ["!", "?", "!!", "??", "!?", "?!"];
const nagOfGlyph = new Map(glyphs.map((glyph, index) => [glyph, index + 1]));

// The standard wants lines under 80 characters.
const lineLength = 79;

// A token: spaces, a % escape line, a ; comment, a tag, a { comment }, a NAG, a parenthesis, a move number, a result, a move.
const tokenPattern = /\s+|(?<![^\n])%[^\n]*|;[^\n]*|\[\s*(\w+)\s*"((?:[^"\\]|\\.)*)"\s*\]|\{([^}]*)\}|\$(\d+)|([()])|\d+\s*\.+|\.+|(1-0|0-1|1\/2-1\/2|\*)|([^\s{}()[\]";$]+)/y;

interface DraftMove
{
    readonly san: string;
    readonly nags: number[];
    readonly comments: string[];
}

class PgnReader
{
    private readonly text: string;
    private readonly records: GameRecord[] = [];
    private tags: [string, string][] = [];
    private comments: string[] = [];
    private moves: DraftMove[] = [];
    private game: Game | undefined;
    private result: string | undefined;
    private depth = 0;
    private at = 0;

    constructor(text: string)
    {
        this.text = text;
    }

    read(): GameRecord[]
    {
        for (let index = 0; index < this.text.length; index = tokenPattern.lastIndex) {
            tokenPattern.lastIndex = index;
            const match = tokenPattern.exec(this.text);

            if (match === null) {
                const character = this.text[index];
                throw this.error(index, character === "{" ? "this comment is never closed with }." : `"${character}" is not PGN: remove it.`);
            }

            this.at = index;
            this.take(match);
        }

        if (this.depth > 0) {
            throw this.error(this.text.length, "a variation is never closed with ).");
        }

        this.finish();
        return this.records;
    }

    private take([, tagName, tagValue = "", comment, nag, parenthesis, result, move]: RegExpExecArray): void
    {
        if (parenthesis !== undefined) {
            this.depth += parenthesis === "(" ? 1 : -1;

            if (this.depth < 0) {
                throw this.error(this.at, "this ) closes no variation: remove it.");
            }

            return;
        }

        // Inside a variation, everything is skipped.
        if (this.depth > 0) {
            return;
        }

        if (tagName !== undefined) {
            this.tag(tagName, tagValue.replace(/\\(.)/g, "$1"));
        } else if (comment !== undefined) {
            this.started();
            (this.moves.at(-1)?.comments ?? this.comments).push(comment);
        } else if (nag !== undefined) {
            this.nag(Number(nag));
        } else if (result !== undefined) {
            this.started();
            this.result = result;
            this.finish();
        } else if (move !== undefined) {
            this.move(move);
        }
    }

    private tag(name: string, value: string): void
    {
        // A tag after the moves starts the next game, when the last one had no result.
        if (this.game !== undefined) {
            this.finish();
        }

        this.tags.push([name, value]);
    }

    private move(token: string): void
    {
        // "e.p." after an en passant capture says nothing more.
        if (/^e\.?p\.?$/i.test(token)) {
            return;
        }

        const [, san = "", glyph = ""] = /^(.*?)([!?]*)$/.exec(token) ?? [];
        const game = this.started();

        if (san !== "") {
            const played = game.playRecorded(san);

            if (!played.played) {
                throw this.error(this.at, played.message, game.position.moveNumber);
            }

            this.moves.push({ san: played.move.san, nags: [], comments: [] });
        }

        if (glyph !== "") {
            const nag = nagOfGlyph.get(glyph);

            if (nag === undefined) {
                throw this.error(this.at, `"${glyph}" is not a judgment: write !, ?, !!, ??, !? or ?!.`);
            }

            this.nag(nag);
        }
    }

    private nag(nag: number): void
    {
        if (nag > 255) {
            throw this.error(this.at, `$${nag} is not a NAG: NAGs go from $0 to $255.`);
        }

        this.started();
        // A NAG before the first move judges nothing: skipped.
        this.moves.at(-1)?.nags.push(nag);
    }

    /** The game the moves are played on, made from the tags at the first move. */
    private started(): Game
    {
        if (this.game === undefined) {
            try {
                this.game = new Game({ tags: Object.fromEntries(this.tags), moves: [] });
            } catch (error) {
                throw this.error(this.at, (error as Error).message);
            }
        }

        return this.game;
    }

    private finish(): void
    {
        if (this.tags.length > 0 || this.moves.length > 0 || this.result !== undefined) {
            this.started();
            const tags: Record<string, string> = Object.fromEntries(this.tags);

            if (tags.Result === undefined && this.result !== undefined) {
                tags.Result = this.result;
            }

            const moves = Object.freeze(this.moves.map((move) => recordedMove(move.san, move.nags, move.comments.join(" "))));
            const comment = cleanComment(this.comments.join(" ")) || undefined;
            this.records.push(Object.freeze(comment === undefined ? { tags: Object.freeze(tags), moves } : { tags: Object.freeze(tags), comment, moves }));
        }

        this.tags = [];
        this.comments = [];
        this.moves = [];
        this.game = undefined;
        this.result = undefined;
    }

    private error(index: number, message: string, moveNumber?: number): Error
    {
        const line = this.text.slice(0, index).split("\n").length;
        return new Error(`Line ${line}${moveNumber === undefined ? "" : `, move ${moveNumber}`}: ${message}`);
    }
}

function movetext(record: GameRecord): string[]
{
    const [, turn, , , , number] = (record.tags.FEN ?? "").split(" ");
    const tokens = commentTokens(record.comment);
    let moveNumber = Number(number) || 1;
    let white = turn !== "b";
    // Black's move carries its number at the start and after a comment or a NAG of its own.
    let annotated = true;

    for (const move of record.moves) {
        if (white) {
            tokens.push(`${moveNumber}.`);
        } else if (annotated) {
            tokens.push(`${moveNumber}...`);
        }

        const glyph = move.nags?.find((nag) => nag >= 1 && nag <= glyphs.length);
        const nags = (move.nags ?? []).filter((nag) => nag !== glyph).map((nag) => `$${nag}`);
        const comment = commentTokens(move.comment);
        tokens.push(glyph === undefined ? move.san : `${move.san}${glyphs[glyph - 1]}`, ...nags, ...comment);
        annotated = nags.length > 0 || comment.length > 0;
        moveNumber += white ? 0 : 1;
        white = !white;
    }

    tokens.push(record.tags.Result ?? "*");
    return tokens;
}

/** A comment as PGN tokens, cleaned for a record written by hand; none for no comment. */
function commentTokens(comment: string | undefined): string[]
{
    const text = cleanComment(comment ?? "");
    return text === "" ? [] : `{${text}}`.split(" ");
}

function tagLine(name: string, value: string): string
{
    return `[${name} "${value.replace(/\s*[\r\n]+\s*/g, " ").replace(/[\\"]/g, "\\$&")}"]`;
}

function wrapped(tokens: string[]): string
{
    const lines: string[] = [];
    let line = "";

    for (const token of tokens) {
        if (line !== "" && line.length + 1 + token.length > lineLength) {
            lines.push(line);
            line = token;
        } else {
            line = line === "" ? token : `${line} ${token}`;
        }
    }

    lines.push(line);
    return lines.join("\n");
}
