// Shapes offered in Elements and in the tool rail's shapes menu, with 24×24 SVG icons.

import type { AddShapeKind } from '../state/placement';

export const SHAPE_BUTTONS: { kind: AddShapeKind; label: string; icon: string; stroke?: boolean }[] = [
  { kind: 'rect', label: 'Rectangle', icon: 'M4 6h16v12H4z' },
  { kind: 'rounded', label: 'Rounded', icon: 'M8 6h8a4 4 0 0 1 4 4v4a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-4a4 4 0 0 1 4-4z' },
  { kind: 'circle', label: 'Circle', icon: 'M12 4a8 8 0 1 1 0 16a8 8 0 1 1 0-16z' },
  { kind: 'ellipse', label: 'Ellipse', icon: 'M12 7c5 0 9 2.2 9 5s-4 5-9 5-9-2.2-9-5 4-5 9-5z' },
  { kind: 'triangle', label: 'Triangle', icon: 'M12 4l9 16H3z' },
  { kind: 'star', label: 'Star', icon: 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z' },
  { kind: 'burst', label: 'Burst', icon: 'M12 2l1.8 3.3 3.5-1.4.3 3.8 3.7.9-1.9 3.3 2.6 2.7-3.6 1.3.4 3.8-3.7-.8L12 22l-2.1-3.1-3.7.8.4-3.8-3.6-1.3 2.6-2.7-1.9-3.3 3.7-.9.3-3.8 3.5 1.4z' },
  { kind: 'heart', label: 'Heart', icon: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z' },
  { kind: 'arrow', label: 'Arrow', icon: 'M3 10h11V6l7 6-7 6v-4H3z' },
  { kind: 'diamond', label: 'Diamond', icon: 'M12 3l8 9-8 9-8-9z' },
  { kind: 'pentagon', label: 'Pentagon', icon: 'M12 3l9 6.5-3.4 10.5H6.4L3 9.5z' },
  { kind: 'hexagon', label: 'Hexagon', icon: 'M7.5 4h9L21 12l-4.5 8h-9L3 12z' },
  { kind: 'octagon', label: 'Octagon', icon: 'M8.3 3h7.4L21 8.3v7.4L15.7 21H8.3L3 15.7V8.3z' },
  { kind: 'ring', label: 'Ring', icon: 'M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18zm0 4.5a4.5 4.5 0 1 0 0 9a4.5 4.5 0 1 0 0-9z' },
  { kind: 'plus', label: 'Plus', icon: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z' },
  { kind: 'bubble', label: 'Speech', icon: 'M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9l-4 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z' },
  { kind: 'shield', label: 'Shield', icon: 'M4 3h16v8c0 5-4 8.5-8 10-4-1.5-8-5-8-10z' },
  { kind: 'ribbon', label: 'Ribbon', icon: 'M2 7h20l-2.5 5L22 17H2l2.5-5z' },
  { kind: 'semicircle', label: 'Half circle', icon: 'M3 17a9 9 0 0 1 18 0z' },
  { kind: 'parallelogram', label: 'Slant', icon: 'M7 6h15l-5 12H2z' },
  { kind: 'chevron', label: 'Chevron', icon: 'M3 5h10l7 7-7 7H3l7-7z' },
  { kind: 'bolt', label: 'Bolt', icon: 'M14 2L5 13h6l-2 9 9-12h-6z' },
  { kind: 'moon', label: 'Moon', icon: 'M15 3a9 9 0 1 0 6 13A8 8 0 0 1 15 3z' },
  { kind: 'line', label: 'Line', icon: 'M4 12h16', stroke: true },
];
