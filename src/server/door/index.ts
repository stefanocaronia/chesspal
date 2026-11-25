// The door between the table and the chats it opens: their `chesspal mcp` knocks with a key the table made, then only passes its lines to the table,
// which runs the chat's commands. Node only, so that the chat's process starts light.
export { type Door, type DoorOptions, openDoor } from "./door.ts";
export { answerLine, firstLine, type Hello, type HelloAnswer, helloLine, mostHello, readAnswer, readHello, type Refusal } from "./hello.ts";
export { pipeHere, type PipeOptions, pipeToTable, tableEnded } from "./pipe.ts";
export { doorPath, doorVariable, keyVariable, knock } from "./socket.ts";
