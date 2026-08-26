"use client";

import { LoaderCircle, Trash2, TriangleAlert, X } from "lucide-react";
import { useDialogFocus } from "@/lib/useDialogFocus";

export function TaskDeleteDialog({
  kind,
  name,
  childCount = 0,
  busy,
  onClose,
  onConfirm,
}: {
  kind: "task" | "item" | "sub-item";
  name: string;
  childCount?: number;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const dialogRef = useDialogFocus<HTMLElement>(() => {
    if (!busy) onClose();
  });
  const title = kind === "task" ? "Delete this task?" : kind === "item" ? "Delete this checklist branch?" : "Delete this sub-item?";
  const consequence = kind === "task"
    ? childCount > 0
      ? `The task and all ${childCount} checklist item${childCount === 1 ? "" : "s"} beneath it will be permanently removed.`
      : "The task will be permanently removed."
    : kind === "item" && childCount > 0
      ? `This item and ${childCount} sub-item${childCount === 1 ? "" : "s"} beneath it will be permanently removed.`
      : "This checklist entry will be permanently removed.";

  return (
    <div className="modal-layer task-delete-layer" role="presentation" onMouseDown={(event) => !busy && event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} className="modal task-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="task-delete-title" aria-describedby="task-delete-description">
        <header><span className="task-delete-warning"><TriangleAlert size={20} /></span><button className="icon-button" onClick={onClose} disabled={busy} aria-label="Close deletion confirmation"><X size={18} /></button></header>
        <div className="task-delete-copy"><p className="eyebrow">Permanent removal</p><h2 id="task-delete-title">{title}</h2><p id="task-delete-description">{consequence}</p><blockquote>{name}</blockquote></div>
        <footer className="modal-actions"><button className="button button-secondary" onClick={onClose} disabled={busy}>Keep it</button><button className="button button-danger" onClick={() => void onConfirm()} disabled={busy}>{busy ? <LoaderCircle size={15} className="spin-icon" /> : <Trash2 size={15} />}{busy ? "Deleting..." : "Delete permanently"}</button></footer>
      </section>
    </div>
  );
}
