// The paths a tool that reads asks for, held to the chat's folder: the AI reads its folder, nothing else on the player's computer.
import { inside, staysInside } from "../paths.ts";
import { isObject } from "./protocol.ts";

/** The first path a tool of kind read asks for outside `folder`, as the host gave it; undefined where every path given is inside. */
export function pathOutside(tool: string, input: unknown, folder: string): string | undefined
{
    const given = isObject(input) ? input : {};
    // Read's file is required; Glob's and Grep's path is the folder where none is given.
    const paths = tool === "Read" ? [given.file_path] : given.path === undefined ? [] : [given.path];
    // A path missing where one is needed, or not text, is refused as one outside.
    const outside = paths.filter((path) => typeof path !== "string" || !inside(path, folder));

    if (outside.length > 0) {
        return String(outside[0]);
    }

    return tool === "Glob" && !staysInside(given.pattern) ? String(given.pattern) : undefined;
}
