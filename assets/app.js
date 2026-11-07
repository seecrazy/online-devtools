import {
  TIME_ZONES,
  TOOL_IDS,
  getToolExamples,
  convertTimestamp,
  createDefaultState,
  currentTimestampInfo,
  processHash,
  processBase64,
  processCron,
  processDiff,
  processEncoding,
  processHtmlEntity,
  processJwt,
  processJson,
  processUrl,
  processUuid,
  searchHttpStatusCodes,
  searchMimeTypes,
  stateFromHash,
  stateToHash,
} from "./core.js";

const dom = {
  navLinks: document.querySelectorAll(".tool-link"),
  panels: document.querySelectorAll(".tool-panel"),
  shareButton: document.querySelector("#share-button"),
  shareStatus: document.querySelector("#share-status"),
  themeButton: document.querySelector("#theme-button"),
  json: {
    input: document.querySelector("#json-input"),
    mode: document.querySelector("#json-mode"),
    indent: document.querySelector("#json-indent"),
    output: document.querySelector("#json-output"),
    status: document.querySelector("#json-status"),
  },
  base64: {
    input: document.querySelector("#base64-input"),
    mode: document.querySelector("#base64-mode"),
    urlSafe: document.querySelector("#base64-url-safe"),
    output: document.querySelector("#base64-output"),
    status: document.querySelector("#base64-status"),
  },
  timestamp: {
    input: document.querySelector("#timestamp-input"),
    unit: document.querySelector("#timestamp-unit"),
    timezone: document.querySelector("#timestamp-timezone"),
    seconds: document.querySelector("#current-seconds"),
    milliseconds: document.querySelector("#current-milliseconds"),
    iso: document.querySelector("#current-iso"),
    output: document.querySelector("#timestamp-output"),
    status: document.querySelector("#timestamp-status"),
  },
  regex: {
    pattern: document.querySelector("#regex-pattern"),
    flags: document.querySelector("#regex-flags"),
    text: document.querySelector("#regex-text"),
    replace: document.querySelector("#regex-replace"),
    cancel: document.querySelector("#regex-cancel"),
    highlight: document.querySelector("#regex-highlight"),
    matches: document.querySelector("#regex-matches"),
    status: document.querySelector("#regex-status"),
  },
  cron: {
    expression: document.querySelector("#cron-expression"),
    timezone: document.querySelector("#cron-timezone"),
    count: document.querySelector("#cron-count"),
    description: document.querySelector("#cron-description"),
    runs: document.querySelector("#cron-runs"),
    status: document.querySelector("#cron-status"),
  },
  url: {
    input: document.querySelector("#url-input"),
    mode: document.querySelector("#url-mode"),
    output: document.querySelector("#url-output"),
    status: document.querySelector("#url-status"),
  },
  uuid: {
    input: document.querySelector("#uuid-input"),
    count: document.querySelector("#uuid-count"),
    uppercase: document.querySelector("#uuid-uppercase"),
    hyphens: document.querySelector("#uuid-hyphens"),
    generate: document.querySelector("#uuid-generate"),
    output: document.querySelector("#uuid-output"),
    status: document.querySelector("#uuid-status"),
  },
  hash: {
    input: document.querySelector("#hash-input"),
    algorithm: document.querySelector("#hash-algorithm"),
    uppercase: document.querySelector("#hash-uppercase"),
    output: document.querySelector("#hash-output"),
    status: document.querySelector("#hash-status"),
  },
  http: {
    input: document.querySelector("#http-input"),
    results: document.querySelector("#http-results"),
    status: document.querySelector("#http-status"),
  },
  mime: {
    input: document.querySelector("#mime-input"),
    results: document.querySelector("#mime-results"),
    status: document.querySelector("#mime-status"),
  },
  jwt: {
    input: document.querySelector("#jwt-input"),
    output: document.querySelector("#jwt-output"),
    details: document.querySelector("#jwt-details"),
    status: document.querySelector("#jwt-status"),
  },
  diff: {
    input: document.querySelector("#diff-input"),
    input2: document.querySelector("#diff-input2"),
    mode: document.querySelector("#diff-mode"),
    rows: document.querySelector("#diff-rows"),
    status: document.querySelector("#diff-status"),
  },
  encoding: {
    input: document.querySelector("#encoding-input"),
    mode: document.querySelector("#encoding-mode"),
    output: document.querySelector("#encoding-output"),
    status: document.querySelector("#encoding-status"),
  },
  entity: {
    input: document.querySelector("#entity-input"),
    mode: document.querySelector("#entity-mode"),
    numeric: document.querySelector("#entity-numeric"),
    output: document.querySelector("#entity-output"),
    status: document.querySelector("#entity-status"),
  },
};

const states = Object.fromEntries(TOOL_IDS.map((toolId) => [toolId, createDefaultState(toolId)]));
let activeTool = "json";
let processTimer = null;
let hashTimer = null;
let suppressHashChange = false;

const samples = {
  json: {
    input: `{\n  "name": "Online DevTools",\n  "tools": ["JSON", "Base64"],\n  "local": true\n}`,
    params: { mode: "format", indent: "2" },
  },
  base64: {
    input: "开发者工具箱 🛠️",
    params: { mode: "encode", urlSafe: false },
  },
  timestamp: {
    input: "2026-03-07 08:00:00",
    params: { timestampUnit: "auto", timezone: "Asia/Shanghai" },
  },
  regex: {
    input: "\\\\b([\\\\w.-]+)@([\\\\w.-]+\\\\.[a-z]{2,})\\\\b",
    params: { flags: "gi", testText: "联系 alice@example.com 或 bob@example.org", replaceText: "$1 [at] $2" },
  },
  cron: {
    input: "0 9 * * MON-FRI",
    params: { timezone: "Asia/Shanghai", previewCount: 5 },
  },
  url: {
    input: "https://example.com/search?q=开发者工具箱&page=2#hash",
    params: { mode: "parse" },
  },
  hash: {
    input: "Online DevTools",
    params: { algorithm: "SHA-256", uppercase: false },
  },
  jwt: {
    input: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZXZ0b29scyIsInJvbGUiOiJkZXZlbG9wZXIiLCJpYXQiOjE3NjQ1MDAwMDAsImV4cCI6MTg5MzQ1NjAwMH0.local-signature-not-verified",
    params: {},
  },
  diff: {
    input: "a\nb\nc",
    input2: "a\nx\nc",
    params: { mode: "text" },
  },
  encoding: {
    input: "开发者工具箱",
    params: { mode: "hexEncode" },
  },
  entity: {
    input: "<div>Online DevTools</div>",
    params: { mode: "encode", numeric: false },
  },
};

const exampleLists = {
  regex: document.querySelector("#regex-examples"),
  cron: document.querySelector("#cron-examples"),
};

function createButton(text, { copyText, secondary = true } = {}) {
  const button = document.createElement("button");
  button.className = `button${secondary ? " secondary" : ""}`;
  button.type = "button";
  button.textContent = text;
  if (copyText) button.dataset.copyText = copyText;
  return button;
}

function setStatus(element, message, kind = "neutral") {
  element.textContent = message;
  element.className = `status${kind === "error" ? " is-error" : kind === "success" ? " is-success" : ""}`;
}

function renderExampleList(toolId) {
  const container = exampleLists[toolId];
  if (!container) return;
  container.innerHTML = "";
  for (const example of getToolExamples(toolId)) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    const description = document.createElement("span");
    button.className = "example-button";
    button.type = "button";
    button.textContent = example.title;
    button.dataset.exampleTool = toolId;
    button.dataset.exampleId = example.id;
    button.setAttribute("aria-describedby", `${toolId}-example-${example.id}`);
    description.id = `${toolId}-example-${example.id}`;
    description.textContent = example.description;
    item.append(button, description);
    container.append(item);
  }
}

function storageGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 隐私模式或存储被禁用时保持可用，只放弃持久化偏好。
  }
}

function setOutput(element, value) {
  element.textContent = value ?? "";
}

function showShareStatus(message, isError = false) {
  dom.shareStatus.textContent = message;
  dom.shareStatus.className = isError ? "status is-error" : "status is-success";
  window.setTimeout(() => {
    if (dom.shareStatus.textContent === message) {
      dom.shareStatus.textContent = "";
      dom.shareStatus.className = "status";
    }
  }, 3000);
}

function applyTheme(mode) {
  const root = document.documentElement;
  const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const effectiveTheme = mode === "system" ? (systemPrefersDark ? "dark" : "light") : mode;
  root.dataset.theme = effectiveTheme;
  root.style.colorScheme = effectiveTheme;
  dom.themeButton.textContent = mode === "system" ? "跟随系统" : mode === "dark" ? "深色" : "浅色";
  storageSet("devtools-theme", mode);
}

function readTheme() {
  const stored = storageGet("devtools-theme");
  return ["system", "light", "dark"].includes(stored) ? stored : "system";
}

function populateTimezones() {
  for (const select of [dom.timestamp.timezone, dom.cron.timezone]) {
    select.innerHTML = "";
    for (const zone of TIME_ZONES) {
      const option = document.createElement("option");
      option.value = zone;
      option.textContent = zone === "system" ? "系统时区" : zone;
      select.append(option);
    }
  }
}

function readStateFromDom(toolId = activeTool) {
  const state = states[toolId];
  if (toolId === "json") {
    state.input = dom.json.input.value;
    state.params.mode = dom.json.mode.value;
    state.params.indent = dom.json.indent.value;
  } else if (toolId === "base64") {
    state.input = dom.base64.input.value;
    state.params.mode = dom.base64.mode.value;
    state.params.urlSafe = dom.base64.urlSafe.checked;
  } else if (toolId === "timestamp") {
    state.input = dom.timestamp.input.value;
    state.params.timestampUnit = dom.timestamp.unit.value;
    state.params.timezone = dom.timestamp.timezone.value;
  } else if (toolId === "regex") {
    state.input = dom.regex.pattern.value;
    state.params.flags = dom.regex.flags.value;
    state.params.testText = dom.regex.text.value;
    state.params.replaceText = dom.regex.replace.value;
  } else if (toolId === "cron") {
    state.input = dom.cron.expression.value;
    state.params.timezone = dom.cron.timezone.value;
    state.params.previewCount = Number(dom.cron.count.value);
  } else if (toolId === "url") {
    state.input = dom.url.input.value;
    state.params.mode = dom.url.mode.value;
  } else if (toolId === "uuid") {
    state.input = dom.uuid.input.value;
    state.params.count = Number(dom.uuid.count.value);
    state.params.uppercase = dom.uuid.uppercase.checked;
    state.params.hyphens = dom.uuid.hyphens.checked;
  } else if (toolId === "hash") {
    state.input = dom.hash.input.value;
    state.params.algorithm = dom.hash.algorithm.value;
    state.params.uppercase = dom.hash.uppercase.checked;
  } else if (toolId === "http") {
    state.input = dom.http.input.value;
  } else if (toolId === "mime") {
    state.input = dom.mime.input.value;
  } else if (toolId === "jwt") {
    state.input = dom.jwt.input.value;
  } else if (toolId === "diff") {
    state.input = dom.diff.input.value;
    state.input2 = dom.diff.input2.value;
    state.params.mode = dom.diff.mode.value;
  } else if (toolId === "encoding") {
    state.input = dom.encoding.input.value;
    state.params.mode = dom.encoding.mode.value;
  } else if (toolId === "entity") {
    state.input = dom.entity.input.value;
    state.params.mode = dom.entity.mode.value;
    state.params.numeric = dom.entity.numeric.checked;
  }
  return state;
}

function writeStateToDom(state) {
  if (state.toolId === "json") {
    dom.json.input.value = state.input;
    dom.json.mode.value = state.params.mode;
    dom.json.indent.value = state.params.indent;
  } else if (state.toolId === "base64") {
    dom.base64.input.value = state.input;
    dom.base64.mode.value = state.params.mode;
    dom.base64.urlSafe.checked = state.params.urlSafe;
  } else if (state.toolId === "timestamp") {
    dom.timestamp.input.value = state.input;
    dom.timestamp.unit.value = state.params.timestampUnit;
    dom.timestamp.timezone.value = state.params.timezone;
  } else if (state.toolId === "regex") {
    dom.regex.pattern.value = state.input;
    dom.regex.flags.value = state.params.flags;
    dom.regex.text.value = state.params.testText;
    dom.regex.replace.value = state.params.replaceText;
  } else if (state.toolId === "cron") {
    dom.cron.expression.value = state.input;
    dom.cron.timezone.value = state.params.timezone;
    dom.cron.count.value = String(state.params.previewCount);
  } else if (state.toolId === "url") {
    dom.url.input.value = state.input;
    dom.url.mode.value = state.params.mode;
  } else if (state.toolId === "uuid") {
    dom.uuid.input.value = state.input;
    dom.uuid.count.value = String(state.params.count);
    dom.uuid.uppercase.checked = state.params.uppercase;
    dom.uuid.hyphens.checked = state.params.hyphens;
  } else if (state.toolId === "hash") {
    dom.hash.input.value = state.input;
    dom.hash.algorithm.value = state.params.algorithm;
    dom.hash.uppercase.checked = state.params.uppercase;
  } else if (state.toolId === "http") {
    dom.http.input.value = state.input;
  } else if (state.toolId === "mime") {
    dom.mime.input.value = state.input;
  } else if (state.toolId === "jwt") {
    dom.jwt.input.value = state.input;
  } else if (state.toolId === "diff") {
    dom.diff.input.value = state.input;
    dom.diff.input2.value = state.input2 || "";
    dom.diff.mode.value = state.params.mode;
  } else if (state.toolId === "encoding") {
    dom.encoding.input.value = state.input;
    dom.encoding.mode.value = state.params.mode;
  } else if (state.toolId === "entity") {
    dom.entity.input.value = state.input;
    dom.entity.mode.value = state.params.mode;
    dom.entity.numeric.checked = state.params.numeric;
  }
}

function activateTool(toolId, { fromHash = false } = {}) {
  if (!TOOL_IDS.includes(toolId)) toolId = "json";
  activeTool = toolId;

  dom.navLinks.forEach((link) => link.classList.toggle("is-active", link.dataset.toolId === toolId));
  dom.panels.forEach((panel) => panel.classList.toggle("is-active", panel.id === `tool-${toolId}`));
  storageSet("devtools-last-tool", toolId);

  if (!fromHash) writeHash();
  scheduleProcess(0);
}

function renderJson(result) {
  if (result.status === "idle") {
    setOutput(dom.json.output, "");
    setStatus(dom.json.status, result.message);
    return;
  }
  if (result.status === "error") {
    const position = result.error.line ? `（第 ${result.error.line} 行，第 ${result.error.column} 列）` : "";
    setOutput(dom.json.output, result.error.context || "");
    setStatus(dom.json.status, `${result.error.message}${position}`, "error");
    return;
  }
  setOutput(dom.json.output, result.output);
  setStatus(dom.json.status, `JSON 校验成功，输出长度 ${result.output.length} 字符。`, "success");
}

function renderBase64(result) {
  if (result.status === "idle") {
    setOutput(dom.base64.output, "");
    setStatus(dom.base64.status, result.message);
    return;
  }
  if (result.status === "error") {
    setOutput(dom.base64.output, "");
    setStatus(dom.base64.status, result.error.message, "error");
    return;
  }
  setOutput(dom.base64.output, result.output);
  setStatus(dom.base64.status, `转换成功，输出长度 ${result.output.length} 字符。`, "success");
}

function renderTimestampResult(result) {
  dom.timestamp.output.innerHTML = "";
  if (result.status === "idle") {
    setStatus(dom.timestamp.status, result.message);
    return;
  }
  if (result.status === "error") {
    setStatus(dom.timestamp.status, result.error.message, "error");
    return;
  }

  const rows = [
    ["秒级时间戳", String(result.seconds)],
    ["毫秒级时间戳", String(result.milliseconds)],
    ["ISO 8601", result.iso],
    [`${result.timeZone} 时间`, result.output],
  ];
  for (const [label, value] of rows) {
    const wrapper = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    const span = document.createElement("span");
    dt.textContent = label;
    span.textContent = value;
    dd.append(span, createButton("复制", { copyText: value }));
    wrapper.append(dt, dd);
    dom.timestamp.output.append(wrapper);
  }
  setStatus(dom.timestamp.status, "转换成功。", "success");
}

function renderCron(result) {
  dom.cron.description.innerHTML = "";
  dom.cron.runs.innerHTML = "";

  if (result.status === "idle") {
    setStatus(dom.cron.status, result.message);
    return;
  }
  if (result.status === "error") {
    setStatus(dom.cron.status, result.error.message, "error");
    return;
  }

  for (const field of result.description) {
    const item = document.createElement("div");
    item.className = "cron-field";
    const label = document.createElement("strong");
    const value = document.createElement("span");
    label.textContent = field.label;
    value.textContent = `${field.value} → ${field.description}`;
    item.append(label, value);
    dom.cron.description.append(item);
  }

  for (const run of result.runs) {
    const item = document.createElement("li");
    item.textContent = run.text;
    dom.cron.runs.append(item);
  }
  setStatus(dom.cron.status, `表达式有效，时区 ${result.timeZone}。`, "success");
}

function renderUrl(result) {
  if (result.status === "idle") {
    setOutput(dom.url.output, "");
    setStatus(dom.url.status, result.message);
    return;
  }
  if (result.status === "error") {
    setOutput(dom.url.output, "");
    setStatus(dom.url.status, result.error.message, "error");
    return;
  }
  setOutput(dom.url.output, result.output);
  setStatus(dom.url.status, "URL 处理成功。", "success");
}

function renderUuid(result, state) {
  if (result.status === "error") {
    setOutput(dom.uuid.output, "");
    setStatus(dom.uuid.status, result.error.message, "error");
    return;
  }

  setOutput(dom.uuid.output, result.output);
  if (result.generated) {
    state.input = result.output;
    dom.uuid.input.value = result.output;
    writeHash();
    setStatus(dom.uuid.status, `已生成 ${result.generated} 个 UUID v4。`, "success");
  } else {
    setStatus(dom.uuid.status, `${result.valid} 个 UUID 均有效。`, "success");
  }
}

function renderHash(result) {
  if (result.status === "idle") {
    setOutput(dom.hash.output, "");
    setStatus(dom.hash.status, result.message);
    return;
  }
  if (result.status === "error") {
    setOutput(dom.hash.output, "");
    setStatus(dom.hash.status, result.error.message, "error");
    return;
  }
  setOutput(dom.hash.output, result.output);
  setStatus(dom.hash.status, `${result.algorithm} 计算成功。`, "success");
}

function renderLookupRows(container, rows, columns, copyColumn = null) {
  container.innerHTML = "";
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "guide-note";
    empty.textContent = "没有匹配结果。";
    container.append(empty);
    return;
  }

  const table = document.createElement("table");
  table.className = "syntax-table";
  const header = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const column of columns) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = column.label;
    headerRow.append(th);
  }
  header.append(headerRow);
  const body = document.createElement("tbody");

  for (const row of rows) {
    const tr = document.createElement("tr");
    for (const column of columns) {
      const td = document.createElement("td");
      if (column.key === copyColumn) {
        td.append(createButton("复制", { copyText: row[copyColumn] }));
      } else {
        td.textContent = row[column.key] ?? "";
      }
      tr.append(td);
    }
    body.append(tr);
  }
  table.append(header, body);
  container.append(table);
}

function renderHttpStatuses(query) {
  const { results, total } = searchHttpStatusCodes(query);
  renderLookupRows(dom.http.results, results, [
    { key: "code", label: "状态码" },
    { key: "name", label: "名称" },
    { key: "description", label: "含义" },
    { key: "semantics", label: "语义" },
  ]);
  setStatus(dom.http.status, `显示 ${results.length} / ${total} 条记录。`, results.length ? "success" : "error");
}

function renderMimeTypes(query) {
  const { results, total } = searchMimeTypes(query);
  renderLookupRows(dom.mime.results, results, [
    { key: "extension", label: "扩展名" },
    { key: "type", label: "MIME Type" },
    { key: "category", label: "分类" },
  ], "type");
  setStatus(dom.mime.status, `显示 ${results.length} / ${total} 条记录。`, results.length ? "success" : "error");
}

function renderJwt(result) {
  dom.jwt.details.innerHTML = "";
  if (result.status === "idle") {
    setOutput(dom.jwt.output, "");
    setStatus(dom.jwt.status, result.message);
    return;
  }
  if (result.status === "error") {
    setOutput(dom.jwt.output, "");
    setStatus(dom.jwt.status, result.error.message, "error");
    return;
  }

  setOutput(dom.jwt.output, result.output);
  const sections = [
    { title: "Header", body: JSON.stringify(result.extra.header, null, 2) },
    { title: "Payload", body: JSON.stringify(result.extra.payload, null, 2) },
    { title: "Signature", body: result.extra.signature },
  ];

  for (const { title, body } of sections) {
    const item = document.createElement("article");
    item.className = "jwt-section";
    const heading = document.createElement("h4");
    heading.textContent = title;
    const pre = document.createElement("pre");
    pre.textContent = body || "(empty)";
    item.append(heading, pre);
    dom.jwt.details.append(item);
  }

  for (const timeField of Object.values(result.extra.timeFields)) {
    const item = document.createElement("p");
    item.className = "guide-note";
    item.textContent = `${timeField.label}: ${timeField.iso}（${timeField.state}）`;
    dom.jwt.details.append(item);
  }
  const timeFields = result.extra.timeFields;
  const status = timeFields.exp?.state === "expired" ? "JWT 已过期。" :
    timeFields.nbf?.state === "not-yet-valid" ? "JWT 尚未生效。" : "时间字段有效。";
  setStatus(dom.jwt.status, status, result.extra.status === "valid-time" ? "success" : "error");
}

function renderDiff(result) {
  dom.diff.rows.innerHTML = "";
  if (result.status === "idle") {
    setStatus(dom.diff.status, result.message);
    return;
  }
  if (result.status === "error") {
    setStatus(dom.diff.status, result.error.message, "error");
    return;
  }

  for (const row of result.extra.rows) {
    const line = document.createElement("div");
    line.className = `diff-row diff-${row.type}`;
    const marker = document.createElement("span");
    marker.className = "diff-marker";
    marker.textContent = row.type === "added" ? "+" : row.type === "removed" ? "-" : " ";
    const text = document.createElement("span");
    text.textContent = row.text || " ";
    line.append(marker, text);
    dom.diff.rows.append(line);
  }
  setStatus(
    dom.diff.status,
    `新增 ${result.extra.added} 行，删除 ${result.extra.removed} 行，相同 ${result.extra.same} 行。`,
    result.extra.added || result.extra.removed ? "success" : "neutral",
  );
}

function renderEncoding(result) {
  if (result.status === "idle") {
    setOutput(dom.encoding.output, "");
    setStatus(dom.encoding.status, result.message);
    return;
  }
  if (result.status === "error") {
    setOutput(dom.encoding.output, "");
    setStatus(dom.encoding.status, result.error.message, "error");
    return;
  }
  setOutput(dom.encoding.output, result.output);
  setStatus(dom.encoding.status, "转换成功。", "success");
}

function renderEntity(result) {
  if (result.status === "idle") {
    setOutput(dom.entity.output, "");
    setStatus(dom.entity.status, result.message);
    return;
  }
  if (result.status === "error") {
    setOutput(dom.entity.output, "");
    setStatus(dom.entity.status, result.error.message, "error");
    return;
  }
  setOutput(dom.entity.output, result.output);
  setStatus(dom.entity.status, "转换成功。", "success");
}

let regexWorker = null;
let regexRunId = 0;
let regexTimeoutId = null;

function cancelRegex(message = "已取消当前正则计算。") {
  if (regexWorker) regexWorker.terminate();
  regexWorker = null;
  window.clearTimeout(regexTimeoutId);
  regexTimeoutId = null;
  setStatus(dom.regex.status, message);
}

function renderRegexHighlight(text, matches) {
  dom.regex.highlight.innerHTML = "";
  let cursor = 0;
  for (const match of matches) {
    if (match.index < cursor) continue;
    dom.regex.highlight.append(document.createTextNode(text.slice(cursor, match.index)));
    const mark = document.createElement("mark");
    mark.textContent = match.value;
    dom.regex.highlight.append(mark);
    cursor = match.end;
  }
  dom.regex.highlight.append(document.createTextNode(text.slice(cursor)));
}

function renderRegexMatches(matches, replacement) {
  dom.regex.matches.innerHTML = "";
  for (const [index, match] of matches.entries()) {
    const item = document.createElement("li");
    item.className = "match-item";
    const title = document.createElement("strong");
    const code = document.createElement("code");
    title.textContent = `Match ${index + 1} · ${match.index}-${match.end}`;
    code.textContent = match.value || "(zero-width match)";
    item.append(title, code);

    match.groups.forEach((group, groupIndex) => {
      if (group === null) return;
      const groupLine = document.createElement("span");
      groupLine.className = "match-group";
      groupLine.textContent = `分组 ${groupIndex + 1}: ${group}`;
      item.append(groupLine);
    });
    if (match.namedGroups) {
      for (const [name, value] of Object.entries(match.namedGroups)) {
        if (value === undefined) continue;
        const named = document.createElement("span");
        named.className = "match-group";
        named.textContent = `${name}: ${value ?? "(undefined)"}`;
        item.append(named);
      }
    }
    dom.regex.matches.append(item);
  }

  if (replacement !== null) {
    const item = document.createElement("li");
    item.className = "match-item";
    const title = document.createElement("strong");
    const code = document.createElement("code");
    title.textContent = "替换预览";
    code.textContent = replacement;
    item.append(title, code);
    dom.regex.matches.append(item);
  }
}

function runRegex(state) {
  cancelRegexSilently();
  if (!state.input.trim()) {
    renderRegexHighlight(state.params.testText, []);
    dom.regex.matches.innerHTML = "";
    setStatus(dom.regex.status, "请输入正则表达式。");
    return;
  }

  const id = regexRunId += 1;
  setStatus(dom.regex.status, "计算中…");
  regexWorker = new Worker("./regex-worker.js", { type: "module" });

  regexWorker.onmessage = (event) => {
    if (event.data.id !== id) return;
    cancelRegexSilently();
    if (event.data.status === "error") {
      setStatus(dom.regex.status, event.data.message, "error");
      return;
    }
    renderRegexHighlight(state.params.testText, event.data.matches);
    renderRegexMatches(event.data.matches, event.data.replacement);
    setStatus(
      dom.regex.status,
      event.data.matches.length ? `找到 ${event.data.matches.length} 个匹配。` : "无匹配。",
      event.data.matches.length ? "success" : "neutral",
    );
  };

  regexWorker.onerror = (event) => {
    if (id !== regexRunId) return;
    cancelRegexSilently();
    setStatus(dom.regex.status, `正则 Worker 异常：${event.message}`, "error");
  };

  regexTimeoutId = window.setTimeout(() => {
    if (id !== regexRunId) return;
    cancelRegex("正则计算超时，可能存在灾难性回溯。");
  }, 2000);

  regexWorker.postMessage({
    id,
    pattern: state.input,
    flags: state.params.flags,
    text: state.params.testText,
    replaceText: state.params.replaceText || null,
  });
}

function cancelRegexSilently() {
  if (regexWorker) regexWorker.terminate();
  regexWorker = null;
  window.clearTimeout(regexTimeoutId);
  regexTimeoutId = null;
}

async function processToolNow() {
  const state = readStateFromDom();
  if (state.toolId === "json") {
    renderJson(processJson(state.input, state.params));
  } else if (state.toolId === "base64") {
    renderBase64(processBase64(state.input, state.params));
  } else if (state.toolId === "timestamp") {
    renderTimestampResult(convertTimestamp(state.input, state.params));
  } else if (state.toolId === "regex") {
    runRegex(state);
  } else if (state.toolId === "cron") {
    renderCron(processCron(state.input, state.params));
  } else if (state.toolId === "url") {
    renderUrl(processUrl(state.input, state.params));
  } else if (state.toolId === "uuid") {
    renderUuid(processUuid(state.input, state.params), state);
  } else if (state.toolId === "hash") {
    renderHash(await processHash(state.input, state.params));
  } else if (state.toolId === "http") {
    renderHttpStatuses(state.input);
  } else if (state.toolId === "mime") {
    renderMimeTypes(state.input);
  } else if (state.toolId === "jwt") {
    renderJwt(processJwt(state.input));
  } else if (state.toolId === "diff") {
    renderDiff(processDiff(state.input, state.input2 || "", state.params));
  } else if (state.toolId === "encoding") {
    renderEncoding(processEncoding(state.input, state.params));
  } else if (state.toolId === "entity") {
    renderEntity(processHtmlEntity(state.input, state.params));
  }
}

function scheduleProcess(delay = 220) {
  window.clearTimeout(processTimer);
  processTimer = window.setTimeout(processToolNow, delay);
}

function writeHash() {
  const state = readStateFromDom();
  window.clearTimeout(hashTimer);
  hashTimer = window.setTimeout(() => {
    suppressHashChange = true;
    try {
      window.history.replaceState(null, "", stateToHash(state));
    } catch (error) {
      showShareStatus(error.message, true);
    }
    window.setTimeout(() => {
      suppressHashChange = false;
    }, 0);
  }, 250);
}

function readRouteFromHash() {
  const hash = window.location.hash;
  const match = /^#\/tool\/([a-z]+)(?:\?(.*))?$/.exec(hash);
  if (!match) {
    const lastTool = storageGet("devtools-last-tool");
    activateTool(TOOL_IDS.includes(lastTool) ? lastTool : "json", { fromHash: true });
    return;
  }

  const toolId = match[1];
  if (!TOOL_IDS.includes(toolId)) {
    showShareStatus("分享链接中的工具类型无效。", true);
    activateTool("json", { fromHash: true });
    return;
  }

  try {
    const state = stateFromHash(hash);
    if (state) {
      states[toolId] = state;
      writeStateToDom(state);
    }
    activateTool(toolId, { fromHash: true });
  } catch (error) {
    showShareStatus(`无法恢复分享状态：${error.message}`, true);
    activateTool(toolId, { fromHash: true });
  }
}

function tickCurrentTime() {
  const state = states.timestamp;
  const timezone = state.params.timezone || "system";
  const info = currentTimestampInfo(new Date(), timezone);
  dom.timestamp.seconds.textContent = String(info.seconds);
  dom.timestamp.milliseconds.textContent = String(info.milliseconds);
  dom.timestamp.iso.textContent = info.iso;
}

async function copyToClipboard(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    const original = button.textContent;
    button.textContent = "已复制";
    window.setTimeout(() => {
      button.textContent = original;
    }, 1200);
  } catch {
    showShareStatus("当前浏览器未授权剪贴板，请手动复制。", true);
  }
}

function handleDocumentClick(event) {
  const link = event.target.closest(".tool-link");
  if (link) {
    event.preventDefault();
    activateTool(link.dataset.toolId);
    return;
  }

  const button = event.target.closest("button");
  if (!button) return;

  if (button.dataset.exampleTool) {
    const toolId = button.dataset.exampleTool;
    const example = getToolExamples(toolId).find((item) => item.id === button.dataset.exampleId);
    if (example) {
      states[toolId] = structuredClone(example.state);
      writeStateToDom(states[toolId]);
      activateTool(toolId);
      processToolNow();
    }
    return;
  }

  if (button.dataset.copyText !== undefined) {
    copyToClipboard(button.dataset.copyText, button);
    return;
  }
  if (button.dataset.copy) {
    const target = document.querySelector(button.dataset.copy);
    copyToClipboard(target.value ?? target.innerText ?? target.textContent ?? "", button);
    return;
  }
  if (button.dataset.clear) {
    const state = states[button.dataset.clear];
    const defaults = createDefaultState(state.toolId);
    states[state.toolId] = defaults;
    writeStateToDom(defaults);
    activateTool(state.toolId);
    processToolNow();
    return;
  }
  if (button.dataset.sample) {
    const toolId = button.dataset.sample;
    states[toolId] = { ...structuredClone(samples[toolId]), toolId, version: 1 };
    writeStateToDom(states[toolId]);
    activateTool(toolId);
    processToolNow();
    return;
  }
  if (button === dom.regex.cancel) {
    cancelRegex();
    return;
  }
  if (button === dom.uuid.generate) {
    states.uuid.input = "";
    dom.uuid.input.value = "";
    activateTool("uuid");
  }
}

function handleDocumentInput(event) {
  const control = event.target;
  const toolId = Object.entries({
    json: ["json-input", "json-mode", "json-indent"],
    base64: ["base64-input", "base64-mode", "base64-url-safe"],
    timestamp: ["timestamp-input", "timestamp-unit", "timestamp-timezone"],
    regex: ["regex-pattern", "regex-flags", "regex-text", "regex-replace"],
    cron: ["cron-expression", "cron-timezone", "cron-count"],
    url: ["url-input", "url-mode"],
    uuid: ["uuid-input", "uuid-count", "uuid-uppercase", "uuid-hyphens"],
    hash: ["hash-input", "hash-algorithm", "hash-uppercase"],
    http: ["http-input"],
    mime: ["mime-input"],
    jwt: ["jwt-input"],
    diff: ["diff-input", "diff-input2", "diff-mode"],
    encoding: ["encoding-input", "encoding-mode"],
    entity: ["entity-input", "entity-mode", "entity-numeric"],
  }).find(([, ids]) => ids.includes(control.id))?.[0];

  if (!toolId) return;
  if (toolId === "timestamp") tickCurrentTime();
  readStateFromDom(toolId);
  scheduleProcess();
  writeHash();
}

populateTimezones();
renderExampleList("regex");
renderExampleList("cron");
applyTheme(readTheme());
readRouteFromHash();
writeStateToDom(states[activeTool]);
processToolNow();
tickCurrentTime();
window.setInterval(tickCurrentTime, 1000);

document.addEventListener("click", handleDocumentClick);
document.addEventListener("input", handleDocumentInput);
document.addEventListener("change", handleDocumentInput);
window.addEventListener("hashchange", () => {
  if (suppressHashChange) return;
  readRouteFromHash();
  processToolNow();
});

dom.themeButton.addEventListener("click", () => {
  const modes = ["system", "light", "dark"];
  const current = readTheme();
  applyTheme(modes[(modes.indexOf(current) + 1) % modes.length]);
});

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (readTheme() === "system") applyTheme("system");
});

dom.shareButton.addEventListener("click", async () => {
  try {
    const state = readStateFromDom();
    const url = `${window.location.href.split("#")[0]}${stateToHash(state)}`;
    await navigator.clipboard.writeText(url);
    showShareStatus("分享链接已复制。");
  } catch (error) {
    showShareStatus(error.message, true);
  }
});
