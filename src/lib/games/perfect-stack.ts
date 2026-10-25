export type Cell = [number, number];
export type StackPiece = {
  id: string;
  color: "blue" | "gold" | "green" | "coral";
  cells: Cell[];
};
export type StackPuzzle = {
  challengeNumber: number;
  size: number;
  fixed: Array<{ cell: Cell; color: StackPiece["color"] }>;
  pieces: StackPiece[];
  target: Cell[];
};

const fixed = [
  { cell: [0, 1], color: "blue" },
  { cell: [0, 2], color: "blue" },
  { cell: [1, 4], color: "green" },
  { cell: [1, 5], color: "green" },
  { cell: [2, 4], color: "green" },
  { cell: [2, 5], color: "green" },
  { cell: [2, 1], color: "coral" },
  { cell: [2, 2], color: "coral" },
  { cell: [3, 2], color: "gold" },
  { cell: [4, 2], color: "gold" },
  { cell: [4, 3], color: "gold" },
  { cell: [5, 3], color: "gold" },
] as Array<{ cell: Cell; color: StackPiece["color"] }>;

const pieces: StackPiece[] = [
  {
    id: "blue-l",
    color: "blue",
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 2],
    ],
  },
  {
    id: "gold-z",
    color: "gold",
    cells: [
      [0, 0],
      [1, 0],
      [1, 1],
      [2, 1],
    ],
  },
  {
    id: "green-o",
    color: "green",
    cells: [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ],
  },
  {
    id: "coral-t",
    color: "coral",
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 1],
    ],
  },
];

const solution: Record<string, Cell[]> = {
  "blue-l": [
    [6, 0],
    [6, 1],
    [6, 2],
    [7, 2],
  ],
  "gold-z": [
    [3, 5],
    [4, 5],
    [4, 6],
    [5, 6],
  ],
  "green-o": [
    [6, 4],
    [6, 5],
    [7, 4],
    [7, 5],
  ],
  "coral-t": [
    [0, 5],
    [0, 6],
    [0, 7],
    [1, 6],
  ],
};

export const dailyStackPuzzle: StackPuzzle = {
  challengeNumber: 127,
  size: 8,
  fixed,
  pieces,
  target: [...fixed.map((x) => x.cell), ...Object.values(solution).flat()],
};
