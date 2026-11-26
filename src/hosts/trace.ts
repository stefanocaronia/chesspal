// A trace of a chat's lines, for whoever looks into a problem at the table: every line written to the host and read from it, in a file the table names.
import { appendFileSync, existsSync } from "node:fs";
import type { LineProcess } from "./process.ts";

// The first line of a new trace, so that whoever opens it, or is sent it, knows what it holds.
const traceWarning = "This file copies every line between Chesspal and the AI app: it may hold the name of your account and the whole chat. Read it before you share it.";

/** What adds a line to the trace's file, with its way and time: nothing without one, and a write that fails is let go, never the chat. */
export function traceTo(file: string | undefined): (way: "in" | "out" | "err", line: string) => void
{
    if (file === undefined) {
        return () => undefined;
    }

    return (way, line) => {
        try {
            const entry = `${JSON.stringify({ t: new Date().toISOString(), dir: way, line })}\n`;
            appendFileSync(file, existsSync(file) ? entry : `${JSON.stringify({ warning: traceWarning })}\n${entry}`);
        } catch {
            // The trace is for whoever looks into a problem: a chat never stops for it.
        }
    };
}

/** The host's process, every line written to it ("in") and read from it ("out") added to the trace first. */
export function tracedProcess(host: LineProcess, traced: (way: "in" | "out", line: string) => void): LineProcess
{
    return {
        get pid()
        {
            return host.pid;
        },
        write: (line) => {
            traced("in", line);
            host.write(line);
        },
        onLine: (listener) =>
            host.onLine((line) => {
                traced("out", line);
                listener(line);
            }),
        onEnd: (listener) => host.onEnd(listener),
        closeInput: () => host.closeInput(),
        stop: () => host.stop(),
    };
}
