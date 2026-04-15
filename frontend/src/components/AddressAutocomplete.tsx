/**
 * Address autocomplete backed by Google Places API.
 *
 * When VITE_GOOGLE_MAPS_API_KEY is set:
 *  - Loads the Google Maps script once (no library package needed).
 *  - Restricts suggestions to US addresses.
 *  - On selection, calls onPlaceSelect with parsed { address, city, state, zipCode }.
 *
 * When the key is absent the field behaves as a normal text input.
 */

import React, { useEffect, useRef, useState } from "react";

const API_KEY = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

export interface AddressComponents {
  address: string;
  city:    string;
  state:   string;
  zipCode: string;
}

interface Props {
  value:          string;
  onChange:       (value: string) => void;
  onPlaceSelect:  (components: AddressComponents) => void;
  placeholder?:   string;
  className?:     string;
  style?:         React.CSSProperties;
  id?:            string;
}

// ─── Script loader (called once per page) ────────────────────────────────────

let scriptPromise: Promise<void> | null = null;

function loadGoogleMaps(apiKey: string): Promise<void> {
  if (scriptPromise) return scriptPromise;
  if ((window as any).google?.maps?.places) {
    scriptPromise = Promise.resolve();
    return scriptPromise;
  }
  scriptPromise = new Promise((resolve, reject) => {
    const callbackName = "__homegentic_gm_cb";
    (window as any)[callbackName] = () => resolve();
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=${callbackName}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

// ─── Address component parser ─────────────────────────────────────────────────

function parsePlace(place: any): AddressComponents {
  const get = (type: string, short = false) => {
    const component = (place.address_components as any[]).find((c: any) =>
      c.types.includes(type)
    );
    return component ? (short ? component.short_name : component.long_name) : "";
  };

  const streetNumber = get("street_number");
  const route        = get("route");
  const address      = [streetNumber, route].filter(Boolean).join(" ");
  const city         = get("locality") || get("sublocality") || get("neighborhood");
  const state        = get("administrative_area_level_1", true); // e.g. "TX"
  const zipCode      = get("postal_code");

  return { address, city, state, zipCode };
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AddressAutocomplete({
  value,
  onChange,
  onPlaceSelect,
  placeholder = "123 Main Street",
  className,
  style,
  id,
}: Props) {
  const inputRef      = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!API_KEY || !inputRef.current) return;

    loadGoogleMaps(API_KEY)
      .then(() => {
        if (!inputRef.current) return;
        const google = (window as any).google;
        const ac = new google.maps.places.Autocomplete(inputRef.current, {
          types:                   ["address"],
          componentRestrictions:   { country: "us" },
          fields:                  ["address_components", "formatted_address"],
        });
        autocompleteRef.current = ac;
        ac.addListener("place_changed", () => {
          const place = ac.getPlace();
          if (!place.address_components) return;
          const parsed = parsePlace(place);
          // Update the raw input value to just the street portion
          onChange(parsed.address || place.formatted_address);
          onPlaceSelect(parsed);
        });
        setReady(true);
      })
      .catch(() => {
        // Script failed — field works as plain input
      });

    return () => {
      // Clean up the Places widget to avoid memory leaks on unmount
      if (autocompleteRef.current) {
        const google = (window as any).google;
        google?.maps?.event?.clearInstanceListeners(autocompleteRef.current);
        autocompleteRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <input
      ref={inputRef}
      id={id}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
      style={style}
      autoComplete={API_KEY && ready ? "off" : "street-address"}
    />
  );
}
