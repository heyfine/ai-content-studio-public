/**
 * 统一时间格式化：所有用户可见的时间一律渲染为北京墙钟（Asia/Shanghai），
 * 避免依赖部署机/浏览器的系统时区。数据库仍存 UTC（Prisma 标准），仅展示层转换。
 */

export const TIME_ZONE = "Asia/Shanghai";

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** 完整时间（YYYY/MM/DD HH:mm，北京墙钟）；非法输入返回占位符 */
export function formatDateTime(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "--";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "--";
  return dateTimeFormatter.format(d).replace(/\//g, "-");
}

/** 仅时分（HH:mm，北京墙钟） */
export function formatTime(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "--";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "--";
  return timeFormatter.format(d);
}

/** 北京墙钟的文件名安全时间戳（YYYY-MM-DD-HH-mm-ss），用于备份文件名等 */
export function beijingStamp(ms: number = Date.now()): string {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(new Date(ms))
    .replace(/\//g, "-");
  return parts.replace(": ", ":").replace(/: /g, "-").replace(/ /, "-").replace(/:/g, "-");
}
