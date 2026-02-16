import type { ReactElement } from "react";

import { InspectClient } from "./InspectClient";

type InspectPageProps = {
  params: Promise<{
    tenantSlug: string;
  }>;
};

export default async function InspectPage({ params }: InspectPageProps): Promise<ReactElement> {
  const { tenantSlug } = await params;
  return <InspectClient tenantSlug={tenantSlug} />;
}
