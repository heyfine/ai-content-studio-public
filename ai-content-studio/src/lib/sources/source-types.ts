/**
 * Source Crawler 状态字符串联合类型。
 * 数据库存字符串字段（规范要求便于扩展），TS 侧用联合保证类型安全。
 */

export type FetchStatus =
  | "pending"
  | "fetching"
  | "fetched"
  | "parsed"
  | "failed"
  | "blocked"
  | "requires_access";

export type RobotsStatus = "allowed" | "disallowed" | "unknown" | "unavailable";

export type CopyrightStatus =
  | "authorized"
  | "open_license"
  | "public_domain"
  | "fact_only"
  | "unknown"
  | "restricted"
  | "blocked";

export type LicenseType =
  | "all_rights_reserved"
  | "creative_commons"
  | "public_domain"
  | "open_license"
  | "user_owned"
  | "authorized"
  | "unknown";

export type SourceType =
  | "official"
  | "news"
  | "media"
  | "blog"
  | "research"
  | "documentation"
  | "product_page"
  | "forum"
  | "social"
  | "government"
  | "other"
  | "unknown";

export interface SourceTypeOption {
  value: SourceType;
  label: string;
}

export const SOURCE_TYPE_OPTIONS: SourceTypeOption[] = [
  { value: "official", label: "官方" },
  { value: "news", label: "新闻" },
  { value: "media", label: "媒体" },
  { value: "blog", label: "博客" },
  { value: "research", label: "研究" },
  { value: "documentation", label: "文档" },
  { value: "product_page", label: "产品页" },
  { value: "forum", label: "论坛" },
  { value: "social", label: "社交" },
  { value: "government", label: "政府" },
  { value: "other", label: "其他" },
  { value: "unknown", label: "未知" },
];
