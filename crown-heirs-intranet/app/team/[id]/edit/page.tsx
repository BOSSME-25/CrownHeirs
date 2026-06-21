import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/access";
import SiteHeader from "@/components/SiteHeader";
import EmployeeForm from "@/components/EmployeeForm";
import { getEmployee } from "@/lib/employees";
import { updateEmployee } from "@/app/team/actions";

export const metadata = { title: "Edit team member — Crown Heirs Team Hub" };

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) redirect("/team");

  const { id } = await params;
  const employee = await getEmployee(id);
  if (!employee) notFound();

  const action = updateEmployee.bind(null, id);

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">Team</div>
          <h1 className="title">Edit {employee.fullName}</h1>
        </div>
        <EmployeeForm action={action} employee={employee} />
      </main>
    </>
  );
}
