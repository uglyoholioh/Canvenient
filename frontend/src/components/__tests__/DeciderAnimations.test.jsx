import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SplitFlapDecider from "../wheel/SplitFlapDecider";
import ReelDecider from "../wheel/ReelDecider";
import CardDeckDecider from "../wheel/CardDeckDecider";
import SpinWheelView from "../wheel/SpinWheelView";

const TEST_ITEMS = [
  { id: "1", label: "The Deck (Arts)", tag: "Arts", enabled: true },
  { id: "2", label: "Techno Edge", tag: "Eng", enabled: true },
  { id: "3", label: "Frontier", tag: "Science", enabled: true },
];

describe("Decider Animation Styles", () => {
  beforeEach(() => {
    const store = new Map();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key) => store.get(key) ?? null),
      setItem: vi.fn((key, val) => store.set(key, String(val))),
      removeItem: vi.fn((key) => store.delete(key)),
      clear: vi.fn(() => store.clear()),
    });

    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      moveTo: vi.fn(),
      closePath: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn(() => ({ width: 50 })),
    }));
  });

  describe("SplitFlapDecider", () => {
    it("renders terminal board with loaded entries", () => {
      render(<SplitFlapDecider items={TEST_ITEMS} isSpinning={false} />);
      expect(screen.getByText("3 ENTRIES LOADED")).toBeInTheDocument();
      expect(screen.getByText(/STATUS: STANDBY/i)).toBeInTheDocument();
    });

    it("triggers onSpinStart when clicked while idle", () => {
      const onSpinStart = vi.fn();
      render(<SplitFlapDecider items={TEST_ITEMS} isSpinning={false} onSpinStart={onSpinStart} />);
      fireEvent.click(screen.getByText("3 ENTRIES LOADED"));
      expect(onSpinStart).toHaveBeenCalled();
    });
  });

  describe("ReelDecider", () => {
    it("renders vertical strip with items", () => {
      render(<ReelDecider items={TEST_ITEMS} isSpinning={false} />);
      expect(screen.getAllByText("The Deck (Arts)").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Techno Edge").length).toBeGreaterThan(0);
    });

    it("triggers onSpinStart when reel container is clicked", () => {
      const onSpinStart = vi.fn();
      render(<ReelDecider items={TEST_ITEMS} isSpinning={false} onSpinStart={onSpinStart} />);
      fireEvent.click(screen.getAllByText("The Deck (Arts)")[0]);
      expect(onSpinStart).toHaveBeenCalled();
    });
  });

  describe("CardDeckDecider", () => {
    it("renders card deck with active top item and card count", () => {
      render(<CardDeckDecider items={TEST_ITEMS} isSpinning={false} />);
      expect(screen.getByText("3 cards in deck")).toBeInTheDocument();
      expect(screen.getByText("The Deck (Arts)")).toBeInTheDocument();
    });

    it("triggers onSpinStart when card is clicked", () => {
      const onSpinStart = vi.fn();
      render(<CardDeckDecider items={TEST_ITEMS} isSpinning={false} onSpinStart={onSpinStart} />);
      fireEvent.click(screen.getByText("The Deck (Arts)"));
      expect(onSpinStart).toHaveBeenCalled();
    });
  });

  describe("SpinWheelView Style Switcher", () => {
    it("allows switching between Terminal, Reel Ticker, Card Deck, and Wheel", () => {
      render(<SpinWheelView token="fake-token" />);

      // Defaults to Terminal or previous selection
      expect(screen.getByRole("button", { name: /^Terminal$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Reel Ticker$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Card Deck$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Wheel$/i })).toBeInTheDocument();

      // Switch to Reel Ticker
      fireEvent.click(screen.getByRole("button", { name: /^Reel Ticker$/i }));
      expect(screen.getByRole("button", { name: /SPIN REEL/i })).toBeInTheDocument();
      expect(window.localStorage.setItem).toHaveBeenCalledWith("canvenient-decider-style", "reel");

      // Switch to Card Deck
      fireEvent.click(screen.getByRole("button", { name: /^Card Deck$/i }));
      expect(screen.getByRole("button", { name: /SHUFFLE & DRAW/i })).toBeInTheDocument();
      expect(window.localStorage.setItem).toHaveBeenCalledWith("canvenient-decider-style", "cards");

      // Switch to Wheel
      fireEvent.click(screen.getByRole("button", { name: /^Wheel$/i }));
      expect(screen.getByRole("button", { name: /SPIN WHEEL/i })).toBeInTheDocument();
      expect(window.localStorage.setItem).toHaveBeenCalledWith("canvenient-decider-style", "wheel");

      // Switch back to Terminal
      fireEvent.click(screen.getByRole("button", { name: /^Terminal$/i }));
      expect(screen.getByRole("button", { name: /CYCLE FLAPS/i })).toBeInTheDocument();
      expect(window.localStorage.setItem).toHaveBeenCalledWith("canvenient-decider-style", "splitflap");
    });
  });
});
