/**
 * Encode markup delimiters only at the MCP display-text boundary. Structured
 * data remains unchanged; clients must still render it as untrusted data.
 */
const markupDelimiters = /[<>&{}\[\]`*_!#|~]/g;

/** Encode plain text (echo, headings and custom errors) for HTML/Markdown text. */
export function encodeDisplayText(text: string): string {
    return text.replace(markupDelimiters, character => `&#${character.charCodeAt(0)};`);
}

/**
 * Escape delimiters inside JSON string tokens, including object keys, without
 * changing JSON syntax or existing escapes. JSON.parse recovers the exact data.
 * Do not use HTML entities here: they would change parsed database values.
 */
export function encodeDisplayJson(json: string): string {
    return json.replace(/"(?:[^"\\]|\\.)*"/g, token => token.replace(
        markupDelimiters,
        character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
    ));
}
