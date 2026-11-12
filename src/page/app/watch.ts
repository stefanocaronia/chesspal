// How the page follows the server's game: it reads it when the server says it changed, tries a read lost on the way again, and connects again when the
// browser gives the server up for good, as when an old table hands the page to the new one. Without Preact, so that a test drives it with fake timers.

/** What the page reads: the server's answer, with its Chesspal version and the reason it refused. */
export interface Served
{
    readonly version?: string;
    readonly error?: string;
}

/** The stream of the server's events, as the browser's EventSource gives it: its state, and closing it. */
export interface Events
{
    readonly readyState: number;
    close(): void;
}

/** What the stream of events calls: when it connects, at each event with its data, and when it fails. */
export interface EventHandlers
{
    open(): void;
    message(data: string): void;
    error(): void;
}

/** What the watch needs from the browser: reading the game, opening the events with their handlers, and the timers. */
export interface WatchTools<Body extends Served>
{
    read(): Promise<Body>;
    connect(handlers: EventHandlers): Events;
    later(run: () => void, wait: number): number;
    cancel(timer: number | undefined): void;
}

/** What the watch tells the page: the game read, why it failed, whether the server is gone, a new game asked for, and a server of another version. */
export interface WatchListener<Body extends Served>
{
    read(body: Body): void;
    problem(problem: string | undefined): void;
    offline(offline: boolean): void;
    newGame(): void;
    otherVersion(): void;
}

/** A watch on the server's game: reads it again on demand, and stops. */
export interface Watch
{
    reload(): void;
    stop(): void;
}

/** How many times, and how far apart in milliseconds, a read lost on the way is tried again; how long before a stream given up is opened again. */
export const readTries = 5;
export const readTryWait = 1000;
export const reconnectWait = 3000;

/** Follows the server's game: the first read when the events connect, another at each change, until `stop`. */
export function watchServed<Body extends Served>(tools: WatchTools<Body>, listener: WatchListener<Body>): Watch
{
    let latest = 0;
    // The Chesspal version of the first answer: a server of another, after an update, sends data this page may not read.
    let pageVersion: string | undefined;
    // The reads of the game asked last that failed, and the next try.
    let failures = 0;
    let retry: number | undefined;
    let reconnect: number | undefined;
    let stopped = false;
    // Whether the page shows a game: then a read that fails leaves it shown, offline, rather than replacing it with the error.
    let shown = false;
    let events = open();

    function load(again = false): void
    {
        tools.cancel(retry);
        failures = again ? failures : 0;
        // Two reads in flight may answer out of order: only the last one asked counts.
        const asked = ++latest;
        tools.read()
            .then((body) => {
                if (asked !== latest || stopped) {
                    return;
                }

                pageVersion ??= body.version;

                if (body.version !== undefined && body.version !== pageVersion) {
                    listener.otherVersion();
                    return;
                }

                listener.problem(body.error);

                if (body.error === undefined) {
                    shown = true;
                    listener.offline(false);
                    listener.read(body);
                }
            })
            .catch((error: unknown) => {
                if (asked !== latest || stopped) {
                    return;
                }

                // With the server gone the page waits for it and says so: connecting again reads the game.
                if (events.readyState !== streamOpen) {
                    listener.offline(true);
                    return;
                }

                // A read lost on the way while the server is there is tried again shortly.
                if (++failures <= readTries) {
                    retry = tools.later(() => load(true), readTryWait);
                    return;
                }

                if (shown) {
                    listener.offline(true);
                } else {
                    listener.problem(String(error));
                }
            });
    }

    function open(): Events
    {
        const stream: Events = tools.connect({
            open: () => {
                listener.offline(false);
                load();
            },
            // The chat asks for a new game: the player chooses it in the New game window.
            message: (data) => data === "new-game" ? listener.newGame() : load(),
            // The browser connects again by itself, but not after a server that answered with an error: then the page does, a little later.
            error: () => {
                listener.offline(stream.readyState !== streamOpen);

                if (stream.readyState === streamClosed && !stopped) {
                    tools.cancel(reconnect);
                    reconnect = tools.later(() => {
                        events = open();
                    }, reconnectWait);
                }
            },
        });
        return stream;
    }

    return {
        reload: () => load(),
        stop: () => {
            stopped = true;
            tools.cancel(retry);
            tools.cancel(reconnect);
            events.close();
        },
    };
}

// EventSource's states, which a test's fake stream has no class for.
const streamOpen = 1;
const streamClosed = 2;
