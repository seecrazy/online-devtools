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
  const params = normalizeParams(rawState.toolId, rawState.params);
  return { version: 1, toolId: rawState.toolId, input: rawState.input, params };
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
