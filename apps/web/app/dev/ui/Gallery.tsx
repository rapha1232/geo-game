"use client";

// Dev-only playground: strings here intentionally skip t() because the route is not shipped to production.
import { useState } from "react";
import {
  AnswerInput,
  Button,
  Card,
  ChoiceGrid,
  Dialog,
  Tabs,
  ToastProvider,
  useToast,
  colorTokens,
  type ChoiceState,
} from "@meridian/ui";
import styles from "./Gallery.module.css";

function setTheme(theme: "light" | "dark" | "system") {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

function ToastButtons() {
  const toast = useToast();
  return (
    <div className={styles.row}>
      <Button onPress={() => toast.show("Progress saved on this device.", { kind: "success" })}>
        Success toast
      </Button>
      <Button
        onPress={() => toast.show("We couldn't load that pack. Try again.", { kind: "error" })}
      >
        Error toast
      </Button>
      <Button onPress={() => toast.show("Daily puzzle resets at midnight.")}>Info toast</Button>
    </div>
  );
}

export function Gallery() {
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState<{
    tone: "neutral" | "success" | "error" | "hint";
    text: string;
  } | null>(null);
  const [picked, setPicked] = useState<Record<string, ChoiceState>>({});

  const options = ["Paris", "Madrid", "Rome", "Athens"].map((label) => ({
    id: label,
    label,
    state: picked[label] ?? ("idle" as ChoiceState),
  }));

  return (
    <ToastProvider regionLabel="Notifications" dismissLabel="Dismiss notification">
      <div className={styles.stack}>
        <header>
          <p className={styles.eyebrow}>Developer playground</p>
          <h1>Components</h1>
          <div className={styles.row}>
            <Button variant="ghost" onPress={() => setTheme("system")}>
              System
            </Button>
            <Button variant="ghost" onPress={() => setTheme("light")}>
              Light
            </Button>
            <Button variant="ghost" onPress={() => setTheme("dark")}>
              Dark
            </Button>
          </div>
        </header>

        <section aria-labelledby="g-buttons">
          <h2 id="g-buttons">Buttons</h2>
          <div className={styles.row}>
            <Button variant="primary">Play something now</Button>
            <Button>Browse games</Button>
            <Button variant="ghost">Skip</Button>
            <Button variant="primary" isDisabled>
              Disabled
            </Button>
          </div>
        </section>

        <section aria-labelledby="g-input">
          <h2 id="g-input">Answer input and choices</h2>
          <div className={styles.grid}>
            <Card>
              <AnswerInput
                label="Name a country"
                placeholder="Type a country name"
                value={answer}
                onChange={(v) => {
                  setAnswer(v);
                  setStatus(null);
                }}
                onSubmit={(v) =>
                  setStatus(
                    v.trim().toLowerCase() === "france"
                      ? { tone: "success", text: "France" }
                      : { tone: "error", text: "Not recognized" },
                  )
                }
                status={status}
              />
            </Card>
            <Card>
              <p className={styles.eyebrow}>Capital of Greece?</p>
              <ChoiceGrid
                aria-label="Capital of Greece"
                choices={options}
                stateLabels={{ correct: "Correct", wrong: "Wrong", near: "Close" }}
                onChoose={(id) =>
                  setPicked(
                    id === "Athens" ? { Athens: "correct" } : { [id]: "wrong", Athens: "near" },
                  )
                }
              />
            </Card>
          </div>
        </section>

        <section aria-labelledby="g-tabs">
          <h2 id="g-tabs">Tabs and dialog</h2>
          <Card>
            <Tabs
              aria-label="Statistics"
              items={[
                {
                  id: "overview",
                  label: "Overview",
                  content: <p>Games played, rounds, active days.</p>,
                },
                { id: "history", label: "History", content: <p>Your last 200 results.</p> },
                { id: "mastery", label: "Mastery", content: <p>A world map shaded by mastery.</p> },
              ]}
            />
            <div className={styles.row} style={{ marginTop: "var(--space-4)" }}>
              <Button onPress={() => setOpen(true)}>Report a problem</Button>
            </div>
          </Card>
          <Dialog isOpen={open} onOpenChange={setOpen} title="Report a problem" closeLabel="Close">
            <p>Tell us what looks wrong. We read every report.</p>
          </Dialog>
        </section>

        <section aria-labelledby="g-toast">
          <h2 id="g-toast">Toasts</h2>
          <ToastButtons />
        </section>

        <section aria-labelledby="g-colour">
          <h2 id="g-colour">Colour tokens</h2>
          <div className={styles.swatches}>
            {(Object.keys(colorTokens.light) as (keyof typeof colorTokens.light)[]).map((k) => (
              <div key={k} className={styles.swatch}>
                <div className={styles.chip} style={{ background: `var(--color-${k})` }} />
                <span>{k}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </ToastProvider>
  );
}
