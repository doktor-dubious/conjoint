import {
  EntityListPage,
  RelationTable,
} from "@/components/EntityListPage";
import { type DataTableColumn } from "@/components/ui/data-table";
import { api, type UserOut } from "@/lib/api";

const COLUMNS: DataTableColumn<UserOut>[] = [
  {
    key: "name",
    header: "Name",
    sortable: true,
    sortValue: (u) => u.name.toLowerCase(),
    render: (u) => <span className="font-medium">{u.name}</span>,
  },
  {
    key: "description",
    header: "Description",
    render: (u) => (
      <span className="text-muted-foreground">{u.description || "—"}</span>
    ),
  },
  {
    key: "orgs",
    header: "Organizations",
    sortable: true,
    sortValue: (u) => u.organizations.length,
    render: (u) => u.organizations.length,
    className: "tabular-nums",
    headClassName: "w-28",
  },
  {
    key: "created",
    header: "Created",
    sortable: true,
    sortValue: (u) => u.created_at,
    render: (u) => (
      <span className="text-muted-foreground">
        {new Date(u.created_at).toLocaleDateString()}
      </span>
    ),
    headClassName: "w-32",
  },
];

export function UsersPage() {
  return (
    <EntityListPage<UserOut>
      load={() => api.listUsers()}
      columns={COLUMNS}
      getSearchText={(u) => u.name}
      onCreate={(data) => api.createUser(data)}
      onUpdate={(id, patch) => api.updateUser(id, patch)}
      onDelete={(id) => api.deleteUser(id)}
      noun="user"
      emptyText="No users yet."
      storageKey="users"
      extraTabs={[
        {
          value: "organizations",
          label: "Organizations",
          render: (u) => (
            <RelationTable
              rows={u.organizations}
              emptyText="Not a member of any organization."
            />
          ),
        },
      ]}
    />
  );
}
