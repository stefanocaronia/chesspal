import { describe, expect, it } from "vitest";
import { hostIds, hostOfClient, hosts } from "../src/hosts/names.ts";

describe("the hosts' names", () => {
    it("finds a host by the name its MCP client gives itself, and no host for any other chat", () => {
        expect(hostOfClient("codex-mcp-client")).toBe("codex");
        expect(hostOfClient("claude-code")).toBe("claudeCode");
        expect(hostOfClient("claude-ai")).toBeUndefined();
        expect(hostOfClient(undefined)).toBeUndefined();
    });

    it("gives every host its own client", () => {
        expect(new Set(hostIds.map((id) => hosts[id].client)).size).toBe(hostIds.length);
    });
});
