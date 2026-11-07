import assert from "node:assert/strict";
import test from "node:test";

import {
  base64UrlEncode,
  computeRegex,
  convertTimestamp,
  decodeState,
  describeCron,
  encodeState,
  getCronRuns,
  getToolExamples,
  processHash,
  processUrl,
  processUuid,
  searchHttpStatusCodes,
  searchMimeTypes,
  parseCron,
  processBase64,
  processCron,
  processJson,
  stateFromHash,
  stateToHash,
  processDiff,
  processEncoding,
  processHtmlEntity,
  processJwt,
  processCsv,
  processJsonToTs,
  processXml,
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

test("built-in regex examples are valid", () => {
  const examples = getToolExamples("regex");
  assert.equal(examples.length, 5);
  for (const example of examples) {
    assert.equal(example.state.toolId, "regex");
    assert.doesNotThrow(() => {
      computeRegex(
        example.state.input,
        example.state.params.flags,
        example.state.params.testText,
        example.state.params.replaceText,
      );
    });
  }
});

test("built-in cron examples are valid", () => {
  const examples = getToolExamples("cron");
  assert.equal(examples.length, 7);
  for (const example of examples) {
    assert.equal(example.state.toolId, "cron");
    assert.doesNotThrow(() => parseCron(example.state.input));
  }
});

test("URL tool encodes, decodes, parses and builds query strings", () => {
  const text = "开发者 工具";
  const encoded = processUrl(text, { mode: "encode" });
  assert.equal(encoded.status, "success");
  assert.equal(processUrl(encoded.output, { mode: "decode" }).output, text);

  const parsed = processUrl("https://example.com/search?a=1&b=2&b=3#top", { mode: "parse" });
  assert.equal(parsed.status, "success");
  assert.deepEqual(JSON.parse(parsed.output).params, { a: ["1"], b: ["2", "3"] });

  const built = processUrl('[["q","开发者"],["page","2"]]', { mode: "build" });
  assert.equal(built.output, "q=%E5%BC%80%E5%8F%91%E8%80%85&page=2");
});

test("UUID tool validates and formats values", () => {
  const valid = processUuid("123e4567-e89b-12d3-a456-426614174000", {
    uppercase: true,
    hyphens: false,
  });
  assert.equal(valid.status, "success");
  assert.equal(valid.output, "123E4567E89B12D3A456426614174000");

  const invalid = processUuid("not-a-uuid", {});
  assert.equal(invalid.status, "error");
});

test("hash tool computes local SHA-256 digests", async () => {
  const result = await processHash("abc", { algorithm: "SHA-256" });
  assert.equal(result.status, "success");
  assert.equal(result.output, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("HTTP and MIME lookup tools filter local data", () => {
  const http = searchHttpStatusCodes("timeout");
  assert.ok(http.results.every((item) => `${item.code} ${item.name} ${item.description} ${item.semantics}`.toLowerCase().includes("timeout")));

  const mime = searchMimeTypes("png");
  assert.ok(mime.results.some((item) => item.type === "image/png"));
});

test("v1.1 tool states survive URL hash encoding", () => {
  const state = {
    version: 1,
    toolId: "url",
    input: "https://example.com/?q=开发者",
    params: { mode: "parse" },
  };
  assert.deepEqual(stateFromHash(stateToHash(state)), state);
});

test("JWT parser decodes header and payload", () => {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64UrlEncode(JSON.stringify({ sub: "devtools", iat: 1, exp: 9999999999 }));
  const result = processJwt(`${header}.${payload}.signature`);
  assert.equal(result.status, "success");
  assert.equal(result.extra.header.alg, "HS256");
  assert.equal(result.extra.payload.sub, "devtools");
  assert.equal(result.extra.status, "valid-time");
});

test("JWT parser reports invalid tokens", () => {
  const result = processJwt("not.a.jwt");
  assert.equal(result.status, "error");
});

test("diff tool reports added and removed lines", () => {
  const result = processDiff("a\nb\nc", "a\nx\nc", { mode: "text" });
  assert.equal(result.status, "success");
  assert.equal(result.extra.added, 1);
  assert.equal(result.extra.removed, 1);
  assert.match(result.output, /\+ x/);
  assert.match(result.output, /- b/);
});

test("diff tool formats JSON before comparing", () => {
  const result = processDiff('{"a":1}', '{ "a" : 1 }', { mode: "json" });
  assert.equal(result.status, "success");
  assert.equal(result.extra.added + result.extra.removed, 0);
});

test("encoding tool converts text and hex", () => {
  const encoded = processEncoding("A", { mode: "hexEncode" });
  assert.equal(encoded.output, "41");
  assert.equal(processEncoding(encoded.output, { mode: "hexDecode" }).output, "A");
});

test("encoding tool repairs Latin-1 mojibake", () => {
  const mojibake = "\u00e5\u00bc\u0080\u00e5\u008f\u0091\u00e8\u0080\u0085";
  const result = processEncoding(mojibake, { mode: "latin1ToUtf8" });
  assert.equal(result.status, "success");
  assert.equal(result.output, "开发者");
});

test("HTML entity tool encodes and decodes safely", () => {
  const text = "<div>开发者</div>";
  const encoded = processHtmlEntity(text, { mode: "encode", numeric: false });
  assert.equal(encoded.output, "&lt;div&gt;&#24320;&#21457;&#32773;&lt;/div&gt;");
  assert.equal(processHtmlEntity(encoded.output, { mode: "decode" }).output, text);
});

test("HTML entity tool handles numeric entities and invalid hex", () => {
  const encoded = processHtmlEntity("<开", { mode: "encode", numeric: true });
  assert.equal(encoded.output, "&#60;&#24320;");
  assert.equal(processHtmlEntity(encoded.output, { mode: "decode" }).output, "<开");
  assert.equal(processHtmlEntity("&#x5f00;", { mode: "decode" }).output, "开");
  assert.equal(processHtmlEntity("&#x110000;", { mode: "decode" }).output, "&#x110000;");
  assert.equal(processHtmlEntity("&lt", { mode: "decode" }).status, "success");
});

test("CSV tool converts CSV to JSON with quoting and delimiters", () => {
  const result = processCsv('name,note\n"A, B","line1\nline2"\n李四,"say ""hi"""', { mode: "toJson", delimiter: "," });
  assert.equal(result.status, "success");
  const records = JSON.parse(result.output);
  assert.deepEqual(records, [
    { name: "A, B", note: "line1\nline2" },
    { name: "李四", note: 'say "hi"' },
  ]);

  const tabbed = processCsv("a\tb\n1\t2", { mode: "toJson", delimiter: "tab" });
  assert.equal(tabbed.status, "success");
  assert.deepEqual(JSON.parse(tabbed.output), [{ a: "1", b: "2" }]);
});

test("CSV tool supports optional headers and column mismatch errors", () => {
  const noHeader = processCsv("a,b\n1,2", { mode: "toJson", delimiter: ",", header: false });
  assert.deepEqual(JSON.parse(noHeader.output), [{ column_1: "a", column_2: "b" }, { column_1: "1", column_2: "2" }]);

  const mismatch = processCsv("a,b\n1", { mode: "toJson", delimiter: "," });
  assert.equal(mismatch.status, "error");
  assert.match(mismatch.error.message, /第 2 行/);
});

test("CSV tool exports JSON object arrays with escaping", () => {
  const result = processCsv('[{"name":"A, B","tags":["x","y"],"note":null}]', { mode: "fromJson", delimiter: "," });
  assert.equal(result.status, "success");
  assert.equal(
    result.output,
    'name,tags,note\r\n"A, B","[""x"",""y""]",',
  );

  const invalid = processCsv("[1,2]", { mode: "fromJson", delimiter: "," });
  assert.equal(invalid.status, "error");
});

test("JSON to TypeScript generates interfaces with optional and merged fields", () => {
  const input = JSON.stringify({
    id: 1,
    user: { name: "dev" },
    items: [{ id: 1, label: "a" }, { id: 2 }],
  });
  const result = processJsonToTs(input, { rootName: "api response" });
  assert.equal(result.status, "success");
  const output = result.output;
  assert.match(output, /interface ApiResponse \{/);
  assert.match(output, /interface User \{/);
  assert.match(output, /interface Items \{/);
  assert.match(output, /label\?: string;/);
  assert.match(output, /items: Items\[\];/);
});

test("JSON to TypeScript deduplicates shapes and handles primitive roots", () => {
  const value = { a: { x: 1 }, b: { x: 2 } };
  const output = processJsonToTs(JSON.stringify(value), { rootName: "Root" }).output;
  assert.match(output, /interface Root \{/);
  assert.match(output, /interface A \{/);
  assert.equal(output.match(/interface A \{/g).length, 1);
  assert.equal(processJsonToTs('"text"', { rootName: "Root" }).output, "export type Root = string;");
  assert.equal(processJsonToTs("not json", { rootName: "Root" }).status, "error");
});

test("XML tool formats well-formed documents", () => {
  const input = '<?xml version="1.0"?><config debug="true"><!-- note --><item id="1">alpha</item><empty/></config>';
  const result = processXml(input, { indent: "2" });
  assert.equal(result.status, "success");
  assert.equal(
    result.output,
    [
      "<?xml version=\"1.0\"?>",
      "<config debug=\"true\">",
      "  <!-- note -->",
      "  <item id=\"1\">alpha</item>",
      "  <empty/>",
      "</config>",
    ].join("\n"),
  );
});

test("XML tool reports mismatched and unclosed tags", () => {
  const mismatch = processXml("<a>\n  <b></c>\n</a>", { indent: "2" });
  assert.equal(mismatch.status, "error");
  assert.equal(mismatch.error.line, 2);

  const unclosed = processXml("<a>\n<b>", { indent: "2" });
  assert.equal(unclosed.status, "error");
  assert.match(unclosed.error.message, /未闭合/);

  const multiRoot = processXml("<a/><a/>", { indent: "2" });
  assert.equal(multiRoot.status, "error");
});

test("v1.3 tool states survive URL hash encoding", () => {
  const state = {
    version: 1,
    toolId: "jsonts",
    input: '{"id":1}',
    params: { rootName: "ApiResponse" },
  };
  assert.deepEqual(stateFromHash(stateToHash(state)), state);

  const csvState = {
    version: 1,
    toolId: "csv",
    input: "a,b",
    params: { mode: "fromJson", delimiter: "tab", header: false },
  };
  assert.deepEqual(stateFromHash(stateToHash(csvState)), csvState);
});
