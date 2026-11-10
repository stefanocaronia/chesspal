/** Starts a table on a new data folder each time until one has a port free: the pages of tests run alongside may hold all three of a folder's. */
export async function onFreePorts<T>(start: () => Promise<T>, tries = 5): Promise<T>
{
    for (let tried = 1;; tried++) {
        try {
            return await start();
        } catch (error) {
            if (tried === tries || !(error as Error).message.includes("are taken by other programs")) {
                throw error;
            }
        }
    }
}
