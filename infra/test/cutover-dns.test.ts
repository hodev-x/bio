import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import * as path from "node:path";

const script = path.resolve(import.meta.dirname, "../scripts/cutover-dns.sh");
const snapshot = path.resolve(import.meta.dirname, "fixtures/dns-snapshot.json");
const run = (...args: string[]) => {
  const r = spawnSync("bash", [script, ...args], { encoding: "utf8", env: { ...process.env, BIO_DNS_SNAPSHOT: snapshot } });
  expect(r.status, r.stderr).toBe(0);
  return JSON.parse(r.stdout) as { Changes: Array<{ Action: string; ResourceRecordSet: Record<string, unknown> }> };
};

describe("cutover-dns.sh", () => {
  it("apply --print: one batch with apex A + AAAA alias and www CNAME to the distribution", () => {
    const b = run("apply", "--print", "d111.cloudfront.net");
    expect(b.Changes.map((c) => [c.Action, c.ResourceRecordSet.Name, c.ResourceRecordSet.Type])).toEqual([
      ["UPSERT", "danielhodeta.com.", "A"], ["UPSERT", "danielhodeta.com.", "AAAA"], ["UPSERT", "www.danielhodeta.com.", "CNAME"],
    ]);
    expect(b.Changes[0].ResourceRecordSet.AliasTarget).toEqual({ HostedZoneId: "Z2FDTNDATAQYW2", DNSName: "d111.cloudfront.net.", EvaluateTargetHealth: false });
    expect(b.Changes[2].ResourceRecordSet).toMatchObject({ TTL: 300, ResourceRecords: [{ Value: "d111.cloudfront.net" }] });
  });
  it("rollback --print: restores the snapshot and deletes the AAAA alias", () => {
    const b = run("rollback", "--print", "d111.cloudfront.net");
    expect(b.Changes.map((c) => [c.Action, c.ResourceRecordSet.Name, c.ResourceRecordSet.Type])).toEqual([
      ["UPSERT", "danielhodeta.com.", "A"], ["DELETE", "danielhodeta.com.", "AAAA"], ["UPSERT", "www.danielhodeta.com.", "CNAME"],
    ]);
    expect(b.Changes[0].ResourceRecordSet).toMatchObject({ TTL: 300, ResourceRecords: [{ Value: "192.0.2.10" }] });
  });
  it("apply without --print refuses when no snapshot exists (before any AWS call)", () => {
    const missing = path.resolve(import.meta.dirname, "fixtures/does-not-exist.json");
    const r = spawnSync("bash", [script, "apply", "d111.cloudfront.net"], { encoding: "utf8", env: { ...process.env, BIO_DNS_SNAPSHOT: missing } });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("run 'snapshot' before 'apply'");
  });
  it("is valid bash", () => {
    expect(spawnSync("bash", ["-n", script]).status).toBe(0);
  });
});
