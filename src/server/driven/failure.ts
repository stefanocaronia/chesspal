// What the table tells apart of why a chat it drives failed, read in one place from the words its driver passes on from the host.
import type { ChatFailure, FailureCode } from "../page/index.ts";

/** The failure numbered `number`, coded from the host's words; the words a player reads when the host's program ended by itself, its code kept at the end. */
export function failureOf(why: string, number: number): ChatFailure
{
    const code = failureCode(why);
    const ended = /^the host's program ended \(([^)]*)\)(.*)$/s.exec(why);
    const said = code === "program-ended" && ended !== null
        ? `The chat's program stopped by itself: open the chat again from the board page.${ended[2]!.trim() === "" ? "" : ` It said: ${ended[2]!.replace(/^[:\s]+/, "")}`} (${ended[1]})`
        : why;
    return { why: said, code, number };
}

/** The code of a host's words: the account's sign-in and limits first, as a program that ended may say why after its exit code. */
export function failureCode(why: string): FailureCode
{
    if (/not logged in|please run \/login|invalid api key|oauth token (?:has )?expired|authentication_error/i.test(why)) {
        return "not-signed-in";
    }

    if (/usage limit|limit reached|hit your (?:usage )?limit|credit balance is too low|out of (?:extra )?usage/i.test(why)) {
        return "usage-limit";
    }

    if (/\bENOENT\b|program is not on this computer|program was not found/i.test(why)) {
        return "program-missing";
    }

    if (/^the host's program ended\b/i.test(why)) {
        return "program-ended";
    }

    return "other";
}
