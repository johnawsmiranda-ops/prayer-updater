"use client";

/**
 * A small modal confirmation shown after an add/edit/delete/etc. action
 * completes — "Prayer added.", "3 prayers deleted.", and so on. Dismiss with
 * OK or the × in the corner; nothing else on the page is blocked while it's
 * closed (there's just nothing to click behind it since it's centered and
 * dim the background) but it does require an explicit dismissal, per how
 * this was asked for.
 */
export default function ActionNotice({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="card p-5 max-w-sm w-full relative"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
      >
        <button
          className="absolute top-2 right-2 btn btn-ghost px-2"
          onClick={onClose}
          aria-label="Close"
          title="Close"
        >
          ✕
        </button>
        <p className="text-sm pr-6">{message}</p>
        <div className="flex justify-end mt-4">
          <button className="btn btn-primary" onClick={onClose} autoFocus>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
