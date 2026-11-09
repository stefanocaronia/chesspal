// A full-text search over a list, as the player types it: any of the words found (OR), the items that match more of them first.

/**
 * The items that match any word of the query, in their order, those matching more words first; all of them for an empty query. A word matches a part of
 * the item's text, or a longer form of one of its words: «Siciliana» finds «Sicilian», «Italiana» «Italian».
 */
export function searched<Item>(items: readonly Item[], query: string, textOf: (item: Item) => string): readonly Item[]
{
    const wanted = wordsOf(query);

    if (wanted.length === 0) {
        return items;
    }

    return items
        .map((item, index) => ({ item, index, found: matches(wordsOf(textOf(item)), wanted) }))
        .filter(({ found }) => found > 0)
        .sort((one, other) => other.found - one.found || one.index - other.index)
        .map(({ item }) => item);
}

// A word of the query finds a longer form of the item's word only past this length, and only so many letters longer: «Sicilian» and «-a».
const stemLength = 5;
const endingLength = 2;

/** How many words of the query the item's words hold. */
function matches(words: readonly string[], wanted: readonly string[]): number
{
    const text = words.join(" ");
    return wanted.filter((word) => text.includes(word) || words.some((one) => isFormOf(word, one))).length;
}

function isFormOf(word: string, stem: string): boolean
{
    return stem.length >= stemLength && word.startsWith(stem) && word.length - stem.length <= endingLength;
}

/** The words of a text, lowercase and without accents, split at anything that is not a letter or a digit. */
function wordsOf(text: string): string[]
{
    return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word !== "");
}
