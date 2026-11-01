// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { DeepCutView } from "../components/deep-cut/DeepCutView";
import { assembleQuiz, type QuizPacks } from "../lib/quiz/data";
import { newSession, type Session } from "../lib/deep-cut/controller";
import type { LoadedDeepCut } from "../lib/deep-cut/data";
import { deepCutResult } from "../lib/results/deep-cut";
import { eventsFromResult } from "../lib/telemetry/events";

afterEach(cleanup);

const ent = (iso: string, name: string, extra: Record<string, unknown> = {}) => ({
  id: `country:${iso}`,
  type: "country" as const,
  names: { canonical: name, aliases: [] as { text: string; kind: string }[] },
  parent_ids: ["continent:AF"],
  sets: ["sovereign-197"],
  capitals: [{ name: `${name} City`, role: "official" }],
  label_point: [0, 0] as [number, number],
  ...extra,
});
const packs: QuizPacks = {
  countries: {
    entities: [
      ent("PRT", "Portugal"),
      ent("BRA", "Brazil"),
      ent("AGO", "Angola"),
      ent("CPV", "Cape Verde", {
        names: { canonical: "Cape Verde", aliases: [{ text: "Cabo Verde", kind: "common" }] },
      }),
      ent("MOZ", "Mozambique"),
      ent("ESP", "Spain"),
      ent("GNQ", "Equatorial Guinea"),
      ent("TLS", "Timor-Leste"),
    ],
  },
  ambiguity: { groups: [] },
} as never;
const quiz = assembleQuiz(packs, []);
const prompt = (id: string, family: string, text: string, answers: string[]) => ({
  id,
  family,
  text,
  answers: answers.map((a) => `country:${a}`),
  explanation: "Test data.",
  invalid: `{name}: ${text} is not true.`,
  rarity_prior: Object.fromEntries(answers.map((a, i) => [`country:${a}`, 0.9 - i * 0.15])),
});
const prompts = [
  prompt("prompt:p1", "language", "Portuguese is an official language", [
    "BRA",
    "PRT",
    "AGO",
    "CPV",
    "MOZ",
    "TLS",
  ]),
  prompt("prompt:p2", "lines", "Crossed by the equator", ["BRA", "AGO", "GNQ", "TLS"]),
  prompt(
    "prompt:p3",
    "names",
    "Name has a single word",
    ["BRA", "AGO", "SPAIN"].slice(0, 2).concat(["PRT", "ESP"]),
  ),
  prompt("prompt:p4", "neighbors", "Borders Angola", ["BRA", "PRT", "ESP", "MOZ"]),
  prompt("prompt:p5", "rankings", "Among the largest", ["BRA", "PRT", "ESP", "MOZ", "AGO"]),
];
const data: LoadedDeepCut = {
  world: quiz.world,
  prompts,
  byId: new Map(prompts.map((p) => [p.id, p])),
  labelPoints: quiz.facts.labelPoints,
};

function Harness({ initial }: { initial: Session }) {
  const [s, set] = useState(initial);
  return <DeepCutView session={s} data={data} onChange={set} onAgain={() => undefined} />;
}
const start = (mode: "run" | "practice" = "run") =>
  newSession(data, "K7Q2M9XD1A", { mode, timer: 0 }, [], 0);

describe("Deep Cut view", () => {
  it("AC-DC-007 typing a country's other name and pressing Enter selects it", async () => {
    const user = userEvent.setup();
    render(<Harness initial={start()} />);
    await user.type(screen.getByLabelText("Or type a country"), "cabo verde{Enter}");
    expect(screen.getByText("Selected: Cape Verde")).toBeInTheDocument();
  });

  it("locks in a valid answer and reveals every answer by tier, marking the pick", async () => {
    const user = userEvent.setup();
    const s0 = start();
    const first = data.byId.get(s0.run.prompts[0]!.promptId)!;
    render(<Harness initial={s0} />);
    const answer = first.answers[0]!;
    const name = quiz.world.byId.get(answer)!.name;
    await user.type(screen.getByLabelText("Or type a country"), `${name}{Enter}`);
    await user.click(screen.getByRole("button", { name: "Lock in" }));
    expect(screen.getByRole("heading", { name: /\+\d+/ })).toBeInTheDocument();
    expect(screen.getAllByText(/You/).length).toBeGreaterThan(0);
    expect(screen.getByText("Every valid answer")).toBeInTheDocument();
  });

  it("AC-DC-004 an answer that does not fit scores nothing and says why", async () => {
    const user = userEvent.setup();
    const s0 = start();
    const first = data.byId.get(s0.run.prompts[0]!.promptId)!;
    const wrong = [...quiz.world.byId.values()].find((e) => !first.answers.includes(e.id))!;
    render(<Harness initial={s0} />);
    await user.type(screen.getByLabelText("Or type a country"), `${wrong.name}{Enter}`);
    await user.click(screen.getByRole("button", { name: "Lock in" }));
    expect(screen.getByText("No points.")).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${wrong.name}: .* is not true`))).toBeInTheDocument();
  });

  it("Lock in needs a selection, and a run ends with a summary and a spoiler-free share", async () => {
    const user = userEvent.setup();
    render(<Harness initial={start()} />);
    expect(screen.getByRole("button", { name: "Lock in" })).toBeDisabled();
    for (let i = 0; i < 5; i++) {
      const input = screen.getByLabelText("Or type a country");
      await user.type(input, "Brazil{Enter}");
      await user.click(screen.getByRole("button", { name: "Lock in" }));
      await user.click(screen.getByRole("button", { name: "Next prompt" }));
    }
    expect(screen.getByRole("heading", { name: "Run complete" })).toBeInTheDocument();
    const share = screen.getByLabelText("Copy result", { selector: "pre" });
    expect(share.textContent).toMatch(/Deep Cut · \d+\/5000/);
    expect(share.textContent).not.toMatch(/Brazil|equator|Portuguese/);
  });

  it("Practice shows the answer count and a Solid answer, and scores nothing", async () => {
    const user = userEvent.setup();
    render(<Harness initial={start("practice")} />);
    expect(screen.getByText(/\d+ valid answers/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show a Solid answer" }));
    expect(screen.getByText(/A Solid answer:/)).toBeInTheDocument();
  });
});

describe("Deep Cut results and telemetry", () => {
  it("a finished run becomes a valid result and anonymous prompt-answer events", () => {
    let s = start();
    s = {
      ...s,
      run: {
        ...s.run,
        status: "done",
        prompts: s.run.prompts.map((p, i) => ({
          ...p,
          locked: true,
          answer: i === 0 ? "country:BRA" : null,
          tier: i === 0 ? ("obvious" as const) : null,
          points: i === 0 ? 100 : 0,
        })),
      },
    };
    const result = deepCutResult(s, {
      id: "01J00000000000000000000000",
      contentVersion: "2026.10.0",
      endedAt: 5000,
    });
    expect(result.game_id).toBe("deep-cut");
    expect(result.score).toBe(100);
    expect(result.max_score).toBe(5000);
    const events = eventsFromResult(result);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      item_kind: "prompt_answer",
      item_id: "country:BRA",
      correct: true,
    });
    expect(events[0]!.prompt_id).toBe(s.run.prompts[0]!.promptId);
  });
});
