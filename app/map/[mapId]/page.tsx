import PortfolioExperience from "@/components/experience/PortfolioExperience";

export default async function MapPage({ params }: { params: Promise<{ mapId: string }> }) {
  const { mapId } = await params;

  return (
    <main className="portfolio-page">
      <PortfolioExperience initialMapId={mapId} />
    </main>
  );
}
