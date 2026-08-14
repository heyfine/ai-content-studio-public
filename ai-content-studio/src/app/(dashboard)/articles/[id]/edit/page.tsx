import { TiptapEditorPage } from "@/components/articles/tiptap-editor-page";

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TiptapEditorPage articleId={id} />;
}
