import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/access";
import SiteHeader from "@/components/SiteHeader";
import EmployeeForm from "@/components/EmployeeForm";
import { createEmployee } from "@/app/team/actions";
import { listTeamMembers } from "@/lib/square";

export const metadata = { title: "Add team member — Crown Heirs Team Hub" };

export default async function NewEmployeePage() {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) redirect("/team");

  const squareTeamMembers = await listTeamMembers();

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">Team</div>
          <h1 className="title">Add a team member</h1>
        </div>
        <EmployeeForm action={createEmployee} squareTeamMembers={squareTeamMembers} />
      </main>
    </>
  );
}
