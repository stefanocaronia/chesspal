// A "host" for a chat's driver over a real process and pipe: node alone, playing a recorded flow of test/hosts/flows on its stdout as Claude Code would,
// reading the driver's lines on its stdin. Its environment: FLOW, the flow's file; CRLF=1, lines ended as on Windows; PID_FILE, where it writes its pid;
// COMPLAIN, lines joined by "|" that it writes on its stderr at the player's first words before it exits with 1, as a host that cannot play.
import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const entries = process.env.FLOW === undefined ? [] : readFileSync(process.env.FLOW, "utf8").split("\n").filter((line) => line.trim() !== "").map((line) => JSON.parse(line));
const end = process.env.CRLF === "1" ? "\r\n" : "\n";
let position = 0;

if (process.env.PID_FILE !== undefined) {
    writeFileSync(process.env.PID_FILE, String(process.pid));
}

const say = (message) => process.stdout.write(`${JSON.stringify(message)}${end}`);

// The host's lines up to the next line the client wrote.
const play = () => {
    while (position < entries.length && entries[position].dir === "out") {
        say(entries[position++].msg);
    }
};

createInterface({ input: process.stdin }).on("line", (line) => {
    const message = JSON.parse(line);
    const request = message.request ?? {};

    if (message.type === "control_request" && request.subtype === "set_model") {
        say({ type: "control_response", response: { subtype: "success", request_id: message.request_id, response: { model: "claude-haiku-5-5" } } });
        return;
    }

    if (process.env.COMPLAIN !== undefined && message.type === "user") {
        process.stderr.write(`${process.env.COMPLAIN.split("|").join(end)}${end}`, () => process.exit(1));
        return;
    }

    // The player's words or an answer to a permission: the flow goes on after the next line of that type the client wrote.
    const wanted = message.type === "user" ? "user" : "control_response";

    while (position < entries.length && !(entries[position].dir === "in" && entries[position].msg.type === wanted)) {
        position++;
    }

    position++;
    play();
});
process.stdin.on("end", () => process.exit(0));
// Never left behind by a test that failed.
setTimeout(() => process.exit(0), 60_000).unref();
