import { EntityNewPage } from "@/components/EntityNewPage";
import { api } from "@/lib/api";

export function OrganizationNewPage() {
  return (
    <EntityNewPage
      noun="organization"
      listPath="/organizations"
      onCreate={(data) => api.createOrganization(data)}
    />
  );
}
