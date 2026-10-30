"use client";

import { useState } from "react";
import { Button, Dialog } from "@meridian/ui";
import { t, type MessageKey } from "../../lib/i18n";
import {
  CATEGORIES,
  MAX_LENGTH,
  sendReport,
  validate,
  type ReportCategory,
  type ReportResult,
} from "../../lib/report/client";
import styles from "./report.module.css";

export type ReportButtonProps = {
  /** The entity or fact being reported, e.g. `country:CPV` or `fact:0042`. */
  targetRef?: string;
  /** Sent with the report: game, seed, content version, the player's input. */
  context: Record<string, unknown>;
  defaultCategory?: ReportCategory;
  /** Replaceable in tests. */
  send?: typeof sendReport;
};

/** "Report a problem" (UX_AND_DESIGN §10): category, free text, optional email, and the context attached automatically. */
export function ReportButton({
  targetRef,
  context,
  defaultCategory = "other",
  send = sendReport,
}: ReportButtonProps) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ReportCategory>(defaultCategory);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState({ message: false, email: false });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<ReportResult | null>(null);
  const problems = validate({ message, email });

  const submit = async () => {
    setTouched({ message: true, email: true });
    if (problems.message || problems.email) return;
    setSending(true);
    const r = await send({ category, message, email, targetRef, context });
    setSending(false);
    setResult(r);
  };
  const done = result?.ok === true;
  const close = (o: boolean) => {
    setOpen(o);
    if (!o && done) {
      setMessage("");
      setEmail("");
      setTouched({ message: false, email: false });
      setResult(null);
    }
  };

  return (
    <>
      <Button variant="ghost" onPress={() => setOpen(true)}>
        {t("rp.open")}
      </Button>
      <Dialog isOpen={open} onOpenChange={close} title={t("rp.title")} closeLabel={t("rp.close")}>
        {done ? (
          <p role="status">{t("rp.thanks")}</p>
        ) : (
          <form
            className={styles.form}
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <label className={styles.field}>
              {t("rp.category")}
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ReportCategory)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t(`rp.cat.${c}` as MessageKey)}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              {t("rp.message")}
              <textarea
                value={message}
                rows={4}
                maxLength={MAX_LENGTH + 100}
                aria-invalid={touched.message && !!problems.message}
                aria-describedby="rp-message-help"
                onChange={(e) => setMessage(e.target.value)}
                onBlur={() => setTouched((x) => ({ ...x, message: true }))}
              />
            </label>
            <p
              id="rp-message-help"
              className={styles.help}
              role={touched.message && problems.message ? "alert" : undefined}
            >
              {touched.message && problems.message === "short"
                ? t("rp.messageShort")
                : touched.message && problems.message === "long"
                  ? t("rp.messageLong", { max: MAX_LENGTH })
                  : t("rp.messageHelp", { count: message.trim().length, max: MAX_LENGTH })}
            </p>
            <label className={styles.field}>
              {t("rp.email")}
              <input
                type="email"
                value={email}
                autoComplete="email"
                aria-invalid={touched.email && !!problems.email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched((x) => ({ ...x, email: true }))}
              />
            </label>
            {touched.email && problems.email && (
              <p role="alert" className={styles.help}>
                {t("rp.emailInvalid")}
              </p>
            )}
            <p className={styles.help}>{t("rp.attached")}</p>
            {result && !result.ok && (
              <p role="alert">
                {result.reason === "rate-limited"
                  ? t("rp.rateLimited", { s: result.retryAfter })
                  : result.reason === "invalid"
                    ? t("rp.invalid")
                    : t("rp.failed")}
              </p>
            )}
            <div className={styles.actions}>
              <Button variant="primary" type="submit" isDisabled={sending}>
                {sending ? t("rp.sending") : t("rp.send")}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}
