// The table (D-104): the board page in a process of its own, started by `chesspal` alone, with no chat. Above server/page, which serves the page in either process.
export { openTable, processLauncher, type TableLauncher } from "./launch.ts";
export { attachTable, tableToJoin } from "./link.ts";
export { isOlder, startTable, type Table, type TableTimes, tableTimes } from "./table.ts";
