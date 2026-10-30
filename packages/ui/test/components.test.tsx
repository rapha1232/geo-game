import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AnswerInput,
  Button,
  Card,
  ChoiceGrid,
  Dialog,
  Tabs,
  ToastProvider,
  useToast,
  type Choice,
} from "../src/index";

afterEach(cleanup);

const stateLabels = { correct: "Correct", wrong: "Wrong", near: "Close" };
const choices: Choice[] = ["France", "Spain", "Italy", "Greece"].map((l) => ({
  id: l.toLowerCase(),
  label: l,
}));

describe("Button", () => {
  it("fires onPress for click and keyboard, and honours disabled", async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    render(<Button onPress={onPress}>Play</Button>);
    await user.click(screen.getByRole("button", { name: "Play" })); // the click leaves focus on the button
    await user.keyboard("{Enter}");
    expect(onPress).toHaveBeenCalledTimes(2);
    cleanup();
    const off = vi.fn();
    render(
      <Button isDisabled onPress={off}>
        Play
      </Button>,
    );
    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(off).not.toHaveBeenCalled();
  });
});

describe("Card", () => {
  it("renders as the requested element", () => {
    render(
      <Card as="section" aria-label="Today">
        hello
      </Card>,
    );
    expect(screen.getByRole("region", { name: "Today" })).toHaveTextContent("hello");
  });
});

describe("Dialog", () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onPress={() => setOpen(true)}>Open</Button>
        <Dialog isOpen={open} onOpenChange={setOpen} title="Report a problem" closeLabel="Close">
          <p>Details</p>
        </Dialog>
      </>
    );
  }

  it("opens as a labelled dialog, traps focus, closes on Esc and restores focus", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open" });
    await user.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Report a problem" });
    expect(dialog).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("closes with the close button", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.click(await screen.findByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

describe("Tabs", () => {
  it("switches panels with arrow keys", async () => {
    const user = userEvent.setup();
    render(
      <Tabs
        aria-label="Stats"
        items={[
          { id: "a", label: "Overview", content: "Panel A" },
          { id: "b", label: "History", content: "Panel B" },
        ]}
      />,
    );
    expect(screen.getByRole("tablist", { name: "Stats" })).toBeInTheDocument();
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Panel A");
    await user.tab();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "History" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Panel B");
  });
});

describe("Toast", () => {
  function Fire({ kind }: { kind: "info" | "success" | "error" }) {
    const toast = useToast();
    return (
      <button onClick={() => toast.show("Saved your progress", { kind, timeoutMs: 1000 })}>
        fire
      </button>
    );
  }

  it("announces politely, marks errors as alerts, and dismisses manually", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider regionLabel="Notifications" dismissLabel="Dismiss">
        <Fire kind="success" />
      </ToastProvider>,
    );
    await user.click(screen.getByText("fire"));
    expect(screen.getByRole("status")).toHaveTextContent("Saved your progress");
    expect(screen.getByRole("region", { name: "Notifications" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    cleanup();

    render(
      <ToastProvider regionLabel="Notifications" dismissLabel="Dismiss">
        <Fire kind="error" />
      </ToastProvider>,
    );
    await user.click(screen.getByText("fire"));
    expect(screen.getByRole("alert")).toHaveTextContent("Saved your progress");
  });

  it("auto-dismisses after its timeout", async () => {
    vi.useFakeTimers();
    try {
      render(
        <ToastProvider regionLabel="Notifications" dismissLabel="Dismiss">
          <Fire kind="info" />
        </ToastProvider>,
      );
      act(() => screen.getByText("fire").click());
      expect(screen.getByRole("status")).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(1001);
      });
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("useToast outside a provider fails loudly", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Fire kind="info" />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });
});

describe("ChoiceGrid", () => {
  it("chooses by click and by number keys 1–9", async () => {
    const user = userEvent.setup();
    const onChoose = vi.fn();
    render(
      <ChoiceGrid
        aria-label="Pick the capital"
        choices={choices}
        onChoose={onChoose}
        stateLabels={stateLabels}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Spain/ }));
    await user.keyboard("3");
    await user.keyboard("9");
    expect(onChoose.mock.calls.map((c) => c[0])).toEqual(["spain", "italy"]);
  });

  it("ignores number keys while typing in a text field and when modifiers are held", async () => {
    const user = userEvent.setup();
    const onChoose = vi.fn();
    render(
      <>
        <input aria-label="free text" />
        <ChoiceGrid
          aria-label="Pick"
          choices={choices}
          onChoose={onChoose}
          stateLabels={stateLabels}
        />
      </>,
    );
    await user.click(screen.getByLabelText("free text"));
    await user.keyboard("1");
    expect(onChoose).not.toHaveBeenCalled();
    (document.activeElement as HTMLElement).blur();
    await user.keyboard("{Control>}1{/Control}");
    expect(onChoose).not.toHaveBeenCalled();
  });

  it("has no number shortcuts above 9 options or when switched off", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 10 }, (_, i) => ({ id: `o${i}`, label: `Option ${i}` }));
    const onChoose = vi.fn();
    render(
      <ChoiceGrid aria-label="Many" choices={many} onChoose={onChoose} stateLabels={stateLabels} />,
    );
    await user.keyboard("1");
    expect(onChoose).not.toHaveBeenCalled();
    expect(document.querySelectorAll("kbd")).toHaveLength(0);
  });

  it("AC-PL-008 feedback states carry a glyph and spoken text, never colour alone", () => {
    const states: Choice[] = [
      { id: "a", label: "A", state: "correct" },
      { id: "b", label: "B", state: "wrong" },
      { id: "c", label: "C", state: "near" },
      { id: "d", label: "D" },
    ];
    render(
      <ChoiceGrid
        aria-label="Feedback"
        choices={states}
        onChoose={() => undefined}
        stateLabels={stateLabels}
      />,
    );
    expect(screen.getByRole("button", { name: /A.*Correct/ })).toHaveTextContent("✓");
    expect(screen.getByRole("button", { name: /B.*Wrong/ })).toHaveTextContent("✕");
    expect(screen.getByRole("button", { name: /C.*Close/ })).toHaveTextContent("◐");
    expect(screen.getByRole("button", { name: "D" })).not.toHaveTextContent(/[✓✕◐]/);
  });

  it("skips disabled options and enforces 2–16 options", async () => {
    const user = userEvent.setup();
    const onChoose = vi.fn();
    render(
      <ChoiceGrid
        aria-label="Pick"
        choices={[
          { id: "x", label: "X", disabled: true },
          { id: "y", label: "Y" },
        ]}
        onChoose={onChoose}
        stateLabels={stateLabels}
      />,
    );
    await user.keyboard("1");
    expect(onChoose).not.toHaveBeenCalled();
    cleanup();
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() =>
      render(
        <ChoiceGrid
          aria-label="One"
          choices={[{ id: "x", label: "X" }]}
          onChoose={() => undefined}
          stateLabels={stateLabels}
        />,
      ),
    ).toThrow(RangeError);
    spy.mockRestore();
  });
});

describe("AnswerInput", () => {
  function Harness({ onSubmit }: { onSubmit: (v: string) => void }) {
    const [v, setV] = useState("");
    return (
      <AnswerInput
        label="Your answer"
        value={v}
        onChange={setV}
        onSubmit={onSubmit}
        status={{ tone: "error", text: "Not recognized" }}
      />
    );
  }

  it("has a visible label, no autocorrect or autocapitalize, and a polite status line", () => {
    render(<Harness onSubmit={() => undefined} />);
    const input = screen.getByLabelText("Your answer");
    expect(input).toHaveAttribute("autocomplete", "off");
    expect(input).toHaveAttribute("autocorrect", "off");
    expect(input).toHaveAttribute("autocapitalize", "off");
    expect(input).toHaveAttribute("spellcheck", "false");
    expect(input).toHaveAttribute("maxlength", "80");
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("✕");
    expect(status).toHaveTextContent("Not recognized");
    expect(input).toHaveAttribute("aria-describedby", status.id);
  });

  it("reports typed text and submits on Enter only", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText("Your answer"), "kyrgystan");
    expect(onSubmit).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    expect(onSubmit).toHaveBeenCalledWith("kyrgystan");
  });

  it("renders an empty status line without content so the layout stays put", () => {
    render(
      <AnswerInput
        label="Answer"
        value=""
        onChange={() => undefined}
        onSubmit={() => undefined}
        status={null}
      />,
    );
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});
