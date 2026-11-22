import type { Metadata } from "next";
import { ContentPage, contentMetadata, contentPathParams, type ContentPathParams } from "@/components/site/site-pages";

// The same URLs as the English site, under /pl; anything else is a 404.
export const dynamicParams = false;

export function generateStaticParams(): ContentPathParams[] {
  return contentPathParams();
}

export async function generateMetadata({ params }: { params: Promise<ContentPathParams> }): Promise<Metadata> {
  return contentMetadata("pl", (await params).contentPath);
}

export default async function PolishContentPage({ params }: { params: Promise<ContentPathParams> }) {
  return <ContentPage locale="pl" contentPath={(await params).contentPath} />;
}
