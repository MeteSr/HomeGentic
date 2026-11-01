/**
 * Street-address field with suggestions from Google Places, fetched through
 * the voice Worker (services/addressSuggest.ts) so no Google key or script is
 * in the page. Typing 3+ characters shows up to 5 US addresses; picking one
 * calls onPlaceSelect with { address, city, state, zipCode }.
 *
 * It's an ARIA combobox: arrow keys move through the list, Enter picks,
 * Escape closes. When suggestions are unavailable (not configured, rate
 * limited, offline) it is a plain text input.
 */

import React, { useEffect, useId, useRef, useState } from "react";
import {
  suggestAddresses,
  placeAddress,
  newAddressSessionToken,
  type AddressSuggestion,
  type AddressParts,
} from "@/services/addressSuggest";
import { V2_COLORS, V2_FONTS } from "@/theme";

export type AddressComponents = AddressParts;

interface Props {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect: (components: AddressComponents) => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  id?: string;
}

const DEBOUNCE_MS = 300;

export function AddressAutocomplete({
  value,
  onChange,
  onPlaceSelect,
  placeholder = "123 Main Street",
  className,
  style,
  id,
}: Props) {
  const listId = useId();
  const [items, setItems] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const token = useRef<string>("");
  const typed = useRef(false); // only ask after the user types, not when the parent sets the value
  const seq = useRef(0);

  useEffect(() => {
    if (!typed.current) return;
    const query = value;
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      if (!token.current) token.current = newAddressSessionToken();
      const found = await suggestAddresses(query, token.current);
      if (mine !== seq.current) return; // a newer keystroke won
      setItems(found);
      setActive(-1);
      setOpen(found.length > 0);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [value]);

  async function pick(s: AddressSuggestion) {
    typed.current = false;
    seq.current++;
    setOpen(false);
    setItems([]);
    onChange(s.main);
    const parts = await placeAddress(s.placeId, token.current || newAddressSessionToken());
    token.current = ""; // the pick ends this billing session
    if (parts) {
      if (parts.address) onChange(parts.address);
      onPlaceSelect(parts);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      void pick(items[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const optionId = (i: number) => `${listId}-opt-${i}`;

  return (
    <div style={{ position: "relative" }}>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        value={value}
        onChange={(e) => {
          typed.current = true;
          onChange(e.target.value);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className={className}
        style={style}
        autoComplete={open ? "off" : "street-address"}
      />
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 20,
            background: V2_COLORS.paper,
            border: `1px solid ${V2_COLORS.divider}`,
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(11,13,26,0.12)",
            overflow: "hidden",
          }}
        >
          <ul
            id={listId}
            role="listbox"
            aria-label="Address suggestions"
            style={{ listStyle: "none", margin: 0, padding: 4 }}
          >
            {items.map((s, i) => (
              <li
                key={s.placeId}
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void pick(s)}
                onMouseEnter={() => setActive(i)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 6,
                  cursor: "pointer",
                  background: i === active ? V2_COLORS.lblue : "transparent",
                  font: `400 13.5px/1.35 ${V2_FONTS.body}`,
                  color: V2_COLORS.ink,
                }}
              >
                <span style={{ fontWeight: 600 }}>{s.main}</span>
                {s.secondary && <span style={{ color: V2_COLORS.muted }}> · {s.secondary}</span>}
              </li>
            ))}
          </ul>
          <div
            style={{
              padding: "4px 10px 6px",
              textAlign: "right",
              font: `400 10.5px/1 ${V2_FONTS.body}`,
              color: V2_COLORS.muted,
            }}
          >
            powered by Google
          </div>
        </div>
      )}
    </div>
  );
}
