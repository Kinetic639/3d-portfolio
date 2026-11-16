export interface PortfolioIdentity {
  readonly name: string;
  readonly description: string;
}
export const portfolioIdentity: PortfolioIdentity = Object.freeze({
  name: "Developer portfolio",
  description:
    "Portfolio content is available independently of the optional 3D experience.",
});
