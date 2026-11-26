// The table (D-104): the board page in a process of its own, started by `chesspal` alone, with no chat. Above server/page, which serves the page in either process.
export { appBrowser, type BrowserSystem, type Opened, openedAddress, openInBrowser, windowProfile, type WindowSystem } from "./browser.ts";
export { chatStart, hostEnvironment, hostLaunch, type HostName, isHostName, noOpenCodeModel, playHost, terminalChats } from "./hosts/index.ts";
export { iconAsked, type IconCommand, iconCommand, type IconPlaces, iconToRemake, makeIcons, noteIconAsked, noteIconMade, removeIcons } from "./icon/index.ts";
export { noteFailure, openTable, processLauncher, type TableLauncher } from "./launch.ts";
export { attachTable, tableToJoin } from "./link.ts";
export { programsWait, startTable, type Table, type TableTimes, tableTimes } from "./table.ts";
export { npmInstall, npmUpdater, type TableUpdater } from "./update.ts";
export { pageTitle, type PlaceCommand, placeCommand, readPlaced, titleEnding, type WindowPlace, type WindowTitles, windowTitles } from "./window.ts";
