"use client";

import { deleteQuestion } from "@/app/training/actions";

export default function DeleteQuestionButton({ videoId, questionId }: { videoId: string; questionId: string }) {
  return (
    <form
      action={deleteQuestion.bind(null, videoId, questionId)}
      onSubmit={(e) => {
        if (!confirm("Delete this question?")) e.preventDefault();
      }}
      style={{ display: "inline" }}
    >
      <button type="submit" className="shift-del" title="Delete question">×</button>
    </form>
  );
}
