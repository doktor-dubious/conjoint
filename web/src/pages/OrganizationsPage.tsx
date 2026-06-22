import {
  EntityListPage,
  RelationTable,
} from "@/components/EntityListPage";
import { type DataTableColumn } from "@/components/ui/data-table";
import { api, type OrganizationOut } from "@/lib/api";

const COLUMNS: DataTableColumn<OrganizationOut>[] = [
  {
    key: "name",
    header: "Name",
    sortable: true,
    sortValue: (o) => o.name.toLowerCase(),
    render: (o) => <span className="font-medium">{o.name}</span>,
  },
  {
    key: "description",
    header: "Description",
    render: (o) => (
      <span className="text-muted-foreground">{o.description || "—"}</span>
    ),
  },
  {
    key: "users",
    header: "Users",
    sortable: true,
    sortValue: (o) => o.users.length,
    render: (o) => o.users.length,
    className: "tabular-nums",
    headClassName: "w-20",
  },
  {
    key: "created",
    header: "Created",
    sortable: true,
    sortValue: (o) => o.created_at,
    render: (o) => (
      <span className="text-muted-foreground">
        {new Date(o.created_at).toLocaleDateString()}
      </span>
    ),
    headClassName: "w-32",
  },
];

export function OrganizationsPage() {
  return (
    <EntityListPage<OrganizationOut>
      load={() => api.listOrganizations()}
      columns={COLUMNS}
      getSearchText={(o) => o.name}
      onUpdate={(id, patch) => api.updateOrganization(id, patch)}
      onDelete={(id) => api.deleteOrganization(id)}
      noun="organization"
      emptyText="No organizations yet."
      storageKey="organizations"
      extraTabs={[
        {
          value: "users",
          label: "Users",
          render: (o) => (
            <RelationTable
              rows={o.users}
              emptyText="No users in this organization."
            />
          ),
        },
      ]}
    />
  );
}
