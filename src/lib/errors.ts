/**
 * An error whose message is written for users. Services throw it for rule
 * violations ("submissions are closed"); the action layer shows its message
 * verbatim. Any other error that reaches the UI is logged server-side and
 * replaced with a generic message — internals never leak to the browser.
 */
export class DomainError extends Error {}
