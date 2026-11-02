// The page's start: the theme and the language, then the app drawn into its place.
import { render } from "preact";
import { App } from "./app.tsx";
import { textFor } from "./text.ts";
import { showStartTheme } from "./theme.ts";

const text = textFor(navigator.languages);
document.documentElement.lang = text.language;
showStartTheme();
render(<App text={text} />, document.getElementById("app")!);
