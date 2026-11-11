// The page's start: the window the table opened sized as it opens, the settings this browser remembers, shown before the first frame, then the app
// drawn into its place.
import { render } from "preact";
import { App } from "./app/app.tsx";
import { fitOpenedWindow } from "./layout/window.ts";
import { loadSettings, showSettings } from "./profile/settings.ts";

fitOpenedWindow();
const settings = loadSettings();
showSettings(settings);
render(<App start={settings} />, document.getElementById("app")!);
