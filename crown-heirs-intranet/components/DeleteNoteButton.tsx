"use client";

import { deleteNote } from "@/app/notes/actions";

export default function DeleteNoteButton({ id, title }: { id: string; title: string }) {
  return (
    <form
      action={deleteNote.bind(null, id)}
      onSubmit={(e) => {
        if (!confirm(`Delete “${title}”?`)) e.preventDefault();
      }}
      style={{ display: "inline" }}
    >
      <button type="submit" className="shift-del" title="Delete note">×</button>
    </form>
  );
}
