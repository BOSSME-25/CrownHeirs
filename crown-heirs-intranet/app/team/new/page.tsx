import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getAccess, assignableRoles } from "@/lib/perms";
import SiteHeader from "@/components/SiteHeader";
import EmployeeForm from "@/components/EmployeeForm";
import { createEmployee } from "@/app/team/actions";
import { listTeamMembers } from "@/lib/square";

export const metadata = { title: "Add team member — Crown Heirs Team Hub" };

export default async function NewEmployeePage() {
  const session = await auth();
  const access = await getAccess(session?.user?.email);
  if (!access.canManageTeam) redirect("/team");

  const squareTeamMembers = access.canSystem ? await listTeamMembers() : undefined;

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">Team</div>
          <h1 className="title">Add a team member</h1>
        </div>
        <EmployeeForm action={createEmployee} squareTeamMembers={squareTeamMembers} roleOptions={assignableRoles(access.canSystem)} />
      </main>
    </>
  );
}
