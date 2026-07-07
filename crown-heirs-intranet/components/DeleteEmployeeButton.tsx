"use client";

import { deleteEmployee } from "@/app/team/actions";

export default function DeleteEmployeeButton({ id, name }: { id: string; name: string }) {
  return (
    <form
      action={deleteEmployee.bind(null, id)}
      onSubmit={(e) => {
        if (!confirm(`Remove ${name} from the roster?`)) e.preventDefault();
      }}
    >
      <button className="btn btn-danger" type="submit">Remove</button>
    </form>
  );
}
