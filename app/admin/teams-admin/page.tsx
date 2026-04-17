import { TeamsAdminManagementCard } from "@/components/admin/teams-admin-management-card";
import { getTeamsAdminPageData } from "@/lib/admin/teams-admin/get-teams-admin-page-data";

export default async function TeamsAdminPage() {
  const data = await getTeamsAdminPageData();

  return (
    <section>
      <div className="mx-auto w-full max-w-6xl">
        <TeamsAdminManagementCard
          storageReady={data.storageReady}
          storageMessage={data.storageMessage}
          admins={data.admins}
          rows={data.rows}
        />
      </div>
    </section>
  );
}
