// The table (D-104): the board page in a process of its own, started by `chesspal` alone, with no chat. Above server/page, which serves the page in either process.
export { openTable, processLauncher, type TableLauncher } from "./launch.ts";
export { startTable, type Table, tableFolder, type TableTimes, tableTimes } from "./table.ts";
