import { describe, expect, it } from "vitest";
import { militaryNumber, productionProgress, serviceForces } from "../src/features/military/headquartersModel";
import type { MilitaryCreationQueue, MilitaryOverview } from "../src/features/military/types";
import { joinBorderSegments } from "../src/features/military/borderGeometry";
import borders from "../src/data/militaryBorderSegments.json";

describe("military headquarters data", () => {
  it("joins contiguous border segments without bridging unrelated territory", () => {
    const first = {id:"a",countryIds:[1,2],points:[{x:1,y:1},{x:2,y:1}]};
    const reverse = {id:"b",countryIds:[1,2],points:[{x:3,y:1},{x:2,y:1}]};
    expect(joinBorderSegments([first,reverse])).toEqual([{x:1,y:1},{x:2,y:1},{x:3,y:1}]);
    expect(joinBorderSegments([first,{...reverse,points:[{x:9,y:1},{x:10,y:1}]}])).toBe(null);
  });
  it("uses unique real shared boundary IDs and contiguous raster edges", () => {
    expect(new Set(borders.segments.map((segment) => segment.id)).size).toBe(borders.segments.length);
    for (const segment of borders.segments) {
      expect(segment.countryIds).toHaveLength(2);
      expect(segment.countryIds.every((id) => id > 0)).toBe(true);
      segment.points.slice(1).forEach((point,index) => {
        const previous = segment.points[index];
        expect(Math.abs(point.x-previous.x)+Math.abs(point.y-previous.y)).toBe(1);
      });
    }
  });
  it("distinguishes missing values from configured zero", () => {
    expect(militaryNumber(null)).toBe("미설정");
    expect(militaryNumber(undefined)).toBe("미설정");
    expect(militaryNumber(Number.NaN)).toBe("미설정");
    expect(militaryNumber(0)).toBe("0");
  });
  it("uses world dates, not a fixed progress or a turn number", () => {
    const queue = { status: "IN_PROGRESS", requested_world_date: "1932-01-01", completion_world_date: "1932-01-11" } as MilitaryCreationQueue;
    expect(productionProgress(queue, "1932-01-06")).toBe(50);
    expect(productionProgress(queue, "1931-12-31")).toBe(0);
    expect(productionProgress(queue, "1932-02-01")).toBe(100);
    expect(productionProgress({ ...queue, completion_world_date: "invalid" }, "1932-01-06")).toBe(null);
  });
  it("keeps individual ships and sunk records, without inventing readiness", () => {
    const data = { templates: [], units: [], airWings: [], fleets: [{ id: "fleet" }], vessels: [{ id: "a", display_name: "A", template_id: "template", status: "ACTIVE", fleet_id: "fleet", assigned_front_id: null }, { id: "b", display_name: "B", template_id: "template", status: "SUNK", fleet_id: "fleet", assigned_front_id: null }] } as unknown as MilitaryOverview;
    expect(serviceForces(data, "VESSEL").map((ship) => ship.id)).toEqual(["a", "b"]);
    expect(serviceForces(data, "VESSEL")[0].readiness).toBe(null);
    expect(serviceForces(data, "LAND_UNIT")).toEqual([]);
  });
});
