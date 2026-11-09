// The AI's words read aloud (Stefano's idea, IDEE.md): the browser's own voices, a local one first, so the words stay on the computer where it can.

/** Reads the words aloud in the language given, cutting short what was being read. */
export function speak(words: string, language: string): void
{
    if (typeof speechSynthesis === "undefined") {
        return;
    }

    const said = words.replace(/\*\*/g, "").trim();
    speechSynthesis.cancel();
    clearTimeout(pending);

    if (said === "") {
        return;
    }

    // Chrome drops words spoken right after a cancel, and lists its voices late the first time: the words wait a moment.
    pending = setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(said);
        const voice = voiceFor(language);
        utterance.lang = voice?.lang ?? language;

        if (voice !== undefined) {
            utterance.voice = voice;
        }

        speechSynthesis.resume();
        speechSynthesis.speak(utterance);
    }, 150);
}

/** Stops reading. */
export function hush(): void
{
    if (typeof speechSynthesis !== "undefined") {
        clearTimeout(pending);
        speechSynthesis.cancel();
    }
}

let pending: ReturnType<typeof setTimeout> | undefined;

/** A voice for the language: a local one first, the browser's default among them first. */
function voiceFor(language: string): SpeechSynthesisVoice | undefined
{
    const voices = speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith(language.toLowerCase()));
    const local = voices.filter((voice) => voice.localService);
    return local.find((voice) => voice.default) ?? local[0] ?? voices[0];
}
