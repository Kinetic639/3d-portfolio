import type { Metadata } from "next";
import { ContentPage, contentMetadata, contentPathParams, type ContentPathParams } from "@/components/site/site-pages";

// Every content item and every list section has exactly one URL; anything else under this route is a 404.
export const dynamicParams = false;

export function generateStaticParams(): ContentPathParams[] {
  return contentPathParams();
}

export async function generateMetadata({ params }: { params: Promise<ContentPathParams> }): Promise<Metadata> {
  return contentMetadata("en", (await params).contentPath);
}

export default async function EnglishContentPage({ params }: { params: Promise<ContentPathParams> }) {
  return <ContentPage locale="en" contentPath={(await params).contentPath} />;
}
