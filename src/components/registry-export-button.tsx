"use client";

import { useId, useRef, type MouseEvent } from "react";
import styles from "./registry-export-button.module.css";

export interface RegistryExportCopy {
  button: string;
  title: string;
  question: string;
  csvLabel: string;
  csvHint: string;
  xlsxLabel: string;
  xlsxHint: string;
  cancel: string;
}

export interface DialogBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Whether a point lies strictly outside a box. A point on the box's own edge
 * (its border) is inside: only the backdrop around the box is outside.
 */
export function pointOutsideBox(box: DialogBox, x: number, y: number): boolean {
  return x < box.left || x > box.right || y < box.top || y > box.bottom;
}

/**
 * "Download" on the survivor registry: a button that opens a small dialog
 * asking which file format to use. The two choices are ordinary links to the
 * export endpoint, so the browser handles the download itself; the page only
 * decides which URL to offer.
 */
export function RegistryExportButton({
  copy,
  csvHref,
  xlsxHref,
}: {
  copy: RegistryExportCopy;
  /** Export URLs that already carry the page's current search, filters and language. */
  csvHref: string;
  xlsxHref: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pressStartedOnBackdrop = useRef(false);
  const titleId = useId();
  const questionId = useId();

  function open() {
    const dialog = dialogRef.current;
    // showModal() moves focus into the dialog and makes Escape close it.
    if (dialog && !dialog.open) dialog.showModal();
  }

  function close() {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
  }

  // A click counts as a backdrop click only when the dialog element itself is
  // the target AND the point lies outside the dialog's box: the element is
  // also the target for clicks on its own border and scrollbar, which must not
  // dismiss it. (The target check stays because a keyboard-synthesised click
  // from a child control can carry the coordinates 0,0, which read as
  // "outside".) Both ends of the click must be on the backdrop, so dragging a
  // text selection out of the box does not dismiss it either.
  function isBackdropHit(event: MouseEvent<HTMLDialogElement>) {
    if (event.target !== event.currentTarget) return false;
    return pointOutsideBox(event.currentTarget.getBoundingClientRect(), event.clientX, event.clientY);
  }

  function onBackdropPress(event: MouseEvent<HTMLDialogElement>) {
    pressStartedOnBackdrop.current = isBackdropHit(event);
  }

  function onBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (isBackdropHit(event) && pressStartedOnBackdrop.current) close();
    pressStartedOnBackdrop.current = false;
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="dialog"
        onClick={open}
      >
        {copy.button}
      </button>
      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby={titleId}
        aria-describedby={questionId}
        onMouseDown={onBackdropPress}
        onClick={onBackdropClick}
        // Browsers return focus to the button on close; older Safari does not.
        onClose={() => triggerRef.current?.focus()}
      >
        <div className={styles.body}>
          <h2 id={titleId} className={styles.title}>
            {copy.title}
          </h2>
          <p id={questionId} className={styles.question}>
            {copy.question}
          </p>
          {/* role="list" restores the list semantics that list-style: none strips in Safari/VoiceOver. */}
          <ul className={styles.choices} role="list">
            <li>
              <a className={styles.choice} href={csvHref} onClick={close}>
                <span className={styles.choiceLabel}>{copy.csvLabel}</span>
                <span className={styles.choiceHint}>{copy.csvHint}</span>
              </a>
            </li>
            <li>
              <a className={styles.choice} href={xlsxHref} onClick={close}>
                <span className={styles.choiceLabel}>{copy.xlsxLabel}</span>
                <span className={styles.choiceHint}>{copy.xlsxHint}</span>
              </a>
            </li>
          </ul>
          <div className={styles.footer}>
            <button type="button" className={styles.cancel} onClick={close}>
              {copy.cancel}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
