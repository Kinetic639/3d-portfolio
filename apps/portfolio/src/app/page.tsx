import { portfolioIdentity } from "@portfolio/portfolio-content";
export default function HomePage() {
  return (
    <main>
      <h1>{portfolioIdentity.name}</h1>
      <p>{portfolioIdentity.description}</p>
    </main>
  );
}
