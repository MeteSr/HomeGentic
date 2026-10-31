/**
 * AddressAutocomplete — the Add Property street field. Suggestions come from
 * services/addressSuggest (the Worker's Google Places proxy), mocked here.
 */

import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";

const suggest = vi.fn();
const place = vi.fn();
vi.mock("@/services/addressSuggest", () => ({
  suggestAddresses: (...a: unknown[]) => suggest(...a),
  placeAddress: (...a: unknown[]) => place(...a),
  newAddressSessionToken: () => "tok-test-1",
}));

import { AddressAutocomplete } from "@/components/AddressAutocomplete";

const SUGGESTIONS = [
  { placeId: "p1", main: "12 Elm St", secondary: "Orlando, FL, USA" },
  { placeId: "p2", main: "12 Elm Ave", secondary: "Tampa, FL, USA" },
];

/** A controlled wrapper, as the form uses it. */
function Field({ onPlaceSelect = vi.fn() }: { onPlaceSelect?: (p: unknown) => void }) {
  const [v, setV] = useState("");
  return <AddressAutocomplete id="addr" value={v} onChange={setV} onPlaceSelect={onPlaceSelect} />;
}

async function typeAndWait(text: string) {
  fireEvent.change(screen.getByRole("combobox"), { target: { value: text } });
  await act(async () => {
    vi.advanceTimersByTime(350);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  suggest.mockReset().mockResolvedValue(SUGGESTIONS);
  place.mockReset().mockResolvedValue({ address: "12 Elm St", city: "Orlando", state: "FL", zipCode: "32801" });
});
afterEach(() => vi.useRealTimers());

describe("AddressAutocomplete", () => {
  it("is a plain controlled input with the given props", () => {
    const onChange = vi.fn();
    const { container } = render(
      <AddressAutocomplete value="789 Elm St" onChange={onChange} onPlaceSelect={vi.fn()} id="a1" className="c1" />,
    );
    const input = container.querySelector("input")!;
    expect(input).toHaveValue("789 Elm St");
    expect(input).toHaveAttribute("id", "a1");
    expect(input).toHaveClass("c1");
    expect(input).toHaveAttribute("placeholder", "123 Main Street");
    expect(input).toHaveAttribute("autocomplete", "street-address");
    fireEvent.change(input, { target: { value: "456 Oak Ave" } });
    expect(onChange).toHaveBeenCalledWith("456 Oak Ave");
  });

  it("doesn't ask for suggestions when the parent sets the value", async () => {
    render(<AddressAutocomplete value="12 Elm St" onChange={vi.fn()} onPlaceSelect={vi.fn()} />);
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(suggest).not.toHaveBeenCalled();
  });

  it("debounces typing and shows the suggestions with Google attribution", async () => {
    render(<Field />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "12" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "12 el" } });
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    expect(suggest).toHaveBeenCalledTimes(1);
    expect(suggest).toHaveBeenCalledWith("12 el", "tok-test-1");
    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(screen.getByText(/powered by google/i)).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-expanded", "true");
  });

  it("fills the street and passes city, state and ZIP up on a click", async () => {
    const onPlaceSelect = vi.fn();
    render(<Field onPlaceSelect={onPlaceSelect} />);
    await typeAndWait("12 elm");
    await act(async () => {
      fireEvent.click(screen.getByText("12 Elm St"));
    });
    expect(place).toHaveBeenCalledWith("p1", "tok-test-1");
    expect(onPlaceSelect).toHaveBeenCalledWith({
      address: "12 Elm St",
      city: "Orlando",
      state: "FL",
      zipCode: "32801",
    });
    expect(screen.getByRole("combobox")).toHaveValue("12 Elm St");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("supports the keyboard: arrows move, Enter picks, Escape closes", async () => {
    const onPlaceSelect = vi.fn();
    render(<Field onPlaceSelect={onPlaceSelect} />);
    await typeAndWait("12 elm");
    const input = screen.getByRole("combobox");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(place).toHaveBeenCalledWith("p2", "tok-test-1");

    await typeAndWait("400 oak");
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("keeps the typed text when the address lookup is unavailable", async () => {
    place.mockResolvedValue(null);
    const onPlaceSelect = vi.fn();
    render(<Field onPlaceSelect={onPlaceSelect} />);
    await typeAndWait("12 elm");
    await act(async () => {
      fireEvent.click(screen.getByText("12 Elm St"));
    });
    expect(onPlaceSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox")).toHaveValue("12 Elm St");
  });

  it("shows no list when there are no suggestions", async () => {
    suggest.mockResolvedValue([]);
    render(<Field />);
    await typeAndWait("zzz");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
