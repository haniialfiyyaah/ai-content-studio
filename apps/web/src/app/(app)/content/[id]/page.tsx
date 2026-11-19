import { PagePlaceholder } from "@/components/layout/page-placeholder";

export default async function ContentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <PagePlaceholder
      title="Content Detail"
      description={`Dedicated concept editor for ${id}: script, storyboard, assets, Publishing Pack, versions, and Approve / Edit.`}
    />
  );
}
