import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/access";
import SiteHeader from "@/components/SiteHeader";
import ShiftForm from "@/components/ShiftForm";
import { updateShift } from "@/app/schedule/actions";
import { activeEmployees, getShift } from "@/lib/schedule";

export const metadata = { title: "Edit shift — Crown Heirs Team Hub" };

export default async function EditShiftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) redirect("/schedule");

  const { id } = await params;
  const shift = await getShift(id);
  if (!shift) notFound();

  const employees = await activeEmployees();
  const action = updateShift.bind(null, id);
  const backHref = `/schedule?week=${shift.shiftDate}`;

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">Schedule</div>
          <h1 className="title">Edit shift</h1>
        </div>
        <ShiftForm action={action} employees={employees} shift={shift} backHref={backHref} />
      </main>
    </>
  );
}
