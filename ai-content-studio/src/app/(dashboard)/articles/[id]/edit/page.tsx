import { ArticleEditorPage } from "@/components/articles/article-editor-page";

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ArticleEditorPage articleId={id} />;
}
