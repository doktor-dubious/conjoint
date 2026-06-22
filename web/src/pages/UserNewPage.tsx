import { EntityNewPage } from "@/components/EntityNewPage";
import { api } from "@/lib/api";

export function UserNewPage() {
  return (
    <EntityNewPage
      noun="user"
      listPath="/users"
      onCreate={(data) => api.createUser(data)}
    />
  );
}
