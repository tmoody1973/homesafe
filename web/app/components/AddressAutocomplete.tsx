"use client";

import {
  Autocomplete,
  EmptyState,
  Label,
  ListBox,
  SearchField,
  Spinner,
} from "@heroui/react";
import { useAsyncList } from "@react-stately/data";
import { useRef } from "react";
import { cn } from "tailwind-variants";
import { createCaseAction } from "../actions";

type Suggestion = {
  readonly samAddressId: number;
  readonly fullAddress: string;
  readonly neighborhood: string | null;
};

// Type-ahead over our own 399,452 Boston addresses — no external geocoder,
// no API key. FR-01 holds: every unit renders as its own row and the resident
// picks one; picking IS the explicit choice.
export function AddressAutocomplete() {
  const formRef = useRef<HTMLFormElement>(null);
  const samIdRef = useRef<HTMLInputElement>(null);
  const rawRef = useRef<HTMLInputElement>(null);

  const list = useAsyncList<Suggestion>({
    async load({ filterText, signal }) {
      if (!filterText || filterText.trim().length < 3) return { items: [] };
      const response = await fetch(
        `/api/address-suggest?q=${encodeURIComponent(filterText.trim())}`,
        { signal },
      );
      const json = (await response.json()) as { suggestions: Suggestion[] };
      return { items: json.suggestions };
    },
  });

  function startCase(samAddressId: number, fullAddress: string): void {
    samIdRef.current!.value = String(samAddressId);
    rawRef.current!.value = fullAddress;
    formRef.current!.requestSubmit();
  }

  return (
    <div className="flex flex-col gap-2">
      <form action={createCaseAction} ref={formRef}>
        <input name="sam_address_id" ref={samIdRef} type="hidden" />
        <input name="raw_address" ref={rawRef} type="hidden" />
        <input name="issue_category" type="hidden" value="heat" />
      </form>

      <Autocomplete
        allowsEmptyCollection
        className="w-full"
        onSelectionChange={(key) => {
          const chosen = list.items.find(
            (item) => String(item.samAddressId) === String(key),
          );
          if (chosen) startCase(chosen.samAddressId, chosen.fullAddress);
        }}
        placeholder="Start typing your address…"
        selectionMode="single"
      >
        <Label>Your Boston address</Label>
        <Autocomplete.Trigger>
          <Autocomplete.Value />
          <Autocomplete.ClearButton />
          <Autocomplete.Indicator />
        </Autocomplete.Trigger>
        <Autocomplete.Popover>
          <Autocomplete.Filter
            inputValue={list.filterText}
            onInputChange={list.setFilterText}
          >
            <SearchField autoFocus className="sticky top-0 z-10" name="search" variant="secondary">
              <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input placeholder="302 Sumner…" />
                <Spinner
                  className={cn("absolute end-2 top-1/2 -translate-y-1/2", {
                    "pointer-events-none opacity-0": !list.isLoading,
                  })}
                  size="sm"
                />
                <SearchField.ClearButton
                  className={cn({ "pointer-events-none opacity-0": !!list.isLoading })}
                />
              </SearchField.Group>
            </SearchField>
            <ListBox
              className="max-h-[320px] overflow-y-auto"
              items={list.items}
              renderEmptyState={() => (
                <EmptyState>
                  {list.filterText.trim().length < 3
                    ? "Keep typing; three letters starts the search"
                    : "No Boston address matches that"}
                </EmptyState>
              )}
            >
              {(item: Suggestion) => (
                <ListBox.Item
                  id={String(item.samAddressId)}
                  textValue={item.fullAddress}
                >
                  <div className="flex flex-col">
                    <span>{item.fullAddress}</span>
                    {item.neighborhood && (
                      <span className="text-xs text-muted">{item.neighborhood}</span>
                    )}
                  </div>
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              )}
            </ListBox>
          </Autocomplete.Filter>
        </Autocomplete.Popover>
      </Autocomplete>
      <p className="text-xs text-muted">
        Every unit is its own entry, and you pick yours. HomeSafe never guesses between units.
      </p>
    </div>
  );
}
