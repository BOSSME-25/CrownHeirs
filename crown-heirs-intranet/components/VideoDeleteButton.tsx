"use client";

import { deleteVideo } from "@/app/training/actions";

export default function VideoDeleteButton({ id, title }: { id: string; title: string }) {
  return (
    <form
      action={deleteVideo.bind(null, id)}
      onSubmit={(e) => {
        if (!confirm(`Remove “${title}”?`)) e.preventDefault();
      }}
    >
      <button type="submit" className="btn btn-danger">Remove</button>
    </form>
  );
}
