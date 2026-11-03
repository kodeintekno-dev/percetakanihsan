"use client";
import { useEffect, useRef } from "react";
import {
  gridStride,
  type CuttingResult,
  type CutOrientation,
} from "@/lib/calculations/cutting";
import { formatQuantity } from "@/lib/money";
export function CuttingCanvas({
  result,
  orientation,
}: {
  result: CuttingResult;
  orientation: CutOrientation;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    container = useRef<HTMLDivElement>(null),
    grid = result[orientation];
  useEffect(() => {
    const node = canvas.current,
      box = container.current;
    if (!node || !box) return;
    function draw() {
      const ctx = node!.getContext("2d");
      if (!ctx) return;
      const width = Math.max(
          200,
          Math.floor(box!.getBoundingClientRect().width),
        ),
        height = 360,
        dpr = window.devicePixelRatio || 1;
      node!.width = Math.round(width * dpr);
      node!.height = Math.round(height * dpr);
      node!.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const lp = Number(result.input.sheetLengthCm),
        wp = Number(result.input.sheetWidthCm),
        pieceX = Number(grid.pieceLengthCm),
        pieceY = Number(grid.pieceWidthCm),
        cols = Number(grid.columns),
        rows = Number(grid.rows);
      const scale = Math.min((width - 82) / lp, (height - 82) / wp),
        w = lp * scale,
        h = wp * scale,
        x = 52 + (width - 82 - w) / 2,
        y = 22 + (height - 82 - h) / 2;
      ctx.fillStyle = "#fff1db";
      ctx.fillRect(x, y, w, h);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.strokeStyle = "#e6c79a";
      ctx.lineWidth = 1;
      // Arsiran dibatasi ukuran gambar, bukan banyaknya petak matematika.
      for (let n = -h; n < w + h; n += 12) {
        ctx.beginPath();
        ctx.moveTo(x + n, y);
        ctx.lineTo(x + n + h, y + h);
        ctx.stroke();
      }
      ctx.restore();
      if (BigInt(grid.yield) > 0n) {
        const usedW = cols * pieceX * scale,
          usedH = rows * pieceY * scale;
        ctx.fillStyle = "#dcecdc";
        ctx.fillRect(x, y, usedW, usedH);
        ctx.strokeStyle = "#6b9277";
        ctx.lineWidth = 0.8;
        const sx = Number(gridStride(grid.columns)),
          sy = Number(gridStride(grid.rows));
        for (let col = 0; col < cols; col += sx) {
          ctx.beginPath();
          ctx.moveTo(x + col * pieceX * scale, y);
          ctx.lineTo(x + col * pieceX * scale, y + usedH);
          ctx.stroke();
        }
        for (let row = 0; row < rows; row += sy) {
          ctx.beginPath();
          ctx.moveTo(x, y + row * pieceY * scale);
          ctx.lineTo(x + usedW, y + row * pieceY * scale);
          ctx.stroke();
        }
        ctx.strokeRect(x, y, usedW, usedH);
      }
      ctx.strokeStyle = "#235844";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, w, h);
      ctx.strokeStyle = "#748477";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y + h + 14);
      ctx.lineTo(x + w, y + h + 14);
      ctx.moveTo(x, y + h + 10);
      ctx.lineTo(x, y + h + 18);
      ctx.moveTo(x + w, y + h + 10);
      ctx.lineTo(x + w, y + h + 18);
      ctx.moveTo(x - 14, y);
      ctx.lineTo(x - 14, y + h);
      ctx.moveTo(x - 18, y);
      ctx.lineTo(x - 10, y);
      ctx.moveTo(x - 18, y + h);
      ctx.lineTo(x - 10, y + h);
      ctx.stroke();
      ctx.fillStyle = "#345242";
      ctx.font = "11px Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        `X (panjang): ${formatQuantity(result.input.sheetLengthCm)} cm`,
        x + w / 2,
        Math.min(height - 8, y + h + 34),
      );
      ctx.save();
      ctx.translate(Math.max(12, x - 30), y + h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(
        `Y (lebar): ${formatQuantity(result.input.sheetWidthCm)} cm`,
        0,
        0,
      );
      ctx.restore();
    }
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(box);
    window.addEventListener("resize", draw);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", draw);
    };
  }, [result, orientation, grid]);
  const simplified =
    gridStride(grid.columns) !== "1" || gridStride(grid.rows) !== "1";
  return (
    <figure className="cut-figure">
      <div ref={container} className="cut-canvas-box">
        <canvas
          ref={canvas}
          role="img"
          aria-label={`Pola ${orientation === "original" ? "asli" : "diputar"}: ${grid.columns} kolom × ${grid.rows} baris, ${grid.yield} potongan. Sisa X ${grid.remainingLengthCm} cm dan Y ${grid.remainingWidthCm} cm.`}
          data-columns={grid.columns}
          data-rows={grid.rows}
          data-yield={grid.yield}
          data-simplified={simplified}
        >
          Pola potong dijelaskan pada angka hasil dan keterangan di bawah.
        </canvas>
      </div>
      <figcaption>
        <span className="cut-legend">
          <i />
          Potongan terpakai <i className="waste" />
          Sisa / waste
        </span>
        <p>
          {formatQuantity(grid.columns)} kolom × {formatQuantity(grid.rows)}{" "}
          baris = <strong>{formatQuantity(grid.yield)} potongan</strong>. Sisa
          X: {formatQuantity(grid.remainingLengthCm)} cm · Sisa Y:{" "}
          {formatQuantity(grid.remainingWidthCm)} cm.
        </p>
        {simplified && (
          <p className="cut-detail-note">
            Petak sangat banyak: garis ditampilkan setiap beberapa kolom/baris.
            Angka yield tetap dihitung penuh, tanpa pembatasan render.
          </p>
        )}
      </figcaption>
    </figure>
  );
}
