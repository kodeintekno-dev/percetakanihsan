import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  invoiceSchema,
  paymentSchema,
  parseTradeFilters,
} from "@/features/trade/schema";
import { invoiceState } from "@/features/trade/calculation";
describe("Tagihan dan pembayaran", () => {
  it("menjaga ketepatan Rupiah di atas batas bilangan JavaScript", () => {
    expect(
      invoiceState(
        "999999999999999999",
        "9007199254740993",
        "2026-11-13",
        "2026-11-13",
      ),
    ).toEqual({
      remaining: "990992800745259006",
      status: "PARTIAL",
      overdue: false,
    });
    expect(invoiceState("100", "100", "2020-01-01", "2026-11-13")).toEqual({
      remaining: "0",
      status: "PAID",
      overdue: false,
    });
    expect(
      invoiceState("100", "0", "2020-01-01", "2026-11-13", true).status,
    ).toBe("CANCELLED");
  });
  it("membedakan status pembayaran dari tanda lewat jatuh tempo", () => {
    expect(invoiceState("100", "0", "2026-11-12", "2026-11-13")).toMatchObject({
      status: "OPEN",
      overdue: true,
    });
    expect(invoiceState("100", "10", "2026-11-13", "2026-11-13")).toMatchObject(
      { status: "PARTIAL", overdue: false },
    );
  });
  it("mewajibkan pesanan untuk piutang, pemasok dan pos untuk hutang serta rentang tanggal valid", () => {
    const data = {
      id: randomUUID(),
      kind: "RECEIVABLE",
      reference: "INV-1",
      amount: "2000000",
      issueDate: "2026-11-13",
      dueDate: "2026-11-20",
      orderId: "order",
    };
    expect(invoiceSchema.safeParse(data).success).toBe(true);
    for (const change of [
      { orderId: null },
      { dueDate: "2026-11-12" },
      { amount: "0" },
      { amount: "1.5" },
      { amount: "1000000000000000000" },
    ])
      expect(invoiceSchema.safeParse({ ...data, ...change }).success).toBe(
        false,
      );
    expect(
      invoiceSchema.safeParse({
        ...data,
        kind: "PAYABLE",
        orderId: null,
        partyName: "Pemasok",
        expensePostId: "post",
      }).success,
    ).toBe(true);
    expect(
      invoiceSchema.safeParse({ ...data, kind: "PAYABLE", orderId: null })
        .success,
    ).toBe(false);
  });
  it("mencegah payload pembayaran campuran dan query ganda", () => {
    const common = { id: randomUUID(), updatedAt: new Date().toISOString() };
    expect(
      paymentSchema.safeParse({ ...common, mode: "LINK", cashId: "cash" })
        .success,
    ).toBe(true);
    expect(
      paymentSchema.safeParse({
        ...common,
        mode: "LINK",
        cashId: "cash",
        amount: "100",
      }).success,
    ).toBe(false);
    expect(() =>
      parseTradeFilters(new URLSearchParams("kind=PAYABLE&kind=RECEIVABLE")),
    ).toThrow();
  });
});
