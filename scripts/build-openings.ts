// Builds the index of the openings by position from Lichess's TSV files (D-16), for the core's lookup on the page and in the commands, and the book of
// their moves, which only the AI at the master level reads (D-60).
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { indexBook, indexOpenings } from "../src/core/index.ts";

const folder = new URL("../data/openings/", import.meta.url);
const tsv = readdirSync(folder).filter((name) => name.endsWith(".tsv")).map((name) => readFileSync(new URL(name, folder), "utf8")).join("\n");
writeFileSync(new URL("../dist/core/openings.json", import.meta.url), JSON.stringify(indexOpenings(tsv)));
writeFileSync(new URL("../dist/core/book.json", import.meta.url), JSON.stringify(indexBook(tsv)));
