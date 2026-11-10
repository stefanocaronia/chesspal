// The AI hosts a table opens a chat in (D-104): their choices, the terminal they open in, and `chesspal play`, which starts one there.
export { terminalChats } from "./chats.ts";
export { choiceKeys, type HostChoice, hostChoices, type HostName, hostNames, isHostName } from "./hosts.ts";
export { type HostLaunch, hostLaunch, playHost } from "./play.ts";
export { openTerminal, terminals } from "./terminal.ts";
