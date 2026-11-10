import { request } from "node:http";

/**
 * A request to a page on a connection of its own, as a page closed by the test before may have had the same port, and a kept connection to it would
 * break: the answer's status and text.
 */
export function sent(url: URL, { method = "GET", headers = {}, body }: { method?: string; headers?: Record<string, string>; body?: string; } = {}): Promise<{ status: number; text: string; }>
{
    return new Promise((done, failed) => {
        const asked = request(url, { method, headers, agent: false }, (response) => {
            let text = "";
            response.setEncoding("utf8");
            response.on("data", (chunk: string) => (text += chunk));
            response.on("end", () => done({ status: response.statusCode ?? 0, text }));
            response.on("error", failed);
        });
        asked.on("error", failed);
        asked.end(body);
    });
}
