// A test never starts an AI host's program, Claude Code, Codex, Antigravity or OpenCode, nor installs one: they would act on the player's own accounts, as a
// sign-in renewed or cut short. Every way of starting a process is watched in each test file; one that names such a program is refused, and the test fails.
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";

// The hosts' programs by name, and their npm packages, which a test may only fake in a temporary folder of its own.
const programNames = /^(claude|codex|agy|antigravity|opencode)(\.exe|\.cmd|\.bat|\.ps1)?$/i;
const packageNames = /(@anthropic-ai[\\/]claude-code|@openai[\\/]codex|opencode-ai)/i;

const refused: string[] = [];

/** The lines refused since last asked, forgotten. */
export function takeRefused(): string[]
{
    return refused.splice(0);
}

/** The host's program a command line starts, where it starts one outside the temporary folder: its line; else undefined. */
export function realHostIn(command: string, args: readonly string[] = []): string | undefined
{
    const line = [command, ...args].join(" ");
    const words = [...line.matchAll(/"([^"]*)"|(\S+)/g)].map((match) => match[1] ?? match[2] ?? "");
    const temporary = resolve(tmpdir()).toLowerCase();
    const outside = (word: string): boolean => !resolve(word).toLowerCase().startsWith(temporary);
    const first = words[0] ?? "";

    if (programNames.test(basename(first)) && (!/[\\/]/.test(first) || outside(first))) {
        return line;
    }

    return words.some((word) => packageNames.test(word) && (!/[\\/]/.test(word.replace(packageNames, "")) || outside(word))) ? line : undefined;
}

/** Watches every way of starting a process of this test file: one that names a host's program throws, and is kept for the test to fail. */
export function refuseRealHosts(): void
{
    const watched = ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync"] as const;
    const methods = childProcess as unknown as Record<string, (...given: unknown[]) => unknown>;

    for (const method of watched) {
        const original = methods[method];

        methods[method] = (...given: unknown[]): unknown => {
            const command = typeof given[0] === "string" ? given[0] : "";
            const args = Array.isArray(given[1]) ? given[1].map(String) : [];
            const line = realHostIn(command, args);

            if (line !== undefined) {
                refused.push(line);
                throw new Error(`A test started an AI host's real program: ${line}. Give the code under test a fake one.`);
            }

            return original!(...given);
        };
    }

    // The named imports of node:child_process, in Chesspal's modules too, follow.
    syncBuiltinESMExports();
}
