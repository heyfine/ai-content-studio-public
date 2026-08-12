import { prisma } from "@/lib/prisma";
import { extractDomain, normalizeUrl } from "@/lib/sources/url-normalize";
import {
  runFetchPipeline,
  type PipelineBlocked,
  type PipelineSuccess,
} from "@/lib/sources/pipeline";
import type { FetchStatus } from "@/lib/sources/source-types";

/**
 * Source Crawler service：URL → 抓取 Pipeline → 按 canonicalUrl 去重 → 入库/版本 bump。
 * 各步失败落 fetchStatus=failed/blocked/requires_access + fetchError，不抛异常打断调用者。
 */

export interface IngestResult {
  source: SourceRow;
  created: boolean;
  versionBumped: boolean;
  versionNumber: number;
}

export type SourceRow = {
  id: string;
  url: string;
  canonicalUrl: string;
  domain: string;
  title: string | null;
  description: string | null;
  author: string | null;
  sourceType: string;
  robotsStatus: string;
  fetchStatus: string;
  httpStatus: number | null;
  contentHash: string | null;
  wordCount: number | null;
  normalizedContent: string | null;
  fetchError: string | null;
};

function toRow(s: {
  id: string;
  url: string;
  canonicalUrl: string;
  domain: string;
  title: string | null;
  description: string | null;
  author: string | null;
  sourceType: string;
  robotsStatus: string;
  fetchStatus: string;
  httpStatus: number | null;
  contentHash: string | null;
  wordCount: number | null;
  normalizedContent: string | null;
  fetchError: string | null;
}): SourceRow {
  return { ...s };
}

function blockedFetchStatus(b: PipelineBlocked): FetchStatus {
  if (b.fetchStatus === "blocked") return "blocked";
  if (b.fetchStatus === "requires_access") return "requires_access";
  return "failed";
}

function buildOkSourceData(r: PipelineSuccess, canonicalUrl: string) {
  const meta = r.parsed.meta;
  const text = r.normalizedContent;
  const wordCount = text ? text.trim().split(/\s+/).filter(Boolean).length : 0;
  return {
    canonicalUrl,
    domain: extractDomain(r.finalUrl),
    title: r.parsed.title || meta.title || null,
    description: meta.description ?? null,
    author: r.parsed.byline || meta.author || null,
    publisher: meta.siteName ?? null,
    publishedAt: meta.publishedTime ? new Date(meta.publishedTime) : null,
    language: meta.lang ?? null,
    robotsStatus: r.robotsStatus,
    fetchStatus: "parsed" as const,
    httpStatus: r.httpStatus,
    contentType: r.contentType ?? null,
    contentHash: r.hash,
    wordCount,
    normalizedContent: text,
    metadataJson: {
      title: meta.title,
      description: meta.description,
      canonical: meta.canonical,
      author: meta.author,
      publishedTime: meta.publishedTime,
      lang: meta.lang,
      siteName: meta.siteName,
      ogType: meta.ogType,
      robotsStatus: r.robotsStatus,
    },
    fetchError: null,
    fetchedAt: new Date(),
  };
}

function buildBlockedSourceData(b: PipelineBlocked, canonicalUrl: string, inputUrl: string) {
  return {
    canonicalUrl,
    domain: extractDomain(inputUrl),
    title: null,
    description: null,
    author: null,
    publisher: null,
    publishedAt: null,
    language: null,
    robotsStatus: b.robotsStatus,
    fetchStatus: blockedFetchStatus(b),
    httpStatus: b.httpStatus ?? null,
    contentType: null,
    contentHash: null,
    wordCount: null,
    normalizedContent: null,
    metadataJson: { reason: b.reason },
    fetchError: b.reason,
    fetchedAt: new Date(),
  };
}

export async function ingestSource(urlInput: string): Promise<IngestResult> {
  let normalizedInput: string;
  try {
    normalizedInput = normalizeUrl(urlInput);
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : "URL 校验失败");
  }
  const result = await runFetchPipeline(normalizedInput);
  const canonicalUrl =
    result.kind === "ok" && result.parsed.meta.canonical
      ? (() => {
          try {
            return normalizeUrl(result.parsed.meta.canonical as string);
          } catch {
            return normalizedInput;
          }
        })()
      : normalizedInput;

  const existing = await prisma.source.findUnique({ where: { canonicalUrl } });

  if (result.kind === "blocked") {
    const data = buildBlockedSourceData(result, canonicalUrl, normalizedInput);
    if (existing) {
      const source = await prisma.source.update({ where: { id: existing.id }, data });
      return { source: toRow(source), created: false, versionBumped: false, versionNumber: 0 };
    }
    const source = await prisma.source.create({ data: { url: normalizedInput, ...data } });
    return { source: toRow(source), created: true, versionBumped: false, versionNumber: 0 };
  }

  // 成功路径
  const data = buildOkSourceData(result, canonicalUrl);
  if (!existing) {
    const source = await prisma.source.create({
      data: {
        url: normalizedInput,
        ...data,
        versions: {
          create: [
            {
              versionNumber: 1,
              contentHash: data.contentHash,
              normalizedContent: data.normalizedContent,
              httpStatus: data.httpStatus,
              contentType: data.contentType,
              wordCount: data.wordCount,
              metadataJson: data.metadataJson,
            },
          ],
        },
      },
    });
    return { source: toRow(source), created: true, versionBumped: true, versionNumber: 1 };
  }

  if (existing.contentHash && existing.contentHash === data.contentHash) {
    const source = await prisma.source.update({ where: { id: existing.id }, data });
    return { source: toRow(source), created: false, versionBumped: false, versionNumber: 0 };
  }

  const existingVersions = await prisma.sourceVersion.findMany({
    where: { sourceId: existing.id },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  });
  const nextVersion = (existingVersions[0]?.versionNumber ?? 0) + 1;
  await prisma.$transaction([
    prisma.source.update({ where: { id: existing.id }, data }),
    prisma.sourceVersion.create({
      data: {
        sourceId: existing.id,
        versionNumber: nextVersion,
        contentHash: data.contentHash,
        normalizedContent: data.normalizedContent,
        httpStatus: data.httpStatus,
        contentType: data.contentType,
        wordCount: data.wordCount,
        metadataJson: data.metadataJson,
      },
    }),
  ]);
  const source = await prisma.source.findUnique({ where: { id: existing.id } });
  if (!source) throw new Error("来源更新后查询失败");
  return { source: toRow(source), created: false, versionBumped: true, versionNumber: nextVersion };
}

export async function getSource(id: string) {
  return prisma.source.findUnique({
    where: { id },
    include: { versions: { orderBy: { versionNumber: "desc" } } },
  });
}

export async function listSources(filter?: { domain?: string; status?: string }) {
  const where: { domain?: string; fetchStatus?: string } = {};
  if (filter?.domain) where.domain = filter.domain;
  if (filter?.status) where.fetchStatus = filter.status;
  return prisma.source.findMany({ where, orderBy: { createdAt: "desc" } });
}

export async function refreshSource(id: string): Promise<IngestResult> {
  const existing = await prisma.source.findUnique({ where: { id } });
  if (!existing) throw new Error("来源不存在");
  let normalizedInput: string;
  try {
    normalizedInput = existing.url;
  } catch {
    throw new Error("来源 URL 无效");
  }
  const result = await runFetchPipeline(normalizedInput);
  const canonicalUrl =
    result.kind === "ok" && result.parsed.meta.canonical
      ? (() => {
          try {
            return normalizeUrl(result.parsed.meta.canonical as string);
          } catch {
            return normalizedInput;
          }
        })()
      : normalizedInput;

  if (result.kind === "blocked") {
    const data = buildBlockedSourceData(result, canonicalUrl, normalizedInput);
    const source = await prisma.source.update({ where: { id: existing.id }, data });
    return { source: toRow(source), created: false, versionBumped: false, versionNumber: 0 };
  }
  const data = buildOkSourceData(result, canonicalUrl);
  if (existing.contentHash && existing.contentHash === data.contentHash) {
    const source = await prisma.source.update({ where: { id: existing.id }, data });
    return { source: toRow(source), created: false, versionBumped: false, versionNumber: 0 };
  }
  const existingVersions = await prisma.sourceVersion.findMany({
    where: { sourceId: existing.id },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  });
  const nextVersion = (existingVersions[0]?.versionNumber ?? 0) + 1;
  await prisma.$transaction([
    prisma.source.update({ where: { id: existing.id }, data }),
    prisma.sourceVersion.create({
      data: {
        sourceId: existing.id,
        versionNumber: nextVersion,
        contentHash: data.contentHash,
        normalizedContent: data.normalizedContent,
        httpStatus: data.httpStatus,
        contentType: data.contentType,
        wordCount: data.wordCount,
        metadataJson: data.metadataJson,
      },
    }),
  ]);
  const source = await prisma.source.findUnique({ where: { id: existing.id } });
  if (!source) throw new Error("来源刷新后查询失败");
  return { source: toRow(source), created: false, versionBumped: true, versionNumber: nextVersion };
}

export async function deleteSource(id: string) {
  return prisma.source.delete({ where: { id } });
}
