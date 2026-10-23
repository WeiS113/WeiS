"use client";

import type { CSSProperties } from "react";

type Props = {
  points: string;
  strokeWidth?: number;
  strokeLinecap?: "butt" | "round" | "square";
  strokeLinejoin?: "miter" | "round" | "bevel";
  strokeDasharray?: string;
  className?: string;
};

/**
 * Draw each trend segment independently: rising values are red (Chinese-market
 * convention), falling values are green, and unchanged segments are neutral.
 * SVG coordinates have an inverted Y axis, so a smaller Y means the value rose.
 */
export default function TrendLine({
  points,
  strokeWidth = 2.5,
  strokeLinecap = "round",
  strokeLinejoin = "round",
  strokeDasharray,
  className,
}: Props) {
  const coords = points.trim().split(/\s+/).map((pair) => {
    const [x, y] = pair.split(",").map(Number);
    return { x, y };
  }).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

  return <>
    {coords.slice(1).map((point, index) => {
      const previous = coords[index];
      const stroke = point.y < previous.y ? "#e11d48" : point.y > previous.y ? "#059669" : "#94a3b8";
      const style: CSSProperties = { vectorEffect: "non-scaling-stroke" };
      return <line
        key={index}
        x1={previous.x}
        y1={previous.y}
        x2={point.x}
        y2={point.y}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap={strokeLinecap}
        strokeLinejoin={strokeLinejoin}
        strokeDasharray={strokeDasharray}
        style={style}
      />;
    })}
  </>;
}
