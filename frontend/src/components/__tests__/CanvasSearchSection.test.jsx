import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import CanvasSearchSection from "../CanvasSearchSection";

describe("CanvasSearchSection", () => {
  const mockCourses = [
    { id: "101", course_code: "ST2334", name: "Probability & Statistics", color: "#3b82f6" },
    { id: "102", course_code: "CS2040S", name: "Data Structures and Algorithms", color: "#10b981" },
  ];

  const mockFilesByCourse = {
    "101": [
      { id: "f1", display_name: "ST2334_Lecture_Week_5.pdf", size: 1048576, updated_at: "2026-09-01T10:00:00Z", url: "https://canvas.nus.edu.sg/files/f1" },
      { id: "f2", display_name: "ST2334_Tutorial_4_Solutions.pdf", size: 524288, updated_at: "2026-08-25T10:00:00Z", url: "https://canvas.nus.edu.sg/files/f2" },
      { id: "f3", display_name: "ST2334_Lecture_Week_6.pdf", size: 2048576, updated_at: "2026-09-08T10:00:00Z", url: "https://canvas.nus.edu.sg/files/f3" },
    ],
    "102": [
      { id: "f4", display_name: "CS2040S_Lecture_Week_5_Graphs.pdf", size: 1548576, updated_at: "2026-09-01T10:00:00Z", url: "https://canvas.nus.edu.sg/files/f4" },
    ],
  };

  it("finds the exact lecture file when searching 'ST2334 week 5 lecture'", () => {
    render(
      <CanvasSearchSection
        filesByCourse={mockFilesByCourse}
        displayedCourses={mockCourses}
        courseColors={new Map([["ST2334", "#3b82f6"], ["CS2040S", "#10b981"]])}
        selectedCourseId="all"
      />
    );

    const input = screen.getByPlaceholderText(/Search files & materials across all modules/i);
    fireEvent.change(input, { target: { value: "ST2334 week 5 lecture" } });

    expect(screen.getByText("ST2334_Lecture_Week_5.pdf")).toBeInTheDocument();
    const matchesCount = screen.getByText(/match/i);
    expect(matchesCount).toBeInTheDocument();
  });

  it("filters by file type pills", () => {
    render(
      <CanvasSearchSection
        filesByCourse={mockFilesByCourse}
        displayedCourses={mockCourses}
        courseColors={new Map([["ST2334", "#3b82f6"]])}
        selectedCourseId="all"
      />
    );

    const input = screen.getByPlaceholderText(/Search files & materials across all modules/i);
    fireEvent.change(input, { target: { value: "ST2334" } });

    expect(screen.getByText("ST2334_Lecture_Week_5.pdf")).toBeInTheDocument();

    const imgFilter = screen.getByRole("button", { name: "IMG" });
    fireEvent.click(imgFilter);

    expect(screen.getByText(/No files found matching/i)).toBeInTheDocument();
  });
});
