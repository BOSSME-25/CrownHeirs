"use client";

import { deleteSuggestion } from "@/app/suggestions/actions";

export default function DeleteSuggestionButton({ id }: { id: string }) {
  return (
    <form
      action={deleteSuggestion.bind(null, id)}
      onSubmit={(e) => {
        if (!confirm("Delete this suggestion?")) e.preventDefault();
      }}
      style={{ display: "inline" }}
    >
      <button type="submit" className="shift-del" title="Delete">×</button>
    </form>
  );
}
