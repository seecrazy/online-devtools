export const TOOL_IDS = [
  "json",
  "base64",
  "url",
  "timestamp",
  "regex",
  "cron",
  "uuid",
  "hash",
  "http",
  "mime",
  "jwt",
  "diff",
  "encoding",
  "entity",
  "csv",
  "jsonts",
  "xml",
  "sql",
  "markdown",
  "yaml",
  "toml",
  "color",
  "radix",
  "text",
  "mock",
];
export const MAX_INPUT_LENGTH = 1024 * 1024;
export const MAX_URL_STATE_LENGTH = 64 * 1024;
export const TIME_ZONES = [
  "system",
  "UTC",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Europe/London",
  "America/New_York",
  "Australia/Sydney",
];

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function success(output, extra = {}) {
  return { status: "success", output, error: null, ...extra };
}

export function idle(message = "等待输入") {
  return { status: "idle", output: null, error: null, message };
}

export function failure(message, extra = {}) {
  return { status: "error", output: null, error: { message, ...extra } };
}

function checkInputSize(input) {
  if (input.length > MAX_INPUT_LENGTH) {
    return failure(`输入超过 ${MAX_INPUT_LENGTH / 1024} KiB 上限，请减少输入后重试。`);
  }
  return null;
}

function splitJsonError(message) {
  const lineMatch = /line (\d+) column (\d+)/i.exec(message);
  if (lineMatch) {
    return { line: Number(lineMatch[1]), column: Number(lineMatch[2]) };
  }
  const positionMatch = /position (\d+)/i.exec(message);
  if (positionMatch) {
    const position = Number(positionMatch[1]);
    const before = message.slice(0, position);
    return {
      line: before.split("\n").length,
      column: position - before.lastIndexOf("\n"),
    };
  }
  return { line: null, column: null };
}

function contextAround(input, index) {
  const start = Math.max(0, index - 40);
  const end = Math.min(input.length, index + 40);
  return input.slice(start, end);
}

export function processJson(input, params = {}) {
  const mode = params.mode === "minify" ? "minify" : "format";
  const indent = params.indent === "tab" ? "\t" : params.indent === 4 || params.indent === "4" ? 4 : 2;

  if (!input.trim()) {
    return idle();
  }

  const sizeError = checkInputSize(input);
  if (sizeError) return sizeError;

  try {
    const parsed = JSON.parse(input);
    const output = mode === "minify" ? JSON.stringify(parsed) : JSON.stringify(parsed, null, indent);
    return success(output, { mode, indent });
  } catch (error) {
    const position = splitJsonError(error.message);
    const positionMatch = /position (\d+)/i.exec(error.message);
    const context = positionMatch ? contextAround(input, Number(positionMatch[1])) : "";
    return failure(error.message, {
      ...position,
      context,
      tool: "json",
    });
  }
}

export function utf8BytesToBase64(bytes, { urlSafe = false } = {}) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  const standard = btoa(binary);
  return urlSafe ? standard.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "") : standard;
}

export function base64ToUtf8Bytes(input, { urlSafe = false } = {}) {
  const normalized = input.replace(/\s+/g, "");
  if (!normalized) {
    throw new Error("Base64 输入为空。");
  }

  if (urlSafe) {
    if (!/^[A-Za-z0-9_-]*={0,2}$/.test(normalized)) {
      const invalidIndex = normalized.split("").findIndex((char) => !/[A-Za-z0-9_=-]/.test(char));
      throw new Error(`URL-safe Base64 在第 ${invalidIndex + 1} 个字符处包含非法字符。`);
    }
  } else if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    const invalidIndex = normalized.split("").findIndex((char) => !/[A-Za-z0-9+/=]/.test(char));
    throw new Error(`标准 Base64 在第 ${invalidIndex + 1} 个字符处包含非法字符。`);
  }

  if (normalized.includes("=") && !normalized.endsWith("=")) {
    throw new Error("Base64 padding 只能出现在末尾。");
  }
  if (normalized.replace(/=/g, "").length % 4 === 1) {
    throw new Error("Base64 长度无效，无法按 6 位分组解码。");
  }

  const alphabet = urlSafe ? BASE64_URL_ALPHABET : BASE64_ALPHABET;
  const clean = normalized.replace(/=+$/g, "");
  const bytes = new Uint8Array(Math.floor(clean.length * 3 / 4));
  let byteIndex = 0;

  for (let index = 0; index < clean.length; index += 4) {
    const chunk = clean.slice(index, index + 4);
    let buffer = 0;
    for (let charIndex = 0; charIndex < 4; charIndex += 1) {
      buffer <<= 6;
      if (charIndex < chunk.length) {
        const value = alphabet.indexOf(chunk[charIndex]);
        if (value < 0) throw new Error("Base64 输入包含非法字符。");
        buffer |= value;
      }
    }
    const usableBytes = chunk.length - 1;
    for (let shift = 16; shift >= 24 - usableBytes * 8; shift -= 8) {
      bytes[byteIndex] = (buffer >> shift) & 0xff;
      byteIndex += 1;
    }
  }

  return bytes.subarray(0, byteIndex);
}

export function processBase64(input, params = {}) {
  const mode = params.mode === "decode" ? "decode" : "encode";
  const urlSafe = params.urlSafe === true || params.urlSafe === "true";

  if (!input) return idle();

  const sizeError = checkInputSize(input);
  if (sizeError) return sizeError;

  try {
    if (mode === "encode") {
      const bytes = new TextEncoder().encode(input);
      return success(utf8BytesToBase64(bytes, { urlSafe }));
    }

    const bytes = base64ToUtf8Bytes(input, { urlSafe });
    const output = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return success(output);
  } catch (error) {
    return failure(error.message, { tool: "base64" });
  }
}

function resolvedTimeZone(timeZone = "system") {
  if (!timeZone || timeZone === "system") {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  }
  return timeZone;
}

function timeZoneFormatter(timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "shortOffset",
  });
}

function zonedParts(date, timeZone) {
  const parts = Object.fromEntries(
    timeZoneFormatter(timeZone)
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    offset: parts.timeZoneName,
  };
}

function offsetMilliseconds(date, timeZone) {
  const parts = zonedParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

export function zonedToInstant({ year, month, day, hour = 0, minute = 0, second = 0, millisecond = 0 }, timeZone) {
  const naive = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  let instant = naive;
  for (let index = 0; index < 3; index += 1) {
    instant = naive - offsetMilliseconds(new Date(instant), timeZone);
  }
  return new Date(instant);
}

export function formatZonedDateTime(date, timeZoneName = "system") {
  const timeZone = resolvedTimeZone(timeZoneName);
  const parts = zonedParts(date, timeZone);
  const pad = (value) => String(value).padStart(2, "0");
  return {
    text: `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)} ${parts.offset}`,
    timeZone,
  };
}

function parseOffset(offsetText) {
  if (!offsetText || offsetText === "Z") return 0;
  const match = /^([+-])(\d{2}):?(\d{2})$/.exec(offsetText);
  if (!match) return null;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3])) * 60 * 1000;
}

function parseDateInput(input, timeZone) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(input);
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText = "00", minuteText = "00", secondText = "00", millisecondText = "000", offsetText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const millisecond = Number(millisecondText.padEnd(3, "0"));

  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    return null;
  }
  const calendarDay = Date.UTC(year, month - 1, day);
  const calendar = new Date(calendarDay);
  if (calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) {
    return null;
  }

  if (offsetText) {
    const offset = parseOffset(offsetText);
    if (offset === null) return null;
    return new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond) - offset);
  }

  return zonedToInstant({ year, month, day, hour, minute, second, millisecond }, timeZone);
}

export function convertTimestamp(input, params = {}) {
  const unit = ["seconds", "milliseconds"].includes(params.timestampUnit) ? params.timestampUnit : "auto";
  const timeZone = resolvedTimeZone(params.timezone || "system");
  const trimmed = input.trim();

  if (!trimmed) return idle();

  let date;
  if (/^\d+$/.test(trimmed)) {
    if (trimmed.length > 15) {
      return failure("时间戳过长，超出安全范围。");
    }
    const number = Number(trimmed);
    let milliseconds;
    if (unit === "seconds") milliseconds = number * 1000;
    else if (unit === "milliseconds") milliseconds = number;
    else if (trimmed.length === 10) milliseconds = number * 1000;
    else if (trimmed.length === 13) milliseconds = number;
    else return failure("无法自动识别时间戳单位；请显式选择秒或毫秒。");

    if (!Number.isSafeInteger(milliseconds)) {
      return failure("时间戳超出安全表示范围。");
    }
    date = new Date(milliseconds);
  } else {
    try {
      date = parseDateInput(trimmed, timeZone);
    } catch {
      date = null;
    }
    if (!date || Number.isNaN(date.getTime())) {
      return failure("无法解析日期时间。支持 ISO 8601 或 YYYY-MM-DD HH:mm:ss 格式。");
    }
  }

  if (date.getTime() < -8210266876800000 || date.getTime() > 8210266876800000) {
    return failure("时间超出可表示范围。");
  }

  const formatted = formatZonedDateTime(date, timeZone);
  return success(formatted.text, {
    seconds: Math.floor(date.getTime() / 1000),
    milliseconds: date.getTime(),
    iso: date.toISOString(),
    timeZone: formatted.timeZone,
  });
}

export function currentTimestampInfo(date = new Date(), timeZoneName = "system") {
  const formatted = formatZonedDateTime(date, timeZoneName);
  return {
    seconds: Math.floor(date.getTime() / 1000),
    milliseconds: date.getTime(),
    iso: date.toISOString(),
    zoned: formatted.text,
    timeZone: formatted.timeZone,
  };
}

const CRON_FIELD_DEFINITIONS = [
  { key: "minute", label: "分钟", min: 0, max: 59, unit: "分钟" },
  { key: "hour", label: "小时", min: 0, max: 23, unit: "小时" },
  { key: "dayOfMonth", label: "日期", min: 1, max: 31, unit: "日" },
  { key: "month", label: "月份", min: 1, max: 12, unit: "月" },
  { key: "dayOfWeek", label: "星期", min: 0, max: 7, unit: "星期" },
];

const MONTH_NAMES = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const WEEKDAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function normalizeCronValue(value, definition) {
  let number;
  if (definition.key === "month" && /^[A-Za-z]{3}$/.test(value)) {
    const index = MONTH_NAMES.indexOf(value.toUpperCase());
    number = index >= 0 ? index + 1 : NaN;
  } else if (definition.key === "dayOfWeek" && /^[A-Za-z]{3}$/.test(value)) {
    const index = WEEKDAY_NAMES.indexOf(value.toUpperCase());
    number = index >= 0 ? index : NaN;
  } else if (/^\d+$/.test(value)) {
    number = Number(value);
    if (definition.key === "dayOfWeek" && number === 7) number = 0;
  } else {
    number = NaN;
  }
  return number;
}

function parseCronPart(part, definition, fieldIndex) {
  if (!part) {
    throw new Error(`${definition.label}字段不能为空。`);
  }

  if (part === "*") {
    const values = [];
    for (let value = definition.min; value <= definition.max; value += 1) values.push(value);
    return values;
  }

  const stepMatch = /^(?:(\*|\d+|\d+-\d+|[A-Za-z]{3}-[A-Za-z]{3})\/(\d+))$/.exec(part);
  if (stepMatch) {
    const base = stepMatch[1];
    const step = Number(stepMatch[2]);
    if (!Number.isInteger(step) || step < 1 || step > definition.max) {
      throw new Error(`${definition.label}字段步长必须为 1 到 ${definition.max}。`);
    }
    let start = definition.min;
    let end = definition.max;
    if (base !== "*") {
      const rangeMatch = /^(\d+|[A-Za-z]{3})-(\d+|[A-Za-z]{3})$/.exec(base);
      if (rangeMatch) {
        start = normalizeCronValue(rangeMatch[1], definition);
        end = normalizeCronValue(rangeMatch[2], definition);
      } else {
        start = normalizeCronValue(base, definition);
      }
    }
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < definition.min || end > definition.max || start > end) {
      throw new Error(`${definition.label}字段的步长范围无效。`);
    }
    const values = [];
    for (let value = start; value <= end; value += step) values.push(value);
    return values;
  }

  const rangeMatch = /^(\d+|[A-Za-z]{3})-(\d+|[A-Za-z]{3})$/.exec(part);
  if (rangeMatch) {
    const start = normalizeCronValue(rangeMatch[1], definition);
    const end = normalizeCronValue(rangeMatch[2], definition);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < definition.min || end > definition.max || start > end) {
      throw new Error(`${definition.label}字段范围无效，有效范围是 ${definition.min}-${definition.max}。`);
    }
    const values = [];
    for (let value = start; value <= end; value += 1) values.push(value);
    return values;
  }

  const number = normalizeCronValue(part, definition);
  if (!Number.isInteger(number) || number < definition.min || number > definition.max) {
    throw new Error(`${definition.label}字段值无效，有效范围是 ${definition.min}-${definition.max}。`);
  }
  return [number];
}

export function parseCron(expression) {
  const rawFields = expression.trim().split(/\s+/);
  if (rawFields.length !== 5) {
    throw new Error(`标准五字段 Cron 需要 5 个字段，当前为 ${rawFields.length} 个。`);
  }

  const fields = {};
  const fieldErrors = [];
  rawFields.forEach((rawField, index) => {
    const definition = CRON_FIELD_DEFINITIONS[index];
    const values = new Set();
    try {
      rawField.split(",").forEach((part) => {
        if (!part) throw new Error(`${definition.label}字段包含空列表项。`);
        parseCronPart(part, definition, index).forEach((value) => values.add(value));
      });
      if (definition.key === "dayOfWeek" && values.has(7)) {
        values.delete(7);
        values.add(0);
      }
      fields[definition.key] = values;
    } catch (error) {
      fieldErrors.push(error.message);
    }
  });

  if (fieldErrors.length) {
    const error = new Error(fieldErrors[0]);
    error.fieldErrors = fieldErrors;
    throw error;
  }

  return { fields, expression: expression.trim() };
}

function formatCronValues(definition, values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === definition.max - definition.min + 1) return "全部";

  const groups = [];
  let start = sorted[0];
  let previous = sorted[0];
  for (let index = 1; index <= sorted.length; index += 1) {
    const value = sorted[index];
    if (value !== previous + 1) {
      groups.push(start === previous ? `${start}` : `${start}-${previous}`);
      start = value;
    }
    previous = value;
  }

  let text = groups.join("、");
  if (definition.key === "month") {
    text = sorted.map((value) => `${value} 月`).join("、");
  } else if (definition.key === "dayOfWeek") {
    const names = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
    text = sorted.map((value) => names[value]).join("、");
  }
  return text;
}

export function describeCron(parsed) {
  const rawFields = parsed.expression.split(/\s+/);
  return CRON_FIELD_DEFINITIONS.map((definition, index) => {
    let description;
    if (rawFields[index] === "*") {
      description = definition.key === "minute" ? "每分钟" :
        definition.key === "hour" ? "每小时" :
        definition.key === "dayOfMonth" ? "每天" :
        definition.key === "month" ? "每月" : "每天";
    } else {
      description = formatCronValues(definition, parsed.fields[definition.key]);
    }
    return {
      key: definition.key,
      label: definition.label,
      value: rawFields[index],
      description,
    };
  });
}

function cronDayMatches(parsed, year, month, day, weekday) {
  const monthMatch = parsed.fields.month.has(month);
  const domMatch = parsed.fields.dayOfMonth.has(day);
  const dowMatch = parsed.fields.dayOfWeek.has(weekday);
  const domWildcard = parsed.fields.dayOfMonth.size === 31;
  const dowWildcard = parsed.fields.dayOfWeek.size === 7;
  if (domWildcard && dowWildcard) return monthMatch;
  if (domWildcard) return monthMatch && dowMatch;
  if (dowWildcard) return monthMatch && domMatch;
  return monthMatch && (domMatch || dowMatch);
}

function nextCalendarDay({ year, month, day }) {
  const date = new Date(Date.UTC(year, month - 1, day + 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

export function getCronRuns(parsed, { timeZoneName = "system", count = 5, now = new Date() } = {}) {
  const timeZone = resolvedTimeZone(timeZoneName);
  const runCount = Math.max(1, Math.min(10, Number(count) || 5));
  const current = zonedParts(now, timeZone);
  let calendar = { year: current.year, month: current.month, day: current.day };
  const runs = [];
  const seen = new Set();

  for (let dayIndex = 0; dayIndex < 3660 && runs.length < runCount; dayIndex += 1) {
    const weekday = new Date(Date.UTC(calendar.year, calendar.month - 1, calendar.day)).getUTCDay();
    if (cronDayMatches(parsed, calendar.year, calendar.month, calendar.day, weekday)) {
      for (const hour of [...parsed.fields.hour].sort((a, b) => a - b)) {
        for (const minute of [...parsed.fields.minute].sort((a, b) => a - b)) {
          const instant = zonedToInstant({ ...calendar, hour, minute, second: 0, millisecond: 0 }, timeZone);
          const time = instant.getTime();
          if (time > now.getTime() && !seen.has(time)) {
            seen.add(time);
            const formatted = formatZonedDateTime(instant, timeZone);
            runs.push({ time, iso: instant.toISOString(), text: formatted.text });
          }
          if (runs.length >= runCount * 2) break;
        }
        if (runs.length >= runCount * 2) break;
      }
    }
    calendar = nextCalendarDay(calendar);
  }

  const uniqueRuns = [...new Map(runs.map((run) => [run.time, run])).values()]
    .sort((a, b) => a.time - b.time)
    .slice(0, runCount);

  if (!uniqueRuns.length) {
    throw new Error("未来 10 年内没有找到符合条件的执行时间，请检查日期与星期条件是否存在冲突。");
  }

  return uniqueRuns;
}

export function processCron(expression, params = {}) {
  if (!expression.trim()) return idle();
  try {
    const parsed = parseCron(expression);
    const timeZone = resolvedTimeZone(params.timezone || "system");
    const runs = getCronRuns(parsed, {
      timeZoneName: params.timezone || "system",
      count: params.previewCount || 5,
    });
    return success(parsed, { description: describeCron(parsed), runs, timeZone });
  } catch (error) {
    return failure(error.message, { tool: "cron", fieldErrors: error.fieldErrors || [] });
  }
}

export function computeRegex(pattern, flags = "g", text = "", replaceText = null) {
  if (pattern.length > MAX_INPUT_LENGTH || text.length > MAX_INPUT_LENGTH) {
    throw new Error("正则表达式或测试文本超过 1 MiB 上限。");
  }

  const normalizedFlags = [...new Set(`${flags || ""}g`)].join("");
  const regex = new RegExp(pattern, normalizedFlags);
  const matches = [];
  let match;
  let guard = 0;

  while ((match = regex.exec(text)) && guard < 10000) {
    guard += 1;
    matches.push({
      value: match[0],
      index: match.index,
      end: match.index + match[0].length,
      groups: [...match.slice(1)].map((value) => value ?? null),
      namedGroups: match.groups ? { ...match.groups } : null,
    });

    if (match[0] === "") {
      regex.lastIndex += 1;
    }
  }

  const replacement = replaceText == null || replaceText === "" ?
    null :
    text.replace(new RegExp(pattern, normalizedFlags), replaceText);

  return { matches, replacement };
}

export const TOOL_EXAMPLES = {
  regex: [
    {
      id: "email",
      title: "匹配邮箱",
      description: "提取常见邮箱地址，并展示两个捕获分组。",
      state: {
        version: 1,
        toolId: "regex",
        input: String.raw`\b([\w.-]+)@([\w.-]+\.[a-z]{2,})\b`,
        params: {
          flags: "gi",
          testText: "联系 alice@example.com 或 bob@example.org",
          replaceText: "$1 [at] $2",
        },
      },
    },
    {
      id: "url",
      title: "匹配 URL",
      description: "提取文本中的 http 与 https 链接。",
      state: {
        version: 1,
        toolId: "regex",
        input: String.raw`https?:\/\/[^\s]+`,
        params: {
          flags: "gi",
          testText: "文档：https://example.com/docs 和 http://example.org/page",
          replaceText: "",
        },
      },
    },
    {
      id: "mobile-cn",
      title: "匹配手机号",
      description: "按行匹配中国大陆常见手机号格式。",
      state: {
        version: 1,
        toolId: "regex",
        input: String.raw`^1[3-9]\d{9}$`,
        params: {
          flags: "gm",
          testText: "13812345678\n12345678901\n19912345678",
          replaceText: "",
        },
      },
    },
    {
      id: "iso-date",
      title: "匹配 ISO 日期",
      description: "提取 YYYY-MM-DD 日期，并分别捕获年、月、日。",
      state: {
        version: 1,
        toolId: "regex",
        input: String.raw`\b(\d{4})-(\d{2})-(\d{2})\b`,
        params: {
          flags: "g",
          testText: "发布日期：2026-11-06；截止日期：2026-12-31",
          replaceText: "",
        },
      },
    },
    {
      id: "hex-color",
      title: "匹配颜色值",
      description: "匹配三位或六位十六进制颜色值。",
      state: {
        version: 1,
        toolId: "regex",
        input: String.raw`#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b`,
        params: {
          flags: "g",
          testText: "主题色 #2563EB，成功色 #16a34a，边框 #ddd",
          replaceText: "",
        },
      },
    },
  ],
  cron: [
    {
      id: "every-minute",
      title: "每分钟",
      description: "所有字段均为 *，每一分钟执行。",
      state: {
        version: 1,
        toolId: "cron",
        input: "* * * * *",
        params: { timezone: "system", previewCount: 5 },
      },
    },
    {
      id: "every-five-minutes",
      title: "每 5 分钟",
      description: "分钟字段使用 */5，每 5 分钟执行。",
      state: {
        version: 1,
        toolId: "cron",
        input: "*/5 * * * *",
        params: { timezone: "system", previewCount: 5 },
      },
    },
    {
      id: "hourly",
      title: "每小时",
      description: "每小时第 0 分钟执行。",
      state: {
        version: 1,
        toolId: "cron",
        input: "0 * * * *",
        params: { timezone: "system", previewCount: 5 },
      },
    },
    {
      id: "daily-nine",
      title: "每天 09:00",
      description: "每天 09:00 执行。",
      state: {
        version: 1,
        toolId: "cron",
        input: "0 9 * * *",
        params: { timezone: "system", previewCount: 5 },
      },
    },
    {
      id: "weekday-nine",
      title: "工作日 09:00",
      description: "星期一至星期五 09:00 执行。",
      state: {
        version: 1,
        toolId: "cron",
        input: "0 9 * * MON-FRI",
        params: { timezone: "system", previewCount: 5 },
      },
    },
    {
      id: "monthly-first-day",
      title: "每月 1 日 00:00",
      description: "每月 1 日零点执行。",
      state: {
        version: 1,
        toolId: "cron",
        input: "0 0 1 * *",
        params: { timezone: "system", previewCount: 5 },
      },
    },
    {
      id: "quarterly-first-day",
      title: "每季度第一天",
      description: "每 3 个月的第一天零点执行。",
      state: {
        version: 1,
        toolId: "cron",
        input: "0 0 1 */3 *",
        params: { timezone: "system", previewCount: 5 },
      },
    },
  ],
};

export function getToolExamples(toolId) {
  return structuredClone(TOOL_EXAMPLES[toolId] || []);
}

export function processUrl(input, params = {}) {
  const mode = ["decode", "parse", "build"].includes(params.mode) ? params.mode : "encode";
  if (!input.trim()) return idle();

  try {
    if (mode === "encode") {
      return success(encodeURIComponent(input), { mode });
    }
    if (mode === "decode") {
      return success(decodeURIComponent(input), { mode });
    }
    if (mode === "build") {
      const parsed = JSON.parse(input);
      if (!Array.isArray(parsed) || parsed.some(([key]) => typeof key !== "string")) {
        throw new Error("Query 参数 JSON 必须是 [key, value] 数组。");
      }
      const query = new URLSearchParams();
      for (const [key, value] of parsed) query.append(key, String(value ?? ""));
      return success(query.toString(), { mode });
    }

    const url = new URL(input);
    const paramsObject = {};
    for (const [key, value] of url.searchParams.entries()) {
      if (paramsObject[key]) paramsObject[key].push(value);
      else paramsObject[key] = [value];
    }
    return success(JSON.stringify({
      href: url.href,
      protocol: url.protocol,
      username: url.username,
      password: url.password,
      host: url.host,
      hostname: url.hostname,
      port: url.port,
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
      params: paramsObject,
    }, null, 2), { mode: "parse" });
  } catch (error) {
    return failure(error.message, { tool: "url" });
  }
}

function randomUuidValues() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID().replace(/-/g, "");
  }
  if (globalThis.crypto?.getRandomValues) {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  const bytes = new Uint8Array(16);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function formatUuid(value, { uppercase = false, hyphens = true } = {}) {
  const clean = value.replaceAll("-", "");
  let output = hyphens ?
    `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20)}` :
    clean;
  return uppercase ? output.toUpperCase() : output.toLowerCase();
}

export function processUuid(input, params = {}) {
  const uppercase = params.uppercase === true || params.uppercase === "true";
  const hyphens = params.hyphens !== false && params.hyphens !== "false";
  const count = Math.max(1, Math.min(100, Number(params.count) || 5));
  const validator = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (input.trim()) {
    const candidates = input.trim().split(/\s*,\s*|\s+/);
    const invalid = candidates.filter((candidate) => !validator.test(candidate));
    if (invalid.length) {
      return failure(`无效 UUID：${invalid[0]}`, { tool: "uuid" });
    }
    return success(candidates.map((candidate) => formatUuid(candidate, { uppercase, hyphens })).join("\n"), {
      valid: candidates.length,
    });
  }

  const values = Array.from({ length: count }, () => formatUuid(randomUuidValues(), { uppercase, hyphens }));
  return success(values.join("\n"), { generated: count });
}

export async function processHash(input, params = {}) {
  const algorithm = ["SHA-1", "SHA-256", "SHA-384", "SHA-512"].includes(params.algorithm) ?
    params.algorithm :
    "SHA-256";
  const uppercase = params.uppercase === true || params.uppercase === "true";
  if (!input) return idle();
  try {
    const bytes = new TextEncoder().encode(input);
    const digest = await globalThis.crypto.subtle.digest(algorithm, bytes);
    const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return success(uppercase ? hex.toUpperCase() : hex, { algorithm });
  } catch (error) {
    return failure(error.message, { tool: "hash" });
  }
}

export const HTTP_STATUS_CODES = [
  { code: 100, name: "Continue", description: "客户端应继续请求。", semantics: "协议信息" },
  { code: 101, name: "Switching Protocols", description: "服务器同意切换协议。", semantics: "协议切换" },
  { code: 200, name: "OK", description: "请求成功。", semantics: "可缓存" },
  { code: 201, name: "Created", description: "资源创建成功。", semantics: "成功创建" },
  { code: 202, name: "Accepted", description: "请求已接受，等待处理。", semantics: "异步处理" },
  { code: 204, name: "No Content", description: "成功但没有响应体。", semantics: "无内容" },
  { code: 301, name: "Moved Permanently", description: "资源永久移动。", semantics: "永久重定向" },
  { code: 302, name: "Found", description: "资源临时移动。", semantics: "临时重定向" },
  { code: 304, name: "Not Modified", description: "缓存仍有效。", semantics: "缓存复用" },
  { code: 307, name: "Temporary Redirect", description: "临时重定向，保留方法。", semantics: "临时重定向" },
  { code: 308, name: "Permanent Redirect", description: "永久重定向，保留方法。", semantics: "永久重定向" },
  { code: 400, name: "Bad Request", description: "请求语法或参数错误。", semantics: "客户端错误" },
  { code: 401, name: "Unauthorized", description: "未认证。", semantics: "需要认证" },
  { code: 403, name: "Forbidden", description: "已认证但无权限。", semantics: "权限不足" },
  { code: 404, name: "Not Found", description: "资源不存在。", semantics: "客户端错误" },
  { code: 405, name: "Method Not Allowed", description: "方法不允许。", semantics: "方法错误" },
  { code: 409, name: "Conflict", description: "请求与当前状态冲突。", semantics: "状态冲突" },
  { code: 410, name: "Gone", description: "资源已永久消失。", semantics: "永久失效" },
  { code: 415, name: "Unsupported Media Type", description: "请求媒体类型不支持。", semantics: "格式错误" },
  { code: 422, name: "Unprocessable Entity", description: "请求格式正确但语义错误。", semantics: "校验失败" },
  { code: 429, name: "Too Many Requests", description: "请求过多。", semantics: "限流，可重试" },
  { code: 500, name: "Internal Server Error", description: "服务器内部错误。", semantics: "服务端错误，可重试" },
  { code: 501, name: "Not Implemented", description: "服务器不支持该功能。", semantics: "服务端错误" },
  { code: 502, name: "Bad Gateway", description: "上游网关或代理收到无效响应。", semantics: "上游错误，可重试" },
  { code: 503, name: "Service Unavailable", description: "服务暂不可用。", semantics: "过载或维护，可重试" },
  { code: 504, name: "Gateway Timeout", description: "上游网关超时。", semantics: "上游超时，可重试" },
];

export function searchHttpStatusCodes(query = "") {
  const normalized = query.trim().toLowerCase();
  const results = normalized ?
    HTTP_STATUS_CODES.filter((item) =>
      `${item.code} ${item.name} ${item.description} ${item.semantics}`.toLowerCase().includes(normalized)
    ) :
    HTTP_STATUS_CODES;
  return { results, total: HTTP_STATUS_CODES.length };
}

export const MIME_TYPES = [
  { extension: ".aac", type: "audio/aac", category: "音频" },
  { extension: ".avi", type: "video/x-msvideo", category: "视频" },
  { extension: ".bin", type: "application/octet-stream", category: "二进制" },
  { extension: ".css", type: "text/css", category: "前端" },
  { extension: ".csv", type: "text/csv", category: "数据" },
  { extension: ".doc", type: "application/msword", category: "文档" },
  { extension: ".docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", category: "文档" },
  { extension: ".gif", type: "image/gif", category: "图片" },
  { extension: ".gz", type: "application/gzip", category: "压缩包" },
  { extension: ".htm", type: "text/html", category: "前端" },
  { extension: ".html", type: "text/html", category: "前端" },
  { extension: ".ico", type: "image/vnd.microsoft.icon", category: "图片" },
  { extension: ".jpeg", type: "image/jpeg", category: "图片" },
  { extension: ".jpg", type: "image/jpeg", category: "图片" },
  { extension: ".js", type: "text/javascript", category: "前端" },
  { extension: ".json", type: "application/json", category: "数据" },
  { extension: ".md", type: "text/markdown", category: "文档" },
  { extension: ".mp3", type: "audio/mpeg", category: "音频" },
  { extension: ".mp4", type: "video/mp4", category: "视频" },
  { extension: ".pdf", type: "application/pdf", category: "文档" },
  { extension: ".png", type: "image/png", category: "图片" },
  { extension: ".ppt", type: "application/vnd.ms-powerpoint", category: "文档" },
  { extension: ".pptx", type: "application/vnd.openxmlformats-officedocument.presentationml.presentation", category: "文档" },
  { extension: ".svg", type: "image/svg+xml", category: "图片" },
  { extension: ".tar", type: "application/x-tar", category: "压缩包" },
  { extension: ".ts", type: "video/mp2t", category: "视频" },
  { extension: ".txt", type: "text/plain", category: "文本" },
  { extension: ".wasm", type: "application/wasm", category: "二进制" },
  { extension: ".webm", type: "video/webm", category: "视频" },
  { extension: ".webp", type: "image/webp", category: "图片" },
  { extension: ".xls", type: "application/vnd.ms-excel", category: "文档" },
  { extension: ".xlsx", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", category: "文档" },
  { extension: ".xml", type: "application/xml", category: "数据" },
  { extension: ".zip", type: "application/zip", category: "压缩包" },
];

export function searchMimeTypes(query = "") {
  const normalized = query.trim().toLowerCase();
  const results = normalized ?
    MIME_TYPES.filter((item) =>
      `${item.extension} ${item.type} ${item.category}`.toLowerCase().includes(normalized)
    ) :
    MIME_TYPES;
  return { results, total: MIME_TYPES.length };
}

export function base64UrlEncode(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return utf8BytesToBase64(bytes, { urlSafe: true });
}

export function base64UrlDecode(value) {
  return new TextDecoder("utf-8", { fatal: true }).decode(base64ToUtf8Bytes(value, { urlSafe: true }));
}

export function parseJwt(token) {
  const sizeError = checkInputSize(token);
  if (sizeError) throw new Error(sizeError.error.message);

  const parts = token.trim().split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw new Error("JWT 必须由 header.payload.signature 三段组成。");
  }

  const decodeJson = (part, name) => {
    try {
      return JSON.parse(base64UrlDecode(part));
    } catch (error) {
      throw new Error(`无法解析 ${name}：${error.message}`);
    }
  };

  const header = decodeJson(parts[0], "header");
  const payload = decodeJson(parts[1], "payload");
  if (!header || typeof header !== "object" || Array.isArray(header)) {
    throw new Error("JWT header 必须是 JSON 对象。");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("JWT payload 必须是 JSON 对象。");
  }
  const signature = parts[2];

  const now = Math.floor(Date.now() / 1000);
  const timeFields = {};
  for (const [field, label] of [["iat", "签发时间"], ["nbf", "生效时间"], ["exp", "过期时间"]]) {
    const value = payload?.[field];
    if (typeof value === "number" && Number.isFinite(value)) {
      timeFields[field] = {
        label,
        unix: value,
        iso: new Date(value * 1000).toISOString(),
        state: field === "nbf" ? (value > now ? "not-yet-valid" : "valid") : field === "exp" ? (value <= now ? "expired" : "valid") : "valid",
      };
    }
  }

  return {
    header,
    payload,
    signature,
    timeFields,
    status: timeFields.exp?.state === "expired" || timeFields.nbf?.state === "not-yet-valid" ? "invalid-time" : "valid-time",
  };
}

export function processJwt(token) {
  if (!token.trim()) return idle();
  try {
    const parsed = parseJwt(token);
    return success(JSON.stringify(parsed, null, 2), { extra: parsed });
  } catch (error) {
    return failure(error.message, { tool: "jwt" });
  }
}

function diffLines(oldText, newText) {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const rows = [];
  let oldIndex = 0;
  let newIndex = 0;

  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    if (oldIndex < oldLines.length && newIndex < newLines.length && oldLines[oldIndex] === newLines[newIndex]) {
      rows.push({ type: "same", text: oldLines[oldIndex] });
      oldIndex += 1;
      newIndex += 1;
      continue;
    }

    const oldCandidate = oldIndex < oldLines.length ? oldLines[oldIndex] : null;
    const matchIndex = oldCandidate === null ? -1 : newLines.indexOf(oldCandidate, newIndex);
    if (matchIndex >= 0) {
      while (newIndex < matchIndex) {
        rows.push({ type: "added", text: newLines[newIndex] });
        newIndex += 1;
      }
      continue;
    }

    const newCandidate = newIndex < newLines.length ? newLines[newIndex] : null;
    const reverseMatchIndex = newCandidate === null ? -1 : oldLines.indexOf(newCandidate, oldIndex + 1);
    if (reverseMatchIndex >= 0) {
      while (oldIndex < reverseMatchIndex) {
        rows.push({ type: "removed", text: oldLines[oldIndex] });
        oldIndex += 1;
      }
      continue;
    }

    if (oldIndex < oldLines.length) {
      rows.push({ type: "removed", text: oldLines[oldIndex] });
      oldIndex += 1;
    }
    if (newIndex < newLines.length) {
      rows.push({ type: "added", text: newLines[newIndex] });
      newIndex += 1;
    }
  }

  return rows;
}

export function processDiff(oldText, newText, params = {}) {
  const mode = params.mode === "json" ? "json" : "text";
  if (!oldText && !newText) return idle();

  const oldSizeError = checkInputSize(oldText);
  if (oldSizeError) return oldSizeError;
  const newSizeError = checkInputSize(newText);
  if (newSizeError) return newSizeError;

  let left = oldText;
  let right = newText;
  if (mode === "json") {
    try {
      left = JSON.stringify(JSON.parse(oldText), null, 2);
      right = JSON.stringify(JSON.parse(newText), null, 2);
    } catch (error) {
      return failure(error.message, { tool: "diff" });
    }
  }

  const rows = diffLines(left, right);
  const extra = {
    rows,
    added: rows.filter((row) => row.type === "added").length,
    removed: rows.filter((row) => row.type === "removed").length,
    same: rows.filter((row) => row.type === "same").length,
  };
  return success(rows.map((row) => `${row.type === "added" ? "+" : row.type === "removed" ? "-" : " "} ${row.text}`).join("\n"), { extra });
}

export function hexEncode(value) {
  return [...new TextEncoder().encode(value)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join(" ");
}

export function hexDecode(value) {
  const clean = value.replace(/0x/gi, "").replace(/[\s,]/g, "");
  if (!clean) return "";
  if (!/^[0-9a-f]+$/i.test(clean) || clean.length % 2 !== 0) {
    throw new Error("Hex 输入无效，必须由成对的十六进制字符组成。");
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(clean.slice(index * 2, index * 2 + 2), 16);
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function latin1ToUtf8(value) {
  const invalidIndex = [...value].findIndex((char) => char.charCodeAt(0) > 0xff);
  if (invalidIndex >= 0) {
    throw new Error(`Latin-1 输入在第 ${invalidIndex + 1} 个字符处包含超出 0xFF 的字符。`);
  }
  const bytes = Uint8Array.from(value, (char) => char.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function utf8ToLatin1(value) {
  const bytes = new TextEncoder().encode(value);
  return Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
}

export function processEncoding(input, params = {}) {
  const mode = ["hexDecode", "latin1ToUtf8", "utf8ToLatin1"].includes(params.mode) ? params.mode : "hexEncode";
  if (!input) return idle();
  const sizeError = checkInputSize(input);
  if (sizeError) return sizeError;
  try {
    if (mode === "hexEncode") return success(hexEncode(input), { mode });
    if (mode === "hexDecode") return success(hexDecode(input), { mode });
    if (mode === "latin1ToUtf8") return success(latin1ToUtf8(input), { mode });
    return success(utf8ToLatin1(input), { mode });
  } catch (error) {
    return failure(error.message, { tool: "encoding" });
  }
}

const HTML_NAMED_ENTITIES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "©": "&copy;",
  "®": "&reg;",
  "™": "&trade;",
  "€": "&euro;",
  "£": "&pound;",
  "¥": "&yen;",
  "…": "&hellip;",
  "←": "&larr;",
  "→": "&rarr;",
};

export function htmlEntityEncode(value, { numeric = false } = {}) {
  if (numeric) {
    return [...value].map((char) => {
      const codePoint = char.codePointAt(0);
      if (codePoint > 127 || "&<>\"'".includes(char)) return `&#${codePoint};`;
      return char;
    }).join("");
  }
  return [...value].map((char) => HTML_NAMED_ENTITIES[char] || (char.codePointAt(0) > 127 ? `&#${char.codePointAt(0)};` : char)).join("");
}

export function htmlEntityDecode(value) {
  const textarea = globalThis.document?.createElement("textarea");
  if (textarea) {
    textarea.innerHTML = value;
    return textarea.value;
  }

  return value
    .replace(/&([a-z]+);/gi, (match, name) => {
      const char = Object.entries(HTML_NAMED_ENTITIES).find(([, entity]) => entity === `&${name};`)?.[0];
      return char ?? match;
    })
    .replace(/&#(\d+);/g, (_, code) => {
      const number = Number(code);
      return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (match, code) => {
      const number = Number.parseInt(code, 16);
      return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : match;
    });
}

export function processHtmlEntity(input, params = {}) {
  const mode = params.mode === "decode" ? "decode" : "encode";
  if (!input) return idle();
  const sizeError = checkInputSize(input);
  if (sizeError) return sizeError;
  try {
    return success(mode === "encode" ? htmlEntityEncode(input, { numeric: params.numeric === true }) : htmlEntityDecode(input), { mode });
  } catch (error) {
    return failure(error.message, { tool: "entity" });
  }
}

function resolveCsvDelimiter(delimiter) {
  if (delimiter === "tab") return "\t";
  if (delimiter === ";" || delimiter === "|") return delimiter;
  return ",";
}

function parseCsvRows(text, delimiter) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  let index = 0;

  while (index < text.length) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      if (char === "\n") line += 1;
      field += char;
      index += 1;
      continue;
    }

    if (char === '"' && field === "") {
      inQuotes = true;
      index += 1;
      continue;
    }
    if (char === '"') {
      throw new Error(`CSV 第 ${line} 行：字段中出现未转义的引号。`);
    }
    if (char === delimiter) {
      row.push(field);
      field = "";
      index += 1;
      continue;
    }
    if (char === "\r") {
      if (text[index + 1] === "\n") {
        index += 1;
        continue;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      line += 1;
      index += 1;
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      line += 1;
      index += 1;
      continue;
    }
    field += char;
    index += 1;
  }

  if (inQuotes) {
    throw new Error(`CSV 第 ${line} 行：引号未闭合。`);
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function formatCsvCell(value, delimiter) {
  if (/[",\r\n]/.test(value) || value.includes(delimiter)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

export function csvToJson(text, params = {}) {
  const delimiter = resolveCsvDelimiter(params.delimiter);
  const rows = parseCsvRows(text, delimiter);
  if (!rows.length) return idle();

  const hasHeader = params.header !== false;
  const headerRow = hasHeader ? rows[0] : rows[0].map((_, index) => `column_${index + 1}`);
  const headers = headerRow.map((name, index) => name.trim() || `column_${index + 1}`);
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const records = [];

  for (const [rowIndex, row] of dataRows.entries()) {
    if (row.length !== headers.length) {
      const displayLine = rowIndex + (hasHeader ? 2 : 1);
      throw new Error(`CSV 第 ${displayLine} 行有 ${row.length} 列，表头需要 ${headers.length} 列。`);
    }
    const record = {};
    for (const [columnIndex, header] of headers.entries()) {
      record[header] = row[columnIndex];
    }
    records.push(record);
  }
  return success(JSON.stringify(records, null, 2), { mode: "toJson", delimiter });
}

export function jsonToCsv(text, params = {}) {
  const delimiter = resolveCsvDelimiter(params.delimiter);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`JSON 解析失败：${error.message}`);
  }

  const records = Array.isArray(parsed) ? parsed : [parsed];
  if (!records.length) return "";
  if (records.some((record) => !record || typeof record !== "object" || Array.isArray(record))) {
    throw new Error("JSON → CSV 输入必须是对象或对象数组。");
  }

  const columns = [];
  const seen = new Set();
  for (const record of records) {
    for (const key of Object.keys(record)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }

  const cell = (value) => {
    let output;
    if (value === null || value === undefined) output = "";
    else if (typeof value === "object") output = JSON.stringify(value);
    else output = String(value);
    return formatCsvCell(output, delimiter);
  };

  const lines = [columns.map(cell).join(delimiter)];
  for (const record of records) {
    lines.push(columns.map((column) => cell(record[column])).join(delimiter));
  }
  return lines.join("\r\n");
}

export function processCsv(input, params = {}) {
  if (!input.trim()) return idle();
  const sizeError = checkInputSize(input);
  if (sizeError) return sizeError;
  const mode = params.mode === "fromJson" ? "fromJson" : "toJson";
  try {
    if (mode === "fromJson") {
      return success(jsonToCsv(input, params), { mode, delimiter: resolveCsvDelimiter(params.delimiter) });
    }
    return csvToJson(input, params);
  } catch (error) {
    return failure(error.message, { tool: "csv" });
  }
}

function toPascalName(value, fallback = "Type") {
  const parts = String(value).split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (!parts.length) return fallback;
  return parts.map((part) => part[0].toUpperCase() + part.slice(1)).join("");
}

function primitiveTypeOf(value) {
  if (value === null) return "null";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "string";
}

function jsonToTsInfer(value, suggestedName, context) {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
    return primitiveTypeOf(value);
  }

  if (Array.isArray(value)) {
    if (!value.length) return "unknown[]";
    const allObjects = value.every((item) => item && typeof item === "object" && !Array.isArray(item));
    if (allObjects) {
      const keys = [];
      const seen = new Set();
      for (const item of value) {
        for (const key of Object.keys(item)) {
          if (!seen.has(key)) {
            seen.add(key);
            keys.push(key);
          }
        }
      }
      const fields = {};
      for (const key of keys) {
        const present = value.filter((item) => key in item);
        const childName = toPascalName(key);
        const types = [...new Set(present.map((item) => jsonToTsInfer(item[key], childName, context)))];
        fields[key] = {
          type: types.join(" | "),
          required: present.length === value.length,
        };
      }
      return `${jsonToTsRegister(fields, suggestedName, context)}[]`;
    }

    const types = [...new Set(value.map((item) => jsonToTsInfer(item, `${suggestedName}Item`, context)))];
    return types.length === 1 ? `${types[0]}[]` : `(${types.join(" | ")})[]`;
  }

  const fields = {};
  for (const [key, child] of Object.entries(value)) {
    fields[key] = {
      type: jsonToTsInfer(child, toPascalName(key), context),
      required: true,
    };
  }
  return jsonToTsRegister(fields, suggestedName, context);
}

function jsonToTsRegister(fields, suggestedName, context) {
  const signature = JSON.stringify(Object.entries(fields).map(([key, field]) => [key, field.type, field.required]));
  if (context.signatureToName.has(signature)) {
    return context.signatureToName.get(signature);
  }

  let name = toPascalName(suggestedName, "Type");
  if (!/^[A-Za-z]/.test(name)) name = `T${name}`;
  let candidate = name;
  let suffix = 2;
  while (context.usedNames.has(candidate)) {
    candidate = `${name}${suffix}`;
    suffix += 1;
  }
  context.usedNames.add(candidate);
  context.signatureToName.set(signature, candidate);

  const entries = Object.entries(fields).map(([key, field]) => {
    const safeKey = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
    return `  ${safeKey}${field.required ? "" : "?"}: ${field.type};`;
  });
  context.interfaces.push(`interface ${candidate} {\n${entries.join("\n")}\n}`);
  return candidate;
}

export function jsonToTypeScript(value, rootName = "Root") {
  const context = {
    interfaces: [],
    signatureToName: new Map(),
    usedNames: new Set(),
  };
  const safeRootName = toPascalName(rootName || "Root", "Root");
  const type = jsonToTsInfer(value, safeRootName, context);
  if (!context.interfaces.length) {
    return `export type ${safeRootName} = ${type};`;
  }
  return context.interfaces.join("\n\n");
}

export function processJsonToTs(input, params = {}) {
  if (!input.trim()) return idle();
  const sizeError = checkInputSize(input);
  if (sizeError) return sizeError;

  let parsed;
  try {
    parsed = JSON.parse(input);
  } catch (error) {
    return failure(error.message, { tool: "jsonts" });
  }
  try {
    const rootName = typeof params.rootName === "string" && params.rootName.trim() ? params.rootName.trim() : "Root";
    return success(jsonToTypeScript(parsed, rootName), { rootName });
  } catch (error) {
    return failure(error.message, { tool: "jsonts" });
  }
}

function xmlLineAt(text, index) {
  return text.slice(0, index).split("\n").length;
}

function parseXmlTokens(text) {
  const tokens = [];
  const fail = (message, index) => {
    throw new Error(`${message}（第 ${xmlLineAt(text, index)} 行）。`);
  };
  let pos = 0;

  while (pos < text.length) {
    const lt = text.indexOf("<", pos);
    if (lt === -1) {
      const tail = text.slice(pos);
      if (tail.trim()) tokens.push({ type: "text", value: tail });
      break;
    }
    if (lt > pos) {
      const head = text.slice(pos, lt);
      if (head.trim()) tokens.push({ type: "text", value: head });
    }

    if (text.startsWith("<!--", lt)) {
      const end = text.indexOf("-->", lt + 4);
      if (end === -1) fail("XML 注释未闭合", lt);
      tokens.push({ type: "comment", value: text.slice(lt, end + 3), line: xmlLineAt(text, lt) });
      pos = end + 3;
      continue;
    }
    if (text.startsWith("<![CDATA[", lt)) {
      const end = text.indexOf("]]>", lt + 9);
      if (end === -1) fail("XML CDATA 未闭合", lt);
      tokens.push({ type: "cdata", value: text.slice(lt, end + 3), line: xmlLineAt(text, lt) });
      pos = end + 3;
      continue;
    }
    if (text.startsWith("<?", lt)) {
      const end = text.indexOf("?>", lt + 2);
      if (end === -1) fail("XML 处理指令未闭合", lt);
      tokens.push({ type: "pi", value: text.slice(lt, end + 2), line: xmlLineAt(text, lt) });
      pos = end + 2;
      continue;
    }
    if (text.startsWith("<!", lt)) {
      const end = text.indexOf(">", lt + 2);
      if (end === -1) fail("XML 声明未闭合", lt);
      tokens.push({ type: "doctype", value: text.slice(lt, end + 1), line: xmlLineAt(text, lt) });
      pos = end + 1;
      continue;
    }
    if (text.startsWith("</", lt)) {
      const gt = text.indexOf(">", lt);
      if (gt === -1) fail("XML 结束标签未闭合", lt);
      const name = text.slice(lt + 2, gt).trim();
      if (!name || /[\s/>]/.test(name)) fail("XML 结束标签名称无效", lt);
      tokens.push({ type: "close", name, line: xmlLineAt(text, lt) });
      pos = gt + 1;
      continue;
    }

    let cursor = lt + 1;
    let quote = null;
    while (cursor < text.length) {
      const char = text[cursor];
      if (quote) {
        if (char === quote) quote = null;
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === ">") {
        break;
      }
      cursor += 1;
    }
    if (cursor >= text.length) fail("XML 开始标签未闭合", lt);

    const inner = text.slice(lt + 1, cursor);
    const selfClosing = inner.endsWith("/");
    const body = selfClosing ? inner.slice(0, -1) : inner;
    const nameMatch = /^([^\s/>]+)/.exec(body);
    if (!nameMatch) fail("XML 标签名称无效", lt);
    const attrs = body.slice(nameMatch[0].length);
    if (!/^(?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*\s*$/.test(attrs)) {
      fail("XML 属性格式无效，请检查引号是否闭合", lt);
    }
    tokens.push({
      type: selfClosing ? "self" : "open",
      name: nameMatch[0],
      raw: text.slice(lt, cursor + 1),
      line: xmlLineAt(text, lt),
    });
    pos = cursor + 1;
  }
  return tokens;
}

export function validateXml(text) {
  const tokens = parseXmlTokens(text);
  const stack = [];
  let rootCount = 0;

  for (const token of tokens) {
    if (token.type === "open") {
      if (!stack.length) {
        rootCount += 1;
        if (rootCount > 1) {
          throw new Error(`XML 只能有一个根元素（第 ${token.line} 行出现多余根元素）。`);
        }
      }
      stack.push(token);
    } else if (token.type === "close") {
      const top = stack.pop();
      if (!top) {
        throw new Error(`XML 第 ${token.line} 行：出现多余的结束标签 </${token.name}>。`);
      }
      if (top.name !== token.name) {
        throw new Error(`XML 第 ${token.line} 行：结束标签 </${token.name}> 与开始标签 <${top.name}> 不匹配。`);
      }
    }
  }

  if (stack.length) {
    const top = stack[stack.length - 1];
    throw new Error(`XML 第 ${top.line} 行：开始标签 <${top.name}> 未闭合。`);
  }
  if (!rootCount) {
    throw new Error("XML 缺少根元素。");
  }
  return { ok: true, elements: rootCount };
}

export function formatXml(text, { indent = "2" } = {}) {
  validateXml(text);
  const tokens = parseXmlTokens(text);
  const unit = indent === "tab" ? "\t" : indent === "4" ? "    " : "  ";
  const lines = [];
  let depth = 0;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const pad = unit.repeat(depth);
    if (token.type === "text") {
      lines.push(pad + token.value.trim());
      continue;
    }
    if (token.type === "close") {
      depth = Math.max(0, depth - 1);
      lines.push(unit.repeat(depth) + `</${token.name}>`);
      continue;
    }
    if (token.type === "open") {
      const next = tokens[index + 1];
      const after = tokens[index + 2];
      if (next && next.type === "text" && after && after.type === "close" && after.name === token.name) {
        lines.push(`${pad}${token.raw.slice(0, -1)}>${next.value.trim()}</${token.name}>`);
        index += 2;
        continue;
      }
      lines.push(pad + token.raw);
      depth += 1;
      continue;
    }
    lines.push(pad + (token.value ?? token.raw));
  }
  return lines.join("\n");
}

export function processXml(input, params = {}) {
  if (!input.trim()) return idle();
  const sizeError = checkInputSize(input);
  if (sizeError) return sizeError;
  try {
    const indent = ["2", "4", "tab"].includes(params.indent) ? params.indent : "2";
    return success(formatXml(input, { indent }), { indent });
  } catch (error) {
    const lineMatch = /第 (\d+) 行/.exec(error.message);
    return failure(error.message, { tool: "xml", line: lineMatch ? Number(lineMatch[1]) : null });
  }
}

const SQL_CASE_KEYWORDS = new Set([
  "SELECT", "FROM", "WHERE", "AND", "OR", "NOT", "NULL", "AS", "ON", "JOIN", "LEFT", "RIGHT", "FULL",
  "INNER", "OUTER", "CROSS", "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE", "CREATE", "TABLE",
  "PRIMARY", "KEY", "FOREIGN", "REFERENCES", "GROUP", "BY", "ORDER", "HAVING", "LIMIT", "OFFSET",
  "DISTINCT", "UNION", "UNION ALL", "INTERSECT", "EXCEPT", "IN", "BETWEEN", "LIKE", "IS", "EXISTS",
  "CASE", "WHEN", "THEN", "ELSE", "END", "ASC", "DESC", "RETURNING", "DEFAULT", "UNIQUE", "INDEX", "VIEW",
]);
const SQL_MAJOR_KEYWORDS = new Set([
  "SELECT", "FROM", "WHERE", "GROUP BY", "HAVING", "ORDER BY", "LIMIT", "OFFSET",
  "UNION", "UNION ALL", "INTERSECT", "EXCEPT", "VALUES", "RETURNING", "SET",
]);

function tokenizeSql(text) {
  const tokens = [];
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === "-" && text[index + 1] === "-") {
      const end = text.indexOf("\n", index);
      const stop = end === -1 ? text.length : end;
      tokens.push({ type: "comment", value: text.slice(index, stop).trim() });
      index = stop;
      continue;
    }
    if (char === "/" && text[index + 1] === "*") {
      const end = text.indexOf("*/", index + 2);
      if (end === -1) throw new Error("SQL 块注释未闭合。");
      tokens.push({ type: "comment", value: text.slice(index, end + 2) });
      index = end + 2;
      continue;
    }
    if (char === "'") {
      let cursor = index + 1;
      while (cursor < text.length) {
        if (text[cursor] === "'" && text[cursor + 1] === "'") {
          cursor += 2;
          continue;
        }
        if (text[cursor] === "'") break;
        cursor += 1;
      }
      if (cursor >= text.length) throw new Error("SQL 字符串字面量未闭合。");
      tokens.push({ type: "string", value: text.slice(index, cursor + 1) });
      index = cursor + 1;
      continue;
    }
    if (char === '"' || char === "`") {
      const end = text.indexOf(char, index + 1);
      if (end === -1) throw new Error("SQL 引用标识符未闭合。");
      tokens.push({ type: "quoted", value: text.slice(index, end + 1) });
      index = end + 1;
      continue;
    }
    if (char === "[") {
      const end = text.indexOf("]", index);
      if (end === -1) throw new Error("SQL 括号标识符未闭合。");
      tokens.push({ type: "quoted", value: text.slice(index, end + 1) });
      index = end + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      let cursor = index;
      while (cursor < text.length && /[\w$]/.test(text[cursor])) cursor += 1;
      tokens.push({ type: "word", value: text.slice(index, cursor) });
      index = cursor;
      continue;
    }
    if (/[0-9]/.test(char) || (char === "." && /[0-9]/.test(text[index + 1] ?? ""))) {
      let cursor = index + 1;
      while (cursor < text.length && /[\w.]/.test(text[cursor])) cursor += 1;
      tokens.push({ type: "number", value: text.slice(index, cursor) });
      index = cursor;
      continue;
    }
    tokens.push({ type: "punct", value: char });
    index += 1;
  }
  return tokens;
}

export function formatSql(text, { indent = "2", uppercase = true } = {}) {
  const tokens = tokenizeSql(text);
  const unit = indent === "tab" ? "\t" : indent === "4" ? "    " : "  ";
  const lines = [];
  let line = "";
  let depth = 0;
  let clauseIndent = 0;

  const flush = () => {
    if (line.trim()) lines.push(unit.repeat(clauseIndent) + line.trim());
    line = "";
  };
  const emit = (value) => {
    if (!line) {
      line = value;
      return;
    }
    const glueBefore = /^[.,;)]/.test(value);
    const lastChar = line.trimEnd().slice(-1);
    const glueAfter = lastChar === "(" || lastChar === ".";
    line += glueBefore || glueAfter ? value : ` ${value}`;
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === "comment") {
      flush();
      lines.push(unit.repeat(clauseIndent) + token.value);
      continue;
    }

    if (token.type === "word" && depth === 0) {
      const next = tokens[index + 1];
      const twoWord = next && next.type === "word" ? `${token.value.toUpperCase()} ${next.value.toUpperCase()}` : "";
      const keyword = SQL_MAJOR_KEYWORDS.has(twoWord) ? twoWord : token.value.toUpperCase();

      if (SQL_MAJOR_KEYWORDS.has(keyword)) {
        flush();
        clauseIndent = 0;
        emit(uppercase || keyword === twoWord ? keyword : token.value);
        if (keyword === twoWord) index += 1;
        continue;
      }
      if (token.value.toUpperCase() === "JOIN") {
        const modifierMatch = / ((?:LEFT|RIGHT|FULL|INNER|OUTER|CROSS)(?: (?:LEFT|RIGHT|FULL|INNER|OUTER|CROSS))*)$/i.exec(line);
        let modifiers = "";
        if (modifierMatch) {
          modifiers = modifierMatch[1];
          line = line.slice(0, modifierMatch.index);
        }
        flush();
        clauseIndent = 1;
        emit(`${modifiers} ${uppercase ? "JOIN" : token.value}`.trim());
        continue;
      }
      if (["AND", "OR"].includes(token.value.toUpperCase())) {
        flush();
        clauseIndent = Math.max(clauseIndent, 1);
        emit(uppercase ? token.value.toUpperCase() : token.value);
        continue;
      }
    }

    if (token.type === "punct" && token.value === "(") depth += 1;
    if (token.type === "punct" && token.value === ")") depth = Math.max(0, depth - 1);

    if (token.type === "punct" && token.value === ";") {
      emit(";");
      flush();
      clauseIndent = 0;
      continue;
    }
    const display = token.type === "word" && uppercase && SQL_CASE_KEYWORDS.has(token.value.toUpperCase())
      ? token.value.toUpperCase()
      : token.value;
    emit(display);
  }
  flush();
  return lines.join("\n");
}

export function processSql(input, params = {}) {
  if (!input.trim()) return idle();
  const sizeError = checkInputSize(input);
  if (sizeError) return sizeError;
  try {
    const uppercase = params.uppercase !== false;
    const indent = ["2", "4", "tab"].includes(params.indent) ? params.indent : "2";
    return success(formatSql(input, { indent, uppercase }), { indent, uppercase });
  } catch (error) {
    return failure(error.message, { tool: "sql" });
  }
}

function escapeHtmlText(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeHtmlAttr(value) {
  return escapeHtmlText(value).replaceAll('"', "&quot;");
}

function renderMarkdownInline(text) {
  const codeSpans = [];
  let worked = escapeHtmlText(text).replace(/`([^`]+)`/g, (_, code) => {
    codeSpans.push(`<code>${code}</code>`);
    return `\u0000${codeSpans.length - 1}\u0000`;
  });
  worked = worked
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => `<img src="${escapeHtmlAttr(src)}" alt="${alt}">`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => `<a href="${escapeHtmlAttr(href)}">${label}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return worked.replace(/\u0000(\d+)\u0000/g, (_, index) => codeSpans[Number(index)]);
}

export function renderMarkdown(text) {
  const rawLines = text.split("\n");
  const html = [];
  let index = 0;

  while (index < rawLines.length) {
    const line = rawLines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = /^\s*```(\S*)\s*$/.exec(line);
    if (fence) {
      const codeLines = [];
      index += 1;
      while (index < rawLines.length && !/^\s*```\s*$/.test(rawLines[index])) {
        codeLines.push(rawLines[index]);
        index += 1;
      }
      if (index >= rawLines.length) throw new Error("Markdown 代码块未闭合。");
      index += 1;
      const langClass = fence[1] ? ` class="language-${escapeHtmlAttr(fence[1])}"` : "";
      html.push(`<pre><code${langClass}>${escapeHtmlText(codeLines.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      html.push(`<h${heading[1].length}>${renderMarkdownInline(heading[2])}</h${heading[1].length}>`);
      index += 1;
      continue;
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      html.push("<hr>");
      index += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quoteLines = [];
      while (index < rawLines.length && /^\s*>\s?/.test(rawLines[index])) {
        quoteLines.push(rawLines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      html.push(`<blockquote>\n${renderMarkdown(quoteLines.join("\n")).trimEnd()}\n</blockquote>`);
      continue;
    }

    const ulMatch = /^\s*[-*+]\s+/.test(line);
    const olMatch = /^\s*\d+[.)]\s+/.test(line);
    if (ulMatch || olMatch) {
      const items = [];
      const itemPattern = ulMatch ? /^\s*[-*+]\s+/ : /^\s*\d+[.)]\s+/;
      while (index < rawLines.length && itemPattern.test(rawLines[index])) {
        items.push(rawLines[index].replace(itemPattern, ""));
        index += 1;
      }
      const tag = olMatch ? "ol" : "ul";
      html.push(`<${tag}>\n${items.map((item) => `  <li>${renderMarkdownInline(item)}</li>`).join("\n")}\n</${tag}>`);
      continue;
    }

    const paragraph = [];
    while (index < rawLines.length && rawLines[index].trim() &&
      !/^\s*(?:```|#{1,6}\s|>\s?|[-*+]\s+|\d+[.)]\s+|-{3,}|\*{3,}|_{3,})/.test(rawLines[index])) {
      paragraph.push(rawLines[index].trim());
      index += 1;
    }
    html.push(`<p>${renderMarkdownInline(paragraph.join("\n"))}</p>`);
  }
  return html.join("\n");
}

export function processMarkdown(input) {
  if (!input.trim()) return idle();
  const sizeError = checkInputSize(input);
  if (sizeError) return sizeError;
  try {
    return success(renderMarkdown(input), {});
  } catch (error) {
    return failure(error.message, { tool: "markdown" });
  }
}

function stripInlineComment(raw) {
  let quote = null;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "#" && (index === 0 || /\s/.test(raw[index - 1]))) {
      return raw.slice(0, index);
    }
  }
  return raw;
}

function unquoteYaml(value, line) {
  if (value.startsWith('"')) {
    if (!value.endsWith('"') || value.length < 2) throw new Error(`YAML 第 ${line} 行：双引号字符串未闭合。`);
    return value.slice(1, -1).replaceAll('\\"', '"').replaceAll("\\n", "\n").replaceAll("\\t", "\t").replaceAll("\\\\", "\\");
  }
  if (value.startsWith("'")) {
    if (!value.endsWith("'") || value.length < 2) throw new Error(`YAML 第 ${line} 行：单引号字符串未闭合。`);
    return value.slice(1, -1).replaceAll("''", "'");
  }
  return value;
}

function splitFlowItems(value, line, kind) {
  const items = [];
  let current = "";
  let quote = null;
  let depth = 0;
  for (const char of value) {
    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === "[" || char === "{") depth += 1;
    if (char === "]" || char === "}") depth -= 1;
    if (char === "," && depth === 0) {
      items.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (quote) throw new Error(`YAML 第 ${line} 行：行内集合引号未闭合。`);
  if (current.trim() || items.length) items.push(current.trim());
  if (items.some((item) => item.startsWith("[") || item.startsWith("{"))) {
    throw new Error(`YAML 第 ${line} 行：暂不支持嵌套行内${kind}。`);
  }
  return items;
}

function parseYamlScalar(raw, line) {
  const value = raw.trim();
  if (!value) return null;
  if (value === "~" || value === "null" || value === "Null" || value === "NULL") return null;
  if (value === "true" || value === "True" || value === "TRUE") return true;
  if (value === "false" || value === "False" || value === "FALSE") return false;
  if (/^[+-]?\d+$/.test(value)) return Number(value);
  if (/^[+-]?\d+\.\d+$/.test(value)) return Number(value);
  if (value.startsWith("[") || value.startsWith("{")) {
    const closing = value.startsWith("[") ? "]" : "}";
    if (!value.endsWith(closing)) throw new Error(`YAML 第 ${line} 行：行内集合未闭合。`);
    const inner = value.slice(1, -1).trim();
    if (!inner) return value.startsWith("[") ? [] : {};
    if (value.startsWith("[")) return splitFlowItems(inner, line, "数组").map((item) => parseYamlScalar(item, line));
    const map = {};
    for (const pair of splitFlowItems(inner, line, "映射")) {
      const colon = pair.indexOf(":");
      if (colon <= 0) throw new Error(`YAML 第 ${line} 行：行内映射格式无效。`);
      map[unquoteYaml(pair.slice(0, colon).trim(), line)] = parseYamlScalar(pair.slice(colon + 1), line);
    }
    return map;
  }
  if (value.startsWith('"') || value.startsWith("'")) return unquoteYaml(value, line);
  return value;
}

function findMapColon(text) {
  let quote = null;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ":" && (index === text.length - 1 || text[index + 1] === " ")) return index;
  }
  return -1;
}

export function parseYaml(text) {
  const rawLines = text.split("\n");
  const entries = [];
  for (const [index, raw] of rawLines.entries()) {
    if (/^\t|^\s+\t/.test(raw)) {
      throw new Error(`YAML 第 ${index + 1} 行：缩进不能使用 Tab。`);
    }
    const noComment = stripInlineComment(raw);
    const trimmed = noComment.trim();
    if (!trimmed) continue;
    if (trimmed === "---" || trimmed === "...") {
      throw new Error(`YAML 第 ${index + 1} 行：暂不支持多文档 YAML。`);
    }
    entries.push({
      indent: noComment.length - noComment.trimStart().length,
      text: trimmed,
      raw: noComment,
      line: index + 1,
    });
  }
  if (!entries.length) return null;

  const isSeqItem = (entry) => entry.text.startsWith("- ") || entry.text === "-";

  const parseBlock = (start, minIndent) => {
    const first = entries[start];
    const indent = first.indent;
    if (indent < minIndent) return { value: null, next: start };

    if (isSeqItem(first)) {
      const items = [];
      let cursor = start;
      while (cursor < entries.length && entries[cursor].indent === indent && isSeqItem(entries[cursor])) {
        const rest = entries[cursor].text === "-" ? "" : entries[cursor].text.slice(2).trim();
        if (!rest) {
          if (cursor + 1 < entries.length && entries[cursor + 1].indent > indent) {
            const nested = parseBlock(cursor + 1, indent + 1);
            items.push(nested.value);
            cursor = nested.next;
          } else {
            items.push(null);
            cursor += 1;
          }
          continue;
        }
        if (findMapColon(rest) >= 0) {
          const saved = entries[cursor];
          entries[cursor] = { ...saved, indent: indent + 2, text: rest };
          const nested = parseBlock(cursor, indent + 1);
          entries[cursor] = saved;
          items.push(nested.value);
          cursor = nested.next;
          continue;
        }
        items.push(parseYamlScalar(rest, entries[cursor].line));
        cursor += 1;
      }
      return { value: items, next: cursor };
    }

    const map = {};
    let cursor = start;
    while (cursor < entries.length) {
      const entry = entries[cursor];
      if (entry.indent < indent) break;
      if (entry.indent > indent) {
        throw new Error(`YAML 第 ${entry.line} 行：缩进不一致。`);
      }
      if (isSeqItem(entry)) break;
      const colon = findMapColon(entry.text);
      if (colon < 0) {
        throw new Error(`YAML 第 ${entry.line} 行：无法识别映射键。`);
      }
      const key = unquoteYaml(entry.text.slice(0, colon).trim(), entry.line);
      const valueRaw = entry.text.slice(colon + 1).trim();

      if (valueRaw === "|" || valueRaw === "|-") {
        const blockLines = [];
        let probe = cursor + 1;
        let blockIndent = null;
        while (probe < entries.length && entries[probe].indent > indent) {
          if (blockIndent === null) blockIndent = entries[probe].raw.match(/^ */)[0].length;
          blockLines.push(entries[probe].raw.slice(blockIndent));
          probe += 1;
        }
        map[key] = blockLines.join("\n") + (valueRaw === "|" ? "\n" : "");
        cursor = probe;
        continue;
      }

      if (valueRaw) {
        map[key] = parseYamlScalar(valueRaw, entry.line);
        cursor += 1;
        continue;
      }

      if (cursor + 1 < entries.length) {
        const next = entries[cursor + 1];
        if (next.indent > indent) {
          const nested = parseBlock(cursor + 1, indent + 1);
          map[key] = nested.value;
          cursor = nested.next;
          continue;
        }
        if (next.indent === indent && isSeqItem(next)) {
          const nested = parseBlock(cursor + 1, indent);
          map[key] = nested.value;
          cursor = nested.next;
          continue;
        }
      }
      map[key] = null;
      cursor += 1;
    }
    return { value: map, next: cursor };
  };

  if (!findMapColon(entries[0].text) && !isSeqItem(entries[0]) && entries.length === 1) {
    return parseYamlScalar(entries[0].text, entries[0].line);
  }

  const result = parseBlock(0, 0);
  if (result.next < entries.length) {
    throw new Error(`YAML 第 ${entries[result.next].line} 行：缩进不一致或无法识别的结构。`);
  }
  return result.value;
}

function yamlPlainSafe(value) {
  return value !== "" && value.trim() === value &&
    !/^[\s&*!|>'"%@`{}\[\],#-]/.test(value) &&
    !/[:#]/.test(value) &&
    !/^(true|false|null|~|True|False|Null|TRUE|FALSE|NULL)$/i.test(value) &&
    !/^[+-]?\d+(\.\d+)?$/.test(value);
}

function yamlString(value) {
  if (yamlPlainSafe(value)) return value;
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n").replaceAll("\t", "\\t")}"`;
}

function yamlKey(key) {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : yamlString(key);
}

function jsonToYamlLines(value, indent) {
  const pad = " ".repeat(indent);
  if (Array.isArray(value)) {
    if (!value.length) return [`${pad}[]`];
    const lines = [];
    for (const item of value) {
      if (item && typeof item === "object") {
        const child = jsonToYamlLines(item, indent + 2);
        lines.push(`${pad}- ${child[0].trim()}`);
        lines.push(...child.slice(1));
      } else {
        lines.push(`${pad}- ${item === null ? "null" : typeof item === "string" ? yamlString(item) : String(item)}`);
      }
    }
    return lines;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (!entries.length) return [`${pad}{}`];
    const lines = [];
    for (const [key, child] of entries) {
      if (child === null || typeof child !== "object") {
        lines.push(`${pad}${yamlKey(key)}: ${child === null ? "null" : typeof child === "string" ? yamlString(child) : String(child)}`);
      } else if (!Object.keys(child).length) {
        lines.push(`${pad}${yamlKey(key)}: ${Array.isArray(child) ? "[]" : "{}"}`);
      } else {
        lines.push(`${pad}${yamlKey(key)}:`);
        lines.push(...jsonToYamlLines(child, indent + 2));
      }
    }
    return lines;
  }
  return [`${pad}${value === null ? "null" : typeof value === "string" ? yamlString(value) : String(value)}`];
}

export function jsonToYaml(value) {
  return jsonToYamlLines(value, 0).join("\n") + "\n";
}

export function processYaml(input, params = {}) {
  if (!input.trim()) return idle();
  const sizeError = checkInputSize(input);
  if (sizeError) return sizeError;
  const mode = params.mode === "fromJson" ? "fromJson" : "toJson";
  try {
    if (mode === "fromJson") {
      let parsed;
      try {
        parsed = JSON.parse(input);
      } catch (error) {
        throw new Error(`JSON 解析失败：${error.message}`);
      }
      return success(jsonToYaml(parsed), { mode });
    }
    const parsed = parseYaml(input);
    return success(JSON.stringify(parsed, null, 2), { mode });
  } catch (error) {
    const lineMatch = /第 (\d+) 行/.exec(error.message);
    return failure(error.message, { tool: "yaml", line: lineMatch ? Number(lineMatch[1]) : null });
  }
}

function parseTomlString(value, line) {
  if (value.startsWith('"')) {
    let out = "";
    let index = 1;
    while (index < value.length) {
      const char = value[index];
      if (char === '"') return { text: out, end: index };
      if (char === "\\") {
        const next = value[index + 1];
        const escapes = { '"': '"', "\\": "\\", n: "\n", t: "\t", r: "\r" };
        if (next === "u" || next === "U") {
          const size = next === "u" ? 4 : 8;
          const hex = value.slice(index + 2, index + 2 + size);
          if (!/^[0-9a-fA-F]+$/.test(hex)) throw new Error(`TOML 第 ${line} 行：Unicode 转义无效。`);
          out += String.fromCodePoint(Number.parseInt(hex, 16));
          index += 2 + size;
          continue;
        }
        if (!(next in escapes)) throw new Error(`TOML 第 ${line} 行：转义字符无效。`);
        out += escapes[next];
        index += 2;
        continue;
      }
      out += char;
      index += 1;
    }
    throw new Error(`TOML 第 ${line} 行：字符串未闭合。`);
  }
  const end = value.indexOf("'", 1);
  if (end === -1) throw new Error(`TOML 第 ${line} 行：字符串未闭合。`);
  return { text: value.slice(1, end), end };
}

function splitTomlTopLevel(text) {
  const items = [];
  let current = "";
  let quote = null;
  let depth = 0;
  for (const char of text) {
    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === "[" || char === "{") depth += 1;
    if (char === "]" || char === "}") depth -= 1;
    if (char === "," && depth === 0) {
      items.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (quote) throw new Error("TOML 集合引号未闭合。");
  if (current.trim() || items.length) items.push(current.trim());
  return items;
}

function parseTomlValue(raw, line) {
  const value = raw.trim();
  if (!value) throw new Error(`TOML 第 ${line} 行：缺少值。`);
  if (value.startsWith('"') || value.startsWith("'")) {
    const parsed = parseTomlString(value, line);
    const rest = value.slice(parsed.end + 1).trim();
    if (rest) throw new Error(`TOML 第 ${line} 行：字符串后有多余内容。`);
    return parsed.text;
  }
  if (value === "true") return true;
  if (value === "false") return false;
  if (value.startsWith("[") || value.startsWith("{")) {
    const closing = value.startsWith("[") ? "]" : "}";
    if (!value.endsWith(closing)) {
      throw new Error(`TOML 第 ${line} 行：暂不支持跨行的${value.startsWith("[") ? "数组" : "行内表"}。`);
    }
    const inner = value.slice(1, -1).trim();
    if (!inner) return value.startsWith("[") ? [] : {};
    if (value.startsWith("[")) return splitTomlTopLevel(inner).map((item) => parseTomlValue(item, line));
    const map = {};
    for (const pair of splitTomlTopLevel(inner)) {
      const eq = pair.indexOf("=");
      if (eq <= 0) throw new Error(`TOML 第 ${line} 行：行内表格式无效。`);
      map[tomlKeyRaw(pair.slice(0, eq).trim())] = parseTomlValue(pair.slice(eq + 1), line);
    }
    return map;
  }
  if (/^[+-]?\d+(_\d+)*$/.test(value)) return Number(value.replaceAll("_", ""));
  if (/^0x[0-9a-f]+$/i.test(value)) return Number.parseInt(value.slice(2), 16);
  if (/^0o[0-7]+$/i.test(value)) return Number.parseInt(value.slice(2), 8);
  if (/^0b[01]+$/i.test(value)) return Number.parseInt(value.slice(2), 2);
  if (/^[+-]?(\d+(_\d+)*)*\.?\d+(_\d+)*([eE][+-]?\d+)?$/.test(value) && /[.eE]/.test(value)) {
    return Number(value.replaceAll("_", ""));
  }
  throw new Error(`TOML 第 ${line} 行：无法识别的值（暂不支持日期时间与多行字符串）。`);
}

function tomlKeyRaw(key) {
  if (key.startsWith('"') || key.startsWith("'")) return unquoteYaml(key, 0);
  return key;
}

function parseTomlKeyPath(key) {
  const parts = [];
  let current = "";
  let quote = null;
  for (const char of key) {
    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === ".") {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current.trim());
  return parts.map((part) => {
    if (!part) throw new Error("TOML 键名无效。");
    return tomlKeyRaw(part);
  });
}

export function parseToml(text) {
  const root = {};
  let current = root;
  const definedTables = new Set();

  text.split("\n").forEach((raw, index) => {
    const line = index + 1;
    const noComment = stripInlineComment(raw);
    const trimmed = noComment.trim();
    if (!trimmed) return;

    if (trimmed.startsWith("[[")) {
      if (!trimmed.endsWith("]]")) throw new Error(`TOML 第 ${line} 行：数组表头未闭合。`);
      const path = parseTomlKeyPath(trimmed.slice(2, -2));
      let node = root;
      for (const part of path) {
        if (!(part in node)) node[part] = {};
        node = node[part];
        if (Array.isArray(node) && node.length) node = node[node.length - 1];
      }
      const parent = path.length > 1 ? getPath(root, path.slice(0, -1)) : root;
      const key = path[path.length - 1];
      if (!Array.isArray(parent[key])) parent[key] = [];
      parent[key].push({});
      current = parent[key][parent[key].length - 1];
      return;
    }
    if (trimmed.startsWith("[")) {
      if (!trimmed.endsWith("]")) throw new Error(`TOML 第 ${line} 行：表头未闭合。`);
      const path = parseTomlKeyPath(trimmed.slice(1, -1));
      const signature = path.join(".");
      if (definedTables.has(signature)) throw new Error(`TOML 第 ${line} 行：表 [${signature}] 重复定义。`);
      definedTables.add(signature);
      let node = root;
      for (const part of path) {
        if (part in node && (typeof node[part] !== "object" || node[part] === null || Array.isArray(node[part]))) {
          throw new Error(`TOML 第 ${line} 行：[${signature}] 与已有键冲突。`);
        }
        if (!(part in node)) node[part] = {};
        node = node[part];
      }
      current = node;
      return;
    }

    const eq = findTomlEquals(trimmed);
    if (eq < 0) throw new Error(`TOML 第 ${line} 行：无法识别的行。`);
    const keyPath = parseTomlKeyPath(trimmed.slice(0, eq).trim());
    let node = current;
    for (const part of keyPath.slice(0, -1)) {
      if (!(part in node) || typeof node[part] !== "object" || Array.isArray(node[part])) node[part] = {};
      node = node[part];
    }
    const key = keyPath[keyPath.length - 1];
    if (key in node) throw new Error(`TOML 第 ${line} 行：键 ${key} 重复定义。`);
    node[key] = parseTomlValue(trimmed.slice(eq + 1), line);
  });

  return root;
}

function getPath(object, path) {
  return path.reduce((node, part) => node?.[part], object);
}

function findTomlEquals(text) {
  let quote = null;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "=") return index;
  }
  return -1;
}

function tomlString(value) {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n").replaceAll("\t", "\\t")}"`;
}

function tomlKeyValue(value) {
  if (value === null || value === undefined) throw new Error("TOML 不支持 null 值。");
  if (typeof value === "string") return tomlString(value);
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.some((item) => item && typeof item === "object")) {
      throw new Error("TOML 数组仅支持标量元素；对象数组请使用 [[table]] 结构。");
    }
    return `[${value.map((item) => tomlKeyValue(item)).join(", ")}]`;
  }
  throw new Error("TOML 行内表暂不支持在值位置输出嵌套对象。");
}

function tomlKey(key) {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : tomlString(key);
}

function jsonToTomlWalk(value, prefix, lines) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("JSON → TOML 根必须是对象。");
  }
  const entries = Object.entries(value);
  for (const [key, child] of entries) {
    const objectArray = Array.isArray(child) && child.some((item) => item && typeof item === "object" && !Array.isArray(item));
    if (child !== null && typeof child === "object" && (!Array.isArray(child) || objectArray)) continue;
    lines.push(`${tomlKey(key)} = ${tomlKeyValue(child)}`);
  }
  for (const [key, child] of entries) {
    if (child === null || typeof child !== "object") continue;
    const path = prefix ? `${prefix}.${tomlKey(key)}` : tomlKey(key);
    if (Array.isArray(child)) {
      if (!child.length) continue;
      const allObjects = child.every((item) => item && typeof item === "object" && !Array.isArray(item));
      const anyObject = child.some((item) => item && typeof item === "object" && !Array.isArray(item));
      if (!anyObject) continue;
      if (!allObjects) throw new Error(`TOML 键 ${key} 的数组元素类型不一致。`);
      for (const element of child) {
        lines.push(`[[${path}]]`);
        jsonToTomlWalk(element, path, lines);
      }
      continue;
    }
    lines.push(`[${path}]`);
    jsonToTomlWalk(child, path, lines);
  }
}

export function jsonToToml(value) {
  const lines = [];
  jsonToTomlWalk(value, "", lines);
  return lines.join("\n") + (lines.length ? "\n" : "");
}

export function processToml(input, params = {}) {
  if (!input.trim()) return idle();
  const sizeError = checkInputSize(input);
  if (sizeError) return sizeError;
  const mode = params.mode === "fromJson" ? "fromJson" : "toJson";
  try {
    if (mode === "fromJson") {
      let parsed;
      try {
        parsed = JSON.parse(input);
      } catch (error) {
        throw new Error(`JSON 解析失败：${error.message}`);
      }
      return success(jsonToToml(parsed), { mode });
    }
    const parsed = parseToml(input);
    return success(JSON.stringify(parsed, null, 2), { mode });
  } catch (error) {
    const lineMatch = /第 (\d+) 行/.exec(error.message);
    return failure(error.message, { tool: "toml", line: lineMatch ? Number(lineMatch[1]) : null });
  }
}

function roundTo(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function rgbToHsl(r, g, b) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  let hue = 0;
  let saturation = 0;
  if (max !== min) {
    const delta = max - min;
    saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0);
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue *= 60;
  }
  return { h: roundTo(hue, 1), s: roundTo(saturation * 100, 1), l: roundTo(lightness * 100, 1) };
}

export function hslToRgb(h, s, l) {
  const hue = ((h % 360) + 360) % 360;
  const saturation = Math.min(100, Math.max(0, s)) / 100;
  const lightness = Math.min(100, Math.max(0, l)) / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = lightness - chroma / 2;
  let rgb;
  if (hue < 60) rgb = [chroma, x, 0];
  else if (hue < 120) rgb = [x, chroma, 0];
  else if (hue < 180) rgb = [0, chroma, x];
  else if (hue < 240) rgb = [0, x, chroma];
  else if (hue < 300) rgb = [x, 0, chroma];
  else rgb = [chroma, 0, x];
  return rgb.map((value) => Math.round((value + match) * 255));
}

export function parseColor(input) {
  const text = input.trim().toLowerCase();
  if (!text) return null;

  const clamp255 = (value) => Math.min(255, Math.max(0, Math.round(Number(value))));

  const hexMatch = /^#([0-9a-f]+)$/.exec(text);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (![3, 4, 6, 8].includes(hex.length)) return null;
    const expanded = hex.length <= 4 ? [...hex].map((char) => char + char).join("") : hex;
    const r = Number.parseInt(expanded.slice(0, 2), 16);
    const g = Number.parseInt(expanded.slice(2, 4), 16);
    const b = Number.parseInt(expanded.slice(4, 6), 16);
    const a = (hex.length === 4 || hex.length === 8) ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a, ...rgbToHsl(r, g, b) };
  }

  const rgbMatch = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*(\d*\.?\d+)\s*)?\)$/.exec(text);
  if (rgbMatch) {
    const r = clamp255(rgbMatch[1]);
    const g = clamp255(rgbMatch[2]);
    const b = clamp255(rgbMatch[3]);
    const a = rgbMatch[4] === undefined ? 1 : Math.min(1, Math.max(0, Number(rgbMatch[4])));
    return { r, g, b, a, ...rgbToHsl(r, g, b) };
  }

  const hslMatch = /^hsla?\(\s*(\d{1,3}(?:\.\d+)?)(?:deg)?\s*[, ]\s*(\d{1,3}(?:\.\d+)?)%\s*[, ]\s*(\d{1,3}(?:\.\d+)?)%\s*(?:[,/]\s*(\d*\.?\d+)\s*)?\)$/.exec(text);
  if (hslMatch) {
    const h = Number(hslMatch[1]);
    const s = Number(hslMatch[2]);
    const l = Number(hslMatch[3]);
    const a = hslMatch[4] === undefined ? 1 : Math.min(1, Math.max(0, Number(hslMatch[4])));
    const [r, g, b] = hslToRgb(h, s, l);
    return { r, g, b, a, h: roundTo(((h % 360) + 360) % 360, 1), s: roundTo(Math.min(100, s), 1), l: roundTo(Math.min(100, l), 1) };
  }

  return null;
}

function relativeLuminance(r, g, b) {
  const channel = (value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(luminanceA, luminanceB) {
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

export function processColor(input, params = {}) {
  if (!input.trim()) return idle();
  const uppercase = params.uppercase === true || params.uppercase === "true";

  const color = parseColor(input);
  if (!color) {
    return failure("无法识别颜色格式。支持 #RGB / #RGBA / #RRGGBB / #RRGGBBAA、rgb() / rgba()、hsl() / hsla()，暂不支持命名颜色。", { tool: "color" });
  }

  const { r, g, b, a } = color;
  const hexBody = [r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("");
  const hex = a < 1 ? hexBody + Math.round(a * 255).toString(16).padStart(2, "0") : hexBody;
  const alpha = roundTo(a, 2);
  const rows = [
    { label: "HEX", value: `#${uppercase ? hex.toUpperCase() : hex}` },
    {
      label: a < 1 ? "RGBA" : "RGB",
      value: a < 1 ? `rgba(${r}, ${g}, ${b}, ${alpha})` : `rgb(${r}, ${g}, ${b})`,
    },
    {
      label: a < 1 ? "HSLA" : "HSL",
      value: a < 1 ?
        `hsla(${color.h}, ${color.s}%, ${color.l}%, ${alpha})` :
        `hsl(${color.h}, ${color.s}%, ${color.l}%)`,
    },
  ];

  const luminance = relativeLuminance(r, g, b);
  const contrastWhite = contrastRatio(luminance, 1);
  const contrastBlack = contrastRatio(luminance, 0);
  const suggestedText = contrastWhite >= contrastBlack ? "白色" : "黑色";

  return success(rows.map((row) => `${row.label.padEnd(4)} ${row.value}`).join("\n"), {
    rows,
    color,
    luminance: roundTo(luminance, 4),
    contrastWhite: roundTo(contrastWhite, 2),
    contrastBlack: roundTo(contrastBlack, 2),
    suggestedText,
  });
}

const RADIX_64_MASK = 2n ** 64n - 1n;
const RADIX_BASE_PATTERNS = {
  2: /^[01]+$/,
  8: /^[0-7]+$/,
  10: /^[0-9]+$/,
  16: /^[0-9a-f]+$/,
};

export function parseRadixValue(text, base = "auto") {
  let clean = String(text).replace(/[\s_]/g, "");
  if (!clean) throw new Error("输入为空。");
  if (clean.length > 100) throw new Error("输入过长，最多支持 100 个数字字符。");
  if (/^-/.test(clean)) throw new Error("进制工具只支持非负整数；负数请使用其他方式换算。");

  let effective = base === "auto" ? null : base;
  const lowered = clean.toLowerCase();
  if (lowered.startsWith("0x")) {
    if (base !== "auto" && base !== "16") throw new Error("0x 前缀与所选进制不一致。");
    effective = "16";
    clean = clean.slice(2);
  } else if (lowered.startsWith("0b")) {
    if (base !== "auto" && base !== "2") throw new Error("0b 前缀与所选进制不一致。");
    effective = "2";
    clean = clean.slice(2);
  } else if (lowered.startsWith("0o")) {
    if (base !== "auto" && base !== "8") throw new Error("0o 前缀与所选进制不一致。");
    effective = "8";
    clean = clean.slice(2);
  } else if (base === "auto") {
    if (RADIX_BASE_PATTERNS[10].test(clean)) effective = "10";
    else if (RADIX_BASE_PATTERNS[16].test(clean)) effective = "16";
    else throw new Error("无法自动识别进制：无 0x/0b/0o 前缀且包含非十进制字符。请显式选择进制。");
  }

  if (!clean || !RADIX_BASE_PATTERNS[Number(effective)].test(clean)) {
    throw new Error(`输入包含 ${effective} 进制不允许的字符。`);
  }

  const prefix = { 2: "0b", 8: "0o", 16: "0x", 10: "" }[Number(effective)];
  const value = BigInt(prefix + clean);
  if (value > RADIX_64_MASK) {
    throw new Error("数值超出 64 位无符号范围（0 到 2^64-1）。");
  }
  return { value, base: effective };
}

const RADIX_BASE_LABELS = { 2: "二进制", 8: "八进制", 10: "十进制", 16: "十六进制" };

function formatRadixRows(value, uppercase) {
  return [
    { label: "二进制", value: value.toString(2) },
    { label: "八进制", value: value.toString(8) },
    { label: "十进制", value: value.toString(10) },
    { label: "十六进制", value: uppercase ? value.toString(16).toUpperCase() : value.toString(16) },
  ];
}

export function processRadix(input, params = {}) {
  if (!input.trim()) return idle();
  const base = ["auto", "2", "8", "10", "16"].includes(params.base) ? params.base : "auto";
  const operator = ["and", "or", "xor", "not", "lshift", "rshift"].includes(params.operator) ? params.operator : "none";
  const uppercase = params.uppercase === true || params.uppercase === "true";

  try {
    const parsed = parseRadixValue(input, base);
    let result = null;
    let operation = null;

    if (operator === "not") {
      result = RADIX_64_MASK - parsed.value;
      operation = `NOT ${input.trim()}`;
    } else if (operator !== "none") {
      if (!String(params.operand ?? "").trim()) {
        throw new Error("请输入第二个操作数（移位运算为移位位数）。");
      }
      const operand = parseRadixValue(params.operand, base === "auto" ? parsed.base : base);
      if (operator === "lshift" || operator === "rshift") {
        if (operand.value > 63n) throw new Error("移位位数必须在 0 到 63 之间。");
        result = operator === "lshift" ? (parsed.value << operand.value) & RADIX_64_MASK : parsed.value >> operand.value;
      } else {
        result = operator === "and" ? parsed.value & operand.value :
          operator === "or" ? parsed.value | operand.value :
            parsed.value ^ operand.value;
      }
      operation = `${input.trim()} ${operator === "and" ? "AND" : operator === "or" ? "OR" : operator === "xor" ? "XOR" : operator === "lshift" ? "<<" : ">>"} ${String(params.operand).trim()}`;
    }

    const rows = formatRadixRows(parsed.value, uppercase);
    const resultRows = result === null ? null : formatRadixRows(result, uppercase);
    const outputLines = [...rows, ...(resultRows || [])].map((row) => `${row.label}  ${row.value}`);
    return success(outputLines.join("\n"), { rows, resultRows, base: parsed.base, operator, operation });
  } catch (error) {
    return failure(error.message, { tool: "radix" });
  }
}

const TEXT_ACTIONS = [
  "camelCase", "pascalCase", "snakeCase", "kebabCase", "constantCase", "upper", "lower", "titleCase", "sentenceCase",
  "sortAsc", "sortDesc", "dedupeLines", "trimLines", "removeEmptyLines", "reverseLines", "numberLines",
  "reverseText", "toLF", "toCRLF",
];
export { TEXT_ACTIONS };

function splitIdentifierWords(text) {
  const spaced = text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  return spaced.split(/[^A-Za-z0-9]+/).filter(Boolean);
}

export function textStats(text) {
  const characters = [...text];
  const lines = text.split("\n");
  return {
    chars: characters.length,
    charsNoSpaces: characters.filter((char) => !/\s/.test(char)).length,
    words: text.split(/\s+/).filter(Boolean).length,
    lines: lines.length,
    nonEmptyLines: lines.filter((line) => line.trim()).length,
    bytes: new TextEncoder().encode(text).length,
  };
}

export function processText(input, params = {}) {
  if (!input.length) return idle();
  const sizeError = checkInputSize(input);
  if (sizeError) return sizeError;

  const action = TEXT_ACTIONS.includes(params.action) ? params.action : "camelCase";
  const words = splitIdentifierWords(input);
  const normalizeLines = (text) => text.replace(/\r\n?/g, "\n").split("\n");
  const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

  let output;
  if (action === "camelCase") {
    output = words.map((word, index) => index === 0 ? word.toLowerCase() : word[0].toUpperCase() + word.slice(1).toLowerCase()).join("");
  } else if (action === "pascalCase") {
    output = words.map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase()).join("");
  } else if (action === "snakeCase") {
    output = words.map((word) => word.toLowerCase()).join("_");
  } else if (action === "kebabCase") {
    output = words.map((word) => word.toLowerCase()).join("-");
  } else if (action === "constantCase") {
    output = words.map((word) => word.toUpperCase()).join("_");
  } else if (action === "upper") {
    output = input.toUpperCase();
  } else if (action === "lower") {
    output = input.toLowerCase();
  } else if (action === "titleCase") {
    output = input.replace(/\S+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
  } else if (action === "sentenceCase") {
    output = input.charAt(0).toUpperCase() + input.slice(1).toLowerCase();
  } else if (action === "sortAsc") {
    output = normalizeLines(input).sort(compare).join("\n");
  } else if (action === "sortDesc") {
    output = normalizeLines(input).sort((a, b) => -compare(a, b)).join("\n");
  } else if (action === "dedupeLines") {
    output = [...new Set(normalizeLines(input))].join("\n");
  } else if (action === "trimLines") {
    output = normalizeLines(input).map((line) => line.trim()).join("\n");
  } else if (action === "removeEmptyLines") {
    output = normalizeLines(input).filter((line) => line.trim()).join("\n");
  } else if (action === "reverseLines") {
    output = normalizeLines(input).reverse().join("\n");
  } else if (action === "numberLines") {
    output = normalizeLines(input).map((line, index) => `${index + 1}. ${line}`).join("\n");
  } else if (action === "reverseText") {
    output = [...input].reverse().join("");
  } else if (action === "toLF") {
    output = input.replace(/\r\n?/g, "\n");
  } else {
    output = input.replace(/\r\n?/g, "\n").replace(/\n/g, "\r\n");
  }

  return success(output, { action, stats: textStats(input) });
}

function xmur3(seedText) {
  let h = 1779033703 ^ seedText.length;
  for (let index = 0; index < seedText.length; index += 1) {
    h = Math.imul(h ^ seedText.charCodeAt(index), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(seedNumber) {
  let a = seedNumber;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createMockRandom(seed) {
  if (typeof seed !== "string" || !seed.trim()) return Math.random;
  return mulberry32(xmur3(seed.trim())());
}

const MOCK_SURNAMES = ["张", "王", "李", "赵", "刘", "陈", "杨", "黄", "周", "吴", "徐", "孙", "马", "朱", "胡", "郭", "何", "林"];
const MOCK_GIVEN_NAMES = ["伟", "芳", "娜", "敏", "静", "磊", "军", "洋", "勇", "艳", "杰", "涛", "明", "超", "秀英", "建国", "子涵", "雨轩", "思远", "梦琪"];
const MOCK_FIRST_NAMES = ["Alice", "Bob", "Carol", "David", "Emma", "Frank", "Grace", "Henry", "Ivy", "Jack", "Karen", "Leo", "Mia", "Noah", "Olivia", "Peter"];
const MOCK_LAST_NAMES = ["Smith", "Johnson", "Brown", "Garcia", "Miller", "Davis", "Wilson", "Anderson", "Taylor", "Thomas"];
const MOCK_EMAIL_DOMAINS = ["example.com", "test.dev", "mail.cn", "inbox.org"];
const MOCK_ALPHANUMERIC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const MOCK_DIRECTIVES = ["@cname", "@name", "@email", "@phone", "@integer", "@float", "@boolean", "@uuid", "@id", "@index", "@pick", "@string", "@hex", "@date", "@datetime", "@timestamp", "@repeat"];

function mockRandInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

function mockUuid(rng) {
  const bytes = Array.from({ length: 16 }, () => Math.floor(rng() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function mockNumberArgs(name, args, { min = -Number.MAX_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const numbers = args.map((arg) => Number(arg));
  if (numbers.some((value) => !Number.isFinite(value))) {
    throw new Error(`@${name} 的参数必须是数字。`);
  }
  for (const value of numbers) {
    if (value < min || value > max) {
      throw new Error(`@${name} 的参数超出范围（${min} 到 ${max}）。`);
    }
  }
  return numbers;
}

function mockDateRange(name, args, defaults) {
  const [startRaw, endRaw] = [
    args[0] !== undefined && args[0] !== "" ? args[0] : defaults[0],
    args[1] !== undefined && args[1] !== "" ? args[1] : defaults[1],
  ];
  const start = Date.parse(startRaw);
  const end = Date.parse(endRaw);
  if (Number.isNaN(start)) throw new Error(`@${name} 的起始时间无效：${startRaw}`);
  if (Number.isNaN(end)) throw new Error(`@${name} 的结束时间无效：${endRaw}`);
  if (start > end) throw new Error(`@${name} 的起始时间不能晚于结束时间。`);
  return [start, end];
}

function generateMockValue(value, context) {
  if (typeof value === "string") return generateMockDirective(value, context);
  if (Array.isArray(value)) return value.map((item) => generateMockValue(item, context));
  if (value && typeof value === "object") {
    const output = {};
    for (const [key, child] of Object.entries(value)) {
      output[key] = generateMockValue(child, context);
    }
    return output;
  }
  return value;
}

function generateMockDirective(value, context) {
  if (!value.startsWith("@")) return value;
  const rng = context.rng;

  const repeatMatch = /^@repeat\(\s*(\d+)\s*,\s*([\s\S]+)\)$/.exec(value);
  if (repeatMatch) {
    const count = Number(repeatMatch[1]);
    if (count < 1 || count > 100) throw new Error("@repeat 的数量必须在 1 到 100 之间。");
    return Array.from({ length: count }, () => generateMockDirective(repeatMatch[2].trim(), context));
  }

  const match = /^@([a-zA-Z]+)\s*(?:\((.*)\))?$/.exec(value);
  if (!match) {
    throw new Error(`无法识别的占位符：${value}。支持 ${MOCK_DIRECTIVES.join(" ")}。`);
  }
  const name = match[1];
  const args = match[2] === undefined ? [] : match[2].split(",").map((arg) => arg.trim());

  switch (name) {
    case "cname":
      return MOCK_SURNAMES[mockRandInt(rng, 0, MOCK_SURNAMES.length - 1)] + MOCK_GIVEN_NAMES[mockRandInt(rng, 0, MOCK_GIVEN_NAMES.length - 1)];
    case "name":
      return `${MOCK_FIRST_NAMES[mockRandInt(rng, 0, MOCK_FIRST_NAMES.length - 1)]} ${MOCK_LAST_NAMES[mockRandInt(rng, 0, MOCK_LAST_NAMES.length - 1)]}`;
    case "email":
      return `${MOCK_FIRST_NAMES[mockRandInt(rng, 0, MOCK_FIRST_NAMES.length - 1)].toLowerCase()}.${MOCK_LAST_NAMES[mockRandInt(rng, 0, MOCK_LAST_NAMES.length - 1)].toLowerCase()}${mockRandInt(rng, 1, 99)}@${MOCK_EMAIL_DOMAINS[mockRandInt(rng, 0, MOCK_EMAIL_DOMAINS.length - 1)]}`;
    case "phone": {
      let phone = `1${["3", "5", "7", "8", "9"][mockRandInt(rng, 0, 4)]}`;
      for (let index = 0; index < 9; index += 1) phone += mockRandInt(rng, 0, 9);
      return phone;
    }
    case "integer": {
      const [min = 0, max = 100] = mockNumberArgs("integer", args);
      if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
        throw new Error("@integer 参数必须是 min <= max 的整数。");
      }
      return mockRandInt(rng, min, max);
    }
    case "float": {
      const [min = 0, max = 100, precisionArg] = mockNumberArgs("float", args);
      const precision = precisionArg === undefined ? 2 : Math.round(precisionArg);
      if (min > max || precision < 0 || precision > 10) {
        throw new Error("@float 参数无效：需要 min <= max 且精度在 0 到 10 之间。");
      }
      return Number((min + rng() * (max - min)).toFixed(precision));
    }
    case "boolean":
      return rng() < 0.5;
    case "uuid":
      return mockUuid(rng);
    case "id":
      return context.counter++;
    case "index":
      return context.indexCounter++;
    case "pick": {
      if (!match[2] || !match[2].trim()) throw new Error("@pick 需要用 | 分隔的候选值，例如 @pick(启用|停用)。");
      const options = match[2].split("|").map((option) => option.trim());
      return options[mockRandInt(rng, 0, options.length - 1)];
    }
    case "string": {
      const [length = 8] = mockNumberArgs("string", args, { min: 1, max: 256 });
      let result = "";
      for (let index = 0; index < Math.round(length); index += 1) {
        result += MOCK_ALPHANUMERIC[mockRandInt(rng, 0, MOCK_ALPHANUMERIC.length - 1)];
      }
      return result;
    }
    case "hex": {
      const [length = 8] = mockNumberArgs("hex", args, { min: 1, max: 256 });
      let result = "";
      for (let index = 0; index < Math.round(length); index += 1) result += mockRandInt(rng, 0, 15).toString(16);
      return result;
    }
    case "date": {
      const [start, end] = mockDateRange("date", args, ["1970-01-01", "2030-12-31"]);
      return new Date(mockRandInt(rng, start, end)).toISOString().slice(0, 10);
    }
    case "datetime": {
      const [start, end] = mockDateRange("datetime", args, ["2000-01-01T00:00:00Z", "2030-12-31T23:59:59Z"]);
      return new Date(mockRandInt(rng, start, end)).toISOString().slice(0, 19) + "Z";
    }
    case "timestamp": {
      const [start = 0, end = 4102444800] = mockNumberArgs("timestamp", args, { min: 0, max: Number.MAX_SAFE_INTEGER });
      if (start > end || !Number.isInteger(start) || !Number.isInteger(end)) {
        throw new Error("@timestamp 参数必须是 start <= end 的整数秒。");
      }
      return mockRandInt(rng, start, end);
    }
    default:
      throw new Error(`不支持的占位符 @${name}。支持 ${MOCK_DIRECTIVES.join(" ")}。`);
  }
}

export function processMock(input, params = {}) {
  if (!input.trim()) return idle();
  const sizeError = checkInputSize(input);
  if (sizeError) return sizeError;

  const count = Math.max(1, Math.min(100, Number(params.count) || 5));
  const seed = typeof params.seed === "string" ? params.seed.slice(0, 64) : "";

  let template;
  try {
    template = JSON.parse(input);
  } catch (error) {
    return failure(`JSON 解析失败：${error.message}`, { tool: "mock" });
  }

  try {
    if (Array.isArray(template)) {
      if (template.length !== 1) {
        throw new Error("根模板必须是 JSON 对象，或只包含一个模板元素的数组。");
      }
      template = template[0];
    }
    if (!template || typeof template !== "object" || Array.isArray(template)) {
      throw new Error("模板必须是 JSON 对象，字符串值使用 @占位符 生成模拟数据。");
    }

    const context = { rng: createMockRandom(seed), counter: 1, indexCounter: 0 };
    const records = Array.from({ length: count }, () => generateMockValue(template, context));
    return success(JSON.stringify(records, null, 2), { generated: count, seed });
  } catch (error) {
    return failure(error.message, { tool: "mock" });
  }
}

export function createDefaultState(toolId = "json") {
  if (!TOOL_IDS.includes(toolId)) toolId = "json";
  const states = {
    json: { toolId, input: "", params: { mode: "format", indent: "2" } },
    base64: { toolId, input: "", params: { mode: "encode", urlSafe: false } },
    timestamp: { toolId, input: "", params: { timestampUnit: "auto", timezone: "system" } },
    regex: { toolId, input: "", params: { flags: "gi", testText: "", replaceText: "" } },
    cron: { toolId, input: "", params: { timezone: "system", previewCount: 5 } },
    url: { toolId, input: "", params: { mode: "encode" } },
    uuid: { toolId, input: "", params: { count: 5, uppercase: false, hyphens: true } },
    hash: { toolId, input: "", params: { algorithm: "SHA-256", uppercase: false } },
    http: { toolId, input: "", params: {} },
    mime: { toolId, input: "", params: {} },
    jwt: { toolId, input: "", params: {} },
    diff: { toolId, input: "", params: { mode: "text" }, input2: "" },
    encoding: { toolId, input: "", params: { mode: "hexEncode" } },
    entity: { toolId, input: "", params: { mode: "encode", numeric: false } },
    csv: { toolId, input: "", params: { mode: "toJson", delimiter: "," } },
    jsonts: { toolId, input: "", params: { rootName: "Root" } },
    xml: { toolId, input: "", params: { indent: "2" } },
    sql: { toolId, input: "", params: { uppercase: true, indent: "2" } },
    markdown: { toolId, input: "", params: {} },
    yaml: { toolId, input: "", params: { mode: "toJson" } },
    toml: { toolId, input: "", params: { mode: "toJson" } },
    color: { toolId, input: "", params: { uppercase: false } },
    radix: { toolId, input: "", params: { base: "auto", operator: "none", operand: "", uppercase: false } },
    text: { toolId, input: "", params: { action: "camelCase" } },
    mock: { toolId, input: "", params: { count: 5, seed: "" } },
  };
  return structuredClone(states[toolId]);
}

function normalizeParams(toolId, params) {
  const value = params && typeof params === "object" ? params : {};
  if (toolId === "json") {
    return {
      mode: value.mode === "minify" ? "minify" : "format",
      indent: ["2", "4", "tab"].includes(value.indent) ? value.indent : "2",
    };
  }
  if (toolId === "base64") {
    return {
      mode: value.mode === "decode" ? "decode" : "encode",
      urlSafe: value.urlSafe === true || value.urlSafe === "true",
    };
  }
  if (toolId === "timestamp") {
    return {
      timestampUnit: ["seconds", "milliseconds"].includes(value.timestampUnit) ? value.timestampUnit : "auto",
      timezone: TIME_ZONES.includes(value.timezone) ? value.timezone : "system",
    };
  }
  if (toolId === "regex") {
    return {
      flags: typeof value.flags === "string" ? value.flags.slice(0, 20) : "gi",
      testText: typeof value.testText === "string" ? value.testText : "",
      replaceText: typeof value.replaceText === "string" ? value.replaceText : "",
    };
  }
  if (toolId === "url") {
    return { mode: ["decode", "parse", "build"].includes(value.mode) ? value.mode : "encode" };
  }
  if (toolId === "uuid") {
    return {
      count: Math.max(1, Math.min(100, Number(value.count) || 5)),
      uppercase: value.uppercase === true || value.uppercase === "true",
      hyphens: value.hyphens !== false && value.hyphens !== "false",
    };
  }
  if (toolId === "hash") {
    return {
      algorithm: ["SHA-1", "SHA-256", "SHA-384", "SHA-512"].includes(value.algorithm) ? value.algorithm : "SHA-256",
      uppercase: value.uppercase === true || value.uppercase === "true",
    };
  }
  if (toolId === "http" || toolId === "mime") {
    return {};
  }
  if (toolId === "jwt") return {};
  if (toolId === "diff") {
    return {
      mode: value.mode === "json" ? "json" : "text",
      input2: typeof value.input2 === "string" ? value.input2 : "",
    };
  }
  if (toolId === "encoding") {
    return { mode: ["hexDecode", "latin1ToUtf8", "utf8ToLatin1"].includes(value.mode) ? value.mode : "hexEncode" };
  }
  if (toolId === "entity") {
    return {
      mode: value.mode === "decode" ? "decode" : "encode",
      numeric: value.numeric === true || value.numeric === "true",
    };
  }
  if (toolId === "csv") {
    return {
      mode: value.mode === "fromJson" ? "fromJson" : "toJson",
      delimiter: [",", ";", "tab", "|"].includes(value.delimiter) ? value.delimiter : ",",
      header: value.header !== false && value.header !== "false",
    };
  }
  if (toolId === "jsonts") {
    return {
      rootName: typeof value.rootName === "string" && value.rootName.trim() ? value.rootName.trim() : "Root",
    };
  }
  if (toolId === "xml") {
    return {
      indent: ["2", "4", "tab"].includes(value.indent) ? value.indent : "2",
    };
  }
  if (toolId === "sql") {
    return {
      uppercase: value.uppercase !== false && value.uppercase !== "false",
      indent: ["2", "4", "tab"].includes(value.indent) ? value.indent : "2",
    };
  }
  if (toolId === "markdown") {
    return {};
  }
  if (toolId === "yaml" || toolId === "toml") {
    return {
      mode: value.mode === "fromJson" ? "fromJson" : "toJson",
    };
  }
  if (toolId === "color") {
    return {
      uppercase: value.uppercase === true || value.uppercase === "true",
    };
  }
  if (toolId === "radix") {
    return {
      base: ["auto", "2", "8", "10", "16"].includes(value.base) ? value.base : "auto",
      operator: ["none", "and", "or", "xor", "not", "lshift", "rshift"].includes(value.operator) ? value.operator : "none",
      operand: typeof value.operand === "string" ? value.operand.slice(0, 128) : "",
      uppercase: value.uppercase === true || value.uppercase === "true",
    };
  }
  if (toolId === "text") {
    return {
      action: TEXT_ACTIONS.includes(value.action) ? value.action : "camelCase",
    };
  }
  if (toolId === "mock") {
    return {
      count: Math.max(1, Math.min(100, Number(value.count) || 5)),
      seed: typeof value.seed === "string" ? value.seed.slice(0, 64) : "",
    };
  }
  return {
    timezone: TIME_ZONES.includes(value.timezone) ? value.timezone : "system",
    previewCount: [5, 10].includes(Number(value.previewCount)) ? Number(value.previewCount) : 5,
  };
}

export function normalizeState(rawState) {
  if (!rawState || typeof rawState !== "object" || rawState.version !== 1) {
    throw new Error("状态版本无效。");
  }
  if (!TOOL_IDS.includes(rawState.toolId)) {
    throw new Error("工具类型无效。");
  }
  if (typeof rawState.input !== "string" || rawState.input.length > MAX_URL_STATE_LENGTH) {
    throw new Error("输入内容无效或超出分享长度限制。");
  }
  if (typeof rawState.input2 === "string" && rawState.input2.length > MAX_URL_STATE_LENGTH) {
    throw new Error("第二段输入内容超出分享长度限制。");
  }
  const params = normalizeParams(rawState.toolId, rawState.params);
  const normalized = { version: 1, toolId: rawState.toolId, input: rawState.input, params };
  if (rawState.toolId === "diff" && typeof rawState.input2 === "string") normalized.input2 = rawState.input2;
  return normalized;
}

export function encodeState(state) {
  const bytes = new TextEncoder().encode(JSON.stringify(state));
  const encoded = utf8BytesToBase64(bytes, { urlSafe: true });
  if (encoded.length > MAX_URL_STATE_LENGTH) {
    throw new Error("当前状态过大，无法生成安全长度的分享链接。请减少输入内容。");
  }
  return encoded;
}

export function decodeState(encoded) {
  if (typeof encoded !== "string" || encoded.length > MAX_URL_STATE_LENGTH) {
    throw new Error("分享状态无效或超过长度限制。");
  }
  const bytes = base64ToUtf8Bytes(encoded, { urlSafe: true });
  const json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return normalizeState(JSON.parse(json));
}

export function stateToHash(state) {
  return `#/tool/${state.toolId}?state=${encodeState(state)}`;
}

export function stateFromHash(hash) {
  const queryIndex = hash.indexOf("?");
  if (!hash.startsWith("#/tool/") || queryIndex < 0) return null;
  const toolId = hash.slice("#/tool/".length, queryIndex);
  const params = new URLSearchParams(hash.slice(queryIndex + 1));
  const encoded = params.get("state");
  if (!encoded) return null;
  const state = decodeState(encoded);
  if (state.toolId !== toolId) throw new Error("分享链接中的工具与状态不匹配。");
  return state;
}
