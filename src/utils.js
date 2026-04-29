function ts() {
    return Date.now();
}

function logStep(start, label) {
    const ms = Date.now() - start;
    console.log(`[${(ms / 1000).toFixed(2)}s] ${label}`);
}

function logInfo(label) {
    console.log(`[INFO] ${label}`);
}

module.exports = {
    ts,
    logStep,
    logInfo,
};