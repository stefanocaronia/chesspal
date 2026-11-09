import { describe, expect, it } from "vitest";
import { modelName, signature } from "../src/page/players/model-name.ts";

describe("a model's name on the page (D-81, D-82)", () => {
    it("names a Claude model as people say it, however the host writes its id", () => {
        expect(modelName("claude-opus-5-5")).toBe("Opus 5.5");
        expect(modelName("us.anthropic.claude-opus-5-5-20261101-v1:0")).toBe("Opus 5.5");
        expect(modelName("claude-sonnet-5-5@20261101")).toBe("Sonnet 5.5");
        expect(modelName("claude-fable-5-1")).toBe("Fable 5.1");
        expect(modelName("claude-opus-4-20250514")).toBe("Opus 4");
        expect(modelName("claude-haiku-4-5-20251001")).toBe("Haiku 4.5");
        expect(modelName("claude-3-5-sonnet-20241022")).toBe("Sonnet 3.5");
        expect(modelName("claude-3-opus-20240229")).toBe("Opus 3");
    });

    it("leaves the id of another model, or a host, as it is", () => {
        expect(modelName("gpt-5.1-codex-max")).toBe("gpt-5.1-codex-max");
        expect(modelName("Claude Code")).toBe("Claude Code");
    });

    it("signs with the model's name and the effort alone, no other words", () => {
        expect(signature("claude-opus-5-5", "xhigh")).toBe("Opus 5.5 · xhigh");
        expect(signature("gpt-5.1-codex-max", "low")).toBe("gpt-5.1-codex-max · low");
        expect(signature("Claude Code")).toBe("Claude Code");
    });
});
