// The page's start: the settings this browser remembers, shown before the first frame, then the app drawn into its place.
import { render } from "preact";
import { App } from "./app.tsx";
import { loadSettings, showSettings } from "./settings.ts";

const settings = loadSettings();
showSettings(settings);
render(<App start={settings} />, document.getElementById("app")!);
