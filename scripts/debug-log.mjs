/** Debug logger: POSTs NDJSON to ingest endpoint. Use in build/deploy flow. */
const ENDPOINT = "http://127.0.0.1:7908/ingest/5182f1fa-562f-478a-aa1a-86ff0295b342";
const SESSION = "b8fa75";

export function log(location, message, data = {}, hypothesisId = "") {
  const payload = {
    sessionId: SESSION,
    runId: process.env.DEBUG_RUN_ID || "run1",
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  };
  fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": SESSION },
    body: JSON.stringify(payload),
  }).catch(() => {});
}
