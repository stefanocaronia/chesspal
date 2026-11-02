// Light or dark: the system's, until the player picks one on the page, which this browser remembers.

const remembered = "chesspal-theme";

/** Shows the theme this browser chose last, else the system's. */
export function showStartTheme(): void
{
    let chosen: string | null = null;

    try {
        chosen = localStorage.getItem(remembered);
    } catch {
        // A browser that keeps nothing for the page: the system's theme.
    }

    document.documentElement.dataset.theme = chosen === "light" || chosen === "dark" ? chosen : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Switches between light and dark, and remembers the choice. */
export function switchTheme(): void
{
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;

    try {
        localStorage.setItem(remembered, next);
    } catch {
        // The choice lasts as long as the page.
    }
}
