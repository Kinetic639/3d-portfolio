import BenchmarkWorkspace from "@/components/benchmark/BenchmarkWorkspace";

export default function BenchmarkPage() {
  const enabled = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_BENCHMARK === "true";

  return <BenchmarkWorkspace enabled={enabled} />;
}
