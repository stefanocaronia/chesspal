// The table (D-104): the board page in a process of its own, started by `chesspal` alone, with no chat. Above server/page, which serves the page in either process.
export { appBrowser } from "./browser.ts";
export { hostLaunch, isHostName, playHost, terminalChats } from "./hosts/index.ts";
export { iconAsked, type IconCommand, iconCommand, type IconPlaces, iconToRemake, makeIcons, noteIconAsked, noteIconMade } from "./icon/index.ts";
export { noteOpenFailed, openTable, processLauncher, type TableLauncher } from "./launch.ts";
export { attachTable, tableToJoin } from "./link.ts";
export { isOlder, startTable, type Table, type TableTimes, tableTimes } from "./table.ts";
