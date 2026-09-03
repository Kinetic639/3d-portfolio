import ReferenceStyleLab from "@/components/style-lab/reference-study/ReferenceStyleLab";

export default function ReferenceStudyPage() {
  if (process.env.NODE_ENV === "production") {
    return null;
  }

  return <ReferenceStyleLab />;
}
