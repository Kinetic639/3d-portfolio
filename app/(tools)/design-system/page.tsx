import DesignSystemWorkspace from "@/components/design-system/DesignSystemWorkspace";

export default function DesignSystemPage() {
  const enabled = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_DESIGN_SYSTEM === "true";

  return <DesignSystemWorkspace enabled={enabled} />;
}
