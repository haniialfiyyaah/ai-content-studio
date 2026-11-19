import { PagePlaceholder } from "@/components/layout/page-placeholder";

export default async function VideoReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <PagePlaceholder
      title="Video Review"
      description={`Review immutable output ${id} with Approve / Regenerate, history, and optional download.`}
    />
  );
}
