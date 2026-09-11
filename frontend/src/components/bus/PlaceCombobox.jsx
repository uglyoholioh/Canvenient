import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { normalise } from "./busHelpers";

export function PlaceCombobox({
  label,
  value,
  onChange,
  onSelectPlace,
  suggestions,
  placeholder,
  tabIndex,
  onEnterSubmit,
  inputRef,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const blurTimerRef = useRef(null);

  useEffect(() => {
    if (suggestions.length > 0 && isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the highlight when the suggestion list changes
      setHighlightedIndex(0);
    } else {
      setHighlightedIndex(-1);
    }
  }, [suggestions, isOpen]);

  const handleFocus = () => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    if (normalise(value).length >= 2) {
      setIsOpen(true);
    }
  };

  const handleBlur = () => {
    blurTimerRef.current = setTimeout(() => {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }, 150);
  };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen && suggestions.length > 0) {
        setIsOpen(true);
        setHighlightedIndex(0);
        return;
      }
      if (suggestions.length > 0) {
        setHighlightedIndex((prev) => (prev + 1) % suggestions.length);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (suggestions.length > 0) {
        setHighlightedIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
      }
    } else if (e.key === "Enter") {
      if (isOpen && highlightedIndex >= 0 && suggestions[highlightedIndex]) {
        e.preventDefault();
        const selected = suggestions[highlightedIndex];
        onSelectPlace(selected);
        setIsOpen(false);
        setHighlightedIndex(-1);
      } else if (isOpen && suggestions.length === 1) {
        e.preventDefault();
        onSelectPlace(suggestions[0]);
        setIsOpen(false);
        setHighlightedIndex(-1);
      } else if (onEnterSubmit) {
        onEnterSubmit(e);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  const handleItemClick = (place) => {
    onSelectPlace(place);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  return (
    <div className="cbm-place-combobox">
      <label className="cbm-place-field">
        <span>{label}</span>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            if (normalise(e.target.value).length >= 2) {
              setIsOpen(true);
            } else {
              setIsOpen(false);
            }
          }}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label={label}
          aria-autocomplete="list"
          aria-expanded={isOpen}
          tabIndex={tabIndex}
          autoComplete="off"
        />
      </label>

      {isOpen && suggestions.length > 0 && (
        <div className="cbm-suggest-dropdown" role="listbox" aria-label={`${label} suggestions`}>
          {suggestions.map((place, idx) => (
            <button
              type="button"
              key={place.id}
              role="option"
              aria-selected={idx === highlightedIndex}
              className={`cbm-suggest-item ${idx === highlightedIndex ? "is-highlighted" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                handleItemClick(place);
              }}
              onMouseEnter={() => setHighlightedIndex(idx)}
            >
              <div className="cbm-suggest-title">
                <MapPin size={10} className="cbm-suggest-pin" aria-hidden="true" />
                <span>{place.name}</span>
              </div>
              {place.subtitle && <small className="cbm-suggest-subtitle">{place.subtitle}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────
