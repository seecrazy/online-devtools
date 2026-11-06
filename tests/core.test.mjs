import assert from "node:assert/strict";
import test from "node:test";

import {
  computeRegex,
  convertTimestamp,
  decodeState,
  describeCron,
  encodeState,
  getCronRuns,
  parseCron,
  processBase64,
  processCron,
  processJson,
  stateFromHash,
  stateToHash,
} from "../assets/core.js";

test("JSON is formatted and minified", () => {
  const formatted = processJson('{"name":"devtools","local":true}', { mode: "format", indent: 2 });
  assert.equal(formatted.status, "success");
  assert.equal(formatted.output, '{\n  "name": "devtools",\n  "local": true\n}');

  const minified = processJson('{ "name": "devtools" }', { mode: "minify" });
  assert.equal(minified.output, '{"name":"devtools"}');
});

test("JSON errors are reported", () => {
  const result = processJson("{\n  invalid\n}", { mode: "format", indent: 2 });
  assert.equal(result.status, "error");
  assert.ok(result.error.message.length > 0);
});

test("Base64 handles UTF-8 and URL-safe encoding", () => {
  const text = "开发者工具箱 🛠️";
  const encoded = processBase64(text, { mode: "encode", urlSafe: false });
  assert.equal(encoded.status, "success");

  const decoded = processBase64(encoded.output, { mode: "decode", urlSafe: false });
  assert.equal(decoded.output, text);

  const trickyText = "\u00fb\u00ef\u00be";
  const urlSafe = processBase64(trickyText, { mode: "encode", urlSafe: true });
  assert.equal(urlSafe.status, "success");
  assert.equal(/[+/=]/.test(urlSafe.output), false);
  assert.equal(processBase64(urlSafe.output, { mode: "decode", urlSafe: true }).output, trickyText);
});

test("Base64 rejects invalid input", () => {
  const result = processBase64("!!!", { mode: "decode", urlSafe: false });
  assert.equal(result.status, "error");
  assert.match(result.error.message, /非法字符/);
});

test("timestamps convert in selected time zones", () => {
  const result = convertTimestamp("2026-03-07 08:00:00", {
    timestampUnit: "auto",
    timezone: "Asia/Shanghai",
  });
  assert.equal(result.status, "success");
  assert.equal(result.seconds, Date.UTC(2026, 2, 7) / 1000);
  assert.equal(result.iso, "2026-03-07T00:00:00.000Z");
  assert.match(result.output, /2026-03-07 08:00:00/);
});

test("timestamps reject invalid calendar dates", () => {
  const result = convertTimestamp("2026-02-30 08:00:00", {
    timestampUnit: "auto",
    timezone: "UTC",
  });
  assert.equal(result.status, "error");
  assert.match(result.error.message, /无法解析日期时间/);
});

test("standard five-field cron expressions are parsed", () => {
  const parsed = parseCron("30 9 7 3 *");
  assert.deepEqual([...parsed.fields.minute], [30]);
  assert.deepEqual([...parsed.fields.hour], [9]);
  assert.deepEqual([...parsed.fields.dayOfMonth], [7]);
  assert.deepEqual([...parsed.fields.month], [3]);
  assert.deepEqual([...parsed.fields.dayOfWeek], [0, 1, 2, 3, 4, 5, 6]);
});

test("cron weekday expressions generate future runs", () => {
  const parsed = parseCron("0 9 * * MON-FRI");
  const runs = getCronRuns(parsed, {
    timeZoneName: "UTC",
    count: 1,
    now: new Date("2026-03-07T00:00:00.000Z"),
  });
  assert.equal(runs.length, 1);
  assert.equal(runs[0].iso, "2026-03-09T09:00:00.000Z");
});

test("cron day-of-month and day-of-week use standard OR semantics", () => {
  const parsed = parseCron("0 9 1 * MON");
  const runs = getCronRuns(parsed, {
    timeZoneName: "UTC",
    count: 1,
    now: new Date("2026-03-07T00:00:00.000Z"),
  });
  assert.equal(runs[0].iso, "2026-03-09T09:00:00.000Z");
});

test("cron errors identify invalid fields", () => {
  const result = processCron("60 9 * * *", { timezone: "UTC" });
  assert.equal(result.status, "error");
  assert.match(result.error.message, /分钟字段/);
});

test("cron descriptions are generated", () => {
  const description = describeCron(parseCron("0 9 * * MON-FRI"));
  assert.equal(description.length, 5);
  assert.equal(description[4].description, "星期一、星期二、星期三、星期四、星期五");
});

test("tool state is encoded and decoded safely", () => {
  const state = {
    version: 1,
    toolId: "json",
    input: '{"ok":true}',
    params: { mode: "minify", indent: "2" },
  };
  const encoded = encodeState(state);
  assert.deepEqual(decodeState(encoded), state);
  assert.equal(stateToHash(state), `#/tool/json?state=${encoded}`);
});

test("invalid tool state is rejected", () => {
  assert.throws(() => decodeState("not-valid"), /无效|无法|长度|Base64/);
});

test("regex matching reports groups and replacement", () => {
  const result = computeRegex(
    "\\b([\\w.-]+)@([\\w.-]+\\.[a-z]{2,})\\b",
    "gi",
    "alice@example.com bob@example.org",
    "$1 [at] $2",
  );
  assert.equal(result.matches.length, 2);
  assert.deepEqual(result.matches[0].groups, ["alice", "example.com"]);
  assert.equal(result.replacement, "alice [at] example.com bob [at] example.org");
});

test("regex state survives URL hash encoding", () => {
  const state = {
    version: 1,
    toolId: "regex",
    input: "\\\\b[\\\\w.-]+\\\\b",
    params: { flags: "gi", testText: "hello 世界 🛠️", replaceText: "[$&]" },
  };
  const hash = stateToHash(state);
  assert.deepEqual(stateFromHash(hash), state);
});
