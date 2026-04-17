import { describe, expect, it } from "vitest";
import {
  getAccessDecision,
  hasRole,
  isAccessCodeValid,
  isReservationActive
} from "../src";

const now = new Date("2026-04-16T12:00:00.000Z");

describe("role logic", () => {
  it("respects hierarchy", () => {
    expect(hasRole(["super_admin"], "org_admin")).toBe(true);
    expect(hasRole(["station_admin"], "org_admin")).toBe(false);
  });
});

describe("reservation validation", () => {
  it("accepts active confirmed reservations", () => {
    expect(
      isReservationActive(now, {
        id: "res-1",
        organizationId: "org-1",
        stationId: "station-1",
        userId: "user-1",
        startsAt: "2026-04-16T11:00:00.000Z",
        endsAt: "2026-04-16T13:00:00.000Z",
        estimatedMinutes: 120,
        status: "confirmed",
        projectName: "Project A",
        workType: "render",
        bufferMinutes: 15,
        instructions: "Use the lock screen code",
        accessCode: null
      })
    ).toBe(true);
  });

  it("rejects cancelled reservations", () => {
    expect(
      isReservationActive(now, {
        id: "res-1",
        organizationId: "org-1",
        stationId: "station-1",
        userId: "user-1",
        startsAt: "2026-04-16T11:00:00.000Z",
        endsAt: "2026-04-16T13:00:00.000Z",
        estimatedMinutes: 120,
        status: "cancelled",
        projectName: "Project A",
        workType: "render",
        bufferMinutes: 15,
        instructions: null,
        accessCode: null
      })
    ).toBe(false);
  });
});

describe("access code validation", () => {
  it("rejects expired codes", () => {
    expect(
      isAccessCodeValid(now, {
        id: "code-1",
        codeHash: "hash",
        stationId: null,
        reservationId: null,
        validFrom: "2026-04-16T08:00:00.000Z",
        validUntil: "2026-04-16T09:00:00.000Z",
        maxUses: 1,
        usedCount: 0
      })
    ).toBe(false);
  });

  it("rejects exhausted codes", () => {
    expect(
      isAccessCodeValid(now, {
        id: "code-1",
        codeHash: "hash",
        stationId: null,
        reservationId: null,
        validFrom: "2026-04-16T08:00:00.000Z",
        validUntil: "2026-04-16T18:00:00.000Z",
        maxUses: 1,
        usedCount: 1
      })
    ).toBe(false);
  });
});

describe("access decision", () => {
  it("allows valid reservation", () => {
    expect(
      getAccessDecision({
        now,
        reservation: {
          id: "res-1",
          organizationId: "org-1",
          stationId: "station-1",
          userId: "user-1",
          startsAt: "2026-04-16T11:00:00.000Z",
          endsAt: "2026-04-16T13:00:00.000Z",
          estimatedMinutes: 120,
          status: "checked_in",
          projectName: "Project A",
          workType: "render",
          bufferMinutes: 15,
          instructions: null,
          accessCode: null
        }
      }).reason
    ).toBe("reservation");
  });

  it("allows admin override when no reservation or code exists", () => {
    expect(
      getAccessDecision({
        now,
        membership: {
          id: "mem-1",
          organizationId: "org-1",
          role: "org_admin"
        }
      }).reason
    ).toBe("admin_override");
  });
});
