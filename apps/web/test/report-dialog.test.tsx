// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportButton } from "../components/report/ReportButton";
import { sendReport, trimContext, validate } from "../lib/report/client";

afterEach(cleanup);

const context = {
  game_id: "quiz",
  seed: "K7Q2M9XD1A",
  input: "cabo verde",
  content_version: "2026.11.0",
};

describe("report dialog", () => {
  it("AC-PL-018: sends the category, text and context, then thanks the player", async () => {
    const user = userEvent.setup();
    const send = vi.fn().mockResolvedValue({ ok: true });
    render(<ReportButton targetRef="country:CPV" context={context} send={send} />);
    await user.click(screen.getByRole("button", { name: "Report a problem" }));
    await user.selectOptions(screen.getByLabelText("What is wrong?"), "answer_rejected");
    await user.type(
      screen.getByLabelText("Tell us what happened"),
      "Cabo Verde should be accepted.",
    );
    await user.click(screen.getByRole("button", { name: "Send report" }));
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ category: "answer_rejected", targetRef: "country:CPV", context }),
    );
    expect(await screen.findByText(/editors review reports within 7 days/)).toBeTruthy();
  });

  it("validates on blur, not while typing, and does not send a short message", async () => {
    const user = userEvent.setup();
    const send = vi.fn();
    render(<ReportButton context={context} send={send} />);
    await user.click(screen.getByRole("button", { name: "Report a problem" }));
    const box = screen.getByLabelText("Tell us what happened");
    await user.type(box, "short");
    expect(screen.queryByRole("alert")).toBeNull();
    await user.tab();
    expect(await screen.findByText(/Add a little more detail/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Send report" }));
    expect(send).not.toHaveBeenCalled();
  });

  it("tells the player when they have been rate limited", async () => {
    const user = userEvent.setup();
    const send = vi.fn().mockResolvedValue({ ok: false, reason: "rate-limited", retryAfter: 42 });
    render(<ReportButton context={context} send={send} />);
    await user.click(screen.getByRole("button", { name: "Report a problem" }));
    await user.type(screen.getByLabelText("Tell us what happened"), "A long enough description.");
    await user.click(screen.getByRole("button", { name: "Send report" }));
    expect(await screen.findByText(/Try again in 42 seconds/)).toBeTruthy();
  });
});

describe("report client", () => {
  it("maps API statuses", async () => {
    const respond = (status: number, headers: Record<string, string> = {}) =>
      (async () => new Response("{}", { status, headers })) as unknown as typeof fetch;
    const input = {
      category: "other" as const,
      message: "Long enough message.",
      email: "",
      context,
    };
    expect(await sendReport(input, respond(202))).toEqual({ ok: true });
    expect(await sendReport(input, respond(429, { "Retry-After": "30" }))).toEqual({
      ok: false,
      reason: "rate-limited",
      retryAfter: 30,
    });
    expect(await sendReport(input, respond(422))).toEqual({ ok: false, reason: "invalid" });
    expect(await sendReport(input, respond(503))).toEqual({ ok: false, reason: "unavailable" });
    expect(
      await sendReport(input, (async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch),
    ).toEqual({ ok: false, reason: "network" });
  });
  it("validates length and email, and trims long context strings", () => {
    expect(validate({ message: "x".repeat(9), email: "" })).toEqual({ message: "short" });
    expect(validate({ message: "x".repeat(1001), email: "a@b.co" })).toEqual({ message: "long" });
    expect(validate({ message: "x".repeat(20), email: "nope" })).toEqual({ email: "invalid" });
    expect((trimContext({ input: "y".repeat(500) }).input as string).length).toBe(200);
  });
});
