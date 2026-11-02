// The Torretta (D-45, D-46): the opponent and the logo, a rook that is a robot. Its neutral face until the moods come (D-14, T-61).

/** The Torretta at a size in pixels; with a label it is an image a screen reader names, else a decoration. */
export function Torretta({ size, label }: { size: number; label?: string; })
{
    return (
        <svg class="torretta" viewBox="0 0 128 128" width={size} height={size} role={label === undefined ? undefined : "img"} aria-label={label} aria-hidden={label === undefined ? "true" : undefined}>
            <path class="antenna" d="M64 31V19" />
            <circle class="light" cx="64" cy="16" r="5" />
            <rect class="shade" x="29" y="64" width="12" height="26" rx="2" />
            <rect class="shade" x="87" y="64" width="12" height="26" rx="2" />
            <path class="body" d="M34 30H47V40H57V30H71V40H81V30H94V54L89 58L92 106H36L39 58L34 54Z" />
            <rect class="shade" x="30" y="104" width="68" height="12" rx="4" />
            <rect class="screen" x="44" y="63" width="40" height="32" rx="7" />
            <g class="eyes">
                <circle cx="55" cy="76" r="4.6" />
                <circle cx="73" cy="76" r="4.6" />
            </g>
            <rect class="mouth" x="58" y="85.4" width="12" height="3.2" rx="1.6" />
        </svg>
    );
}
