import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getAccess, assignableRoles } from "@/lib/perms";
import SiteHeader from "@/components/SiteHeader";
import EmployeeForm from "@/components/EmployeeForm";
import { getEmployee } from "@/lib/employees";
import { updateEmployee } from "@/app/team/actions";
import { listTeamMembers } from "@/lib/square";
import { listLocations } from "@/lib/org";

export const metadata = { title: "Edit team member — Crown Heirs Team Hub" };

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const access = await getAccess(session?.user?.email);
  if (!access.canManageTeam) redirect("/team");

  const { id } = await params;
  const employee = await getEmployee(id);
  if (!employee) notFound();

  const action = updateEmployee.bind(null, id);
  const squareTeamMembers = access.canSystem ? await listTeamMembers() : undefined;
  const locations = await listLocations();

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">Team</div>
          <h1 className="title">Edit {employee.fullName}</h1>
        </div>
        <EmployeeForm action={action} employee={employee} squareTeamMembers={squareTeamMembers} locations={locations} roleOptions={assignableRoles(access.canSystem)} />
      </main>
    </>
  );
}
