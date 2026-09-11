// Tests for the notes knowledge graph: node/edge derivation from notes.
// react-force-graph-2d is mocked so assertions run on the props it receives.

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const forceGraphProps = [];

vi.mock("react-force-graph-2d", () => ({
  default: (props) => {
    forceGraphProps.push(props);
    return <div data-testid="force-graph" />;
  },
}));

import NotesGraph from "../NotesGraph";

const tagMention = (tag) => `<span data-type="tagMention" data-id="${tag}">${tag}</span>`;

const notes = [
  { id: 1, title: "Concurrency", content: `race conditions ${tagMention("concurrency")}`, tags: [] },
  { id: 2, title: "Locks deep dive", content: `locks ${tagMention("concurrency")}`, tags: [] },
  { id: 3, title: "Cooking notes", content: "pasta basics", tags: [] },
];

describe("NotesGraph", () => {
  beforeEach(() => {
    forceGraphProps.length = 0;
    // jsdom reports clientWidth 0, which hides the graph entirely
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
  });

  it("renders the graph container", () => {
    render(<NotesGraph notes={notes} onNodeClick={() => {}} />);
    expect(screen.getByTestId("force-graph")).toBeInTheDocument();
  });

  it("derives one node per note plus a hub for shared tags, with links", () => {
    render(<NotesGraph notes={notes} onNodeClick={() => {}} />);

    const graphData = forceGraphProps[forceGraphProps.length - 1].graphData;
    const names = graphData.nodes.map((n) => n.name);
    for (const title of ["Concurrency", "Locks deep dive", "Cooking notes"]) {
      expect(names).toContain(title);
    }
    expect(names).toContain("#concurrency"); // tag hub

    // Both concurrency notes link to the tag hub
    const hubLinks = graphData.links.filter((l) => l.target === "tag_concurrency");
    expect(hubLinks.length).toBe(2);
  });

  it("handles an empty note list without crashing", () => {
    render(<NotesGraph notes={[]} onNodeClick={() => {}} />);
    const graphData = forceGraphProps[forceGraphProps.length - 1].graphData;
    expect(graphData.nodes).toEqual([]);
  });
});
