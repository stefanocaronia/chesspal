// The programs of the chats the table opens start one at a time: two that start together may renew the player's sign-in together, and one of them lose it.

/** A turn to start a program: `opened` once it said which chat it is, or failed, lets the next start. */
export interface StartTurn
{
    opened(): void;
}

/** The starts of the table's chats, in the order they are asked for. */
export interface Starts
{
    /** Waits for the start before to have opened, or for `longest` at most. */
    next(): Promise<StartTurn>;
}

/** Starts one at a time, each let go after `longest` milliseconds at most: one that never says which chat it is holds the others no longer. */
export function oneByOne(longest = 20_000): Starts
{
    let last: Promise<void> = Promise.resolve();

    return {
        next: () => {
            let opened = (): void => undefined;
            const done = new Promise<void>((resolve) => (opened = resolve));
            const before = last;
            last = done;
            return before.then(() => {
                const timer = setTimeout(opened, longest);
                timer.unref();
                return {
                    opened: () => {
                        clearTimeout(timer);
                        opened();
                    },
                };
            });
        },
    };
}
