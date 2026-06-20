export function makeHistoryEntry(from, to, agent, note, now) {
    return { from, to, agent, note, at: now };
}
export function ok(data) {
    return { kind: 'ok', data };
}
export function err(message, recoverable = true) {
    return { kind: 'error', message, recoverable };
}
export function needInput(question, options) {
    return { kind: 'needs-input', question, ...(options ? { options } : {}) };
}
export function sourceToString(s) {
    return `${s.title}\n${s.snippet}\n${s.url}`;
}
//# sourceMappingURL=protocol.js.map