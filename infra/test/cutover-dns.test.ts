import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

const script = path.resolve(import.meta.dirname, "../scripts/cutover-dns.sh");
const snapshot = path.resolve(import.meta.dirname, "fixtures/dns-snapshot.json");
const run = (...args: string[]) => {
  const r = spawnSync("bash", [script, ...args], { encoding: "utf8", env: { ...process.env, BIO_DNS_SNAPSHOT: snapshot } });
  expect(r.status, r.stderr).toBe(0);
  return JSON.parse(r.stdout) as { Changes: Array<{ Action: string; ResourceRecordSet: Record<string, unknown> }> };
};

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "cutover-"));
// Stub `aws`: exits with `code` (non-zero = failure); on 0 answers the zone lookup and returns $STUB_RRS for record listing.
const stub = (dir: string, code: number) => {
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin, { recursive: true });
  const f = path.join(bin, "aws");
  fs.writeFileSync(f, `#!/usr/bin/env bash\n[ ${code} -ne 0 ] && exit ${code}\ncase "$2" in list-hosted-zones-by-name) echo /hostedzone/ZTEST;; list-resource-record-sets) cat "$STUB_RRS";; esac\n`, { mode: 0o755 });
  return bin;
};
const sh = (args: string[], env: Record<string, string> = {}) =>
  spawnSync("bash", [script, ...args], { encoding: "utf8", env: { ...process.env, BIO_DNS_SNAPSHOT: snapshot, ...env } });

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
  it("apply batch has exact alias sets (no TTL) and rollback deletes the alias AAAA", () => {
    const alias = { HostedZoneId: "Z2FDTNDATAQYW2", DNSName: "d111.cloudfront.net.", EvaluateTargetHealth: false };
    const b = run("apply", "--print", "d111.cloudfront.net");
    expect(b.Changes[0].ResourceRecordSet).toEqual({ Name: "danielhodeta.com.", Type: "A", AliasTarget: alias });
    expect(b.Changes[1].ResourceRecordSet).toEqual({ Name: "danielhodeta.com.", Type: "AAAA", AliasTarget: alias });
    const r = run("rollback", "--print", "d111.cloudfront.net");
    expect(r.Changes[1].ResourceRecordSet).toEqual({ Name: "danielhodeta.com.", Type: "AAAA", AliasTarget: alias });
  });
  it("accepts --print after the dist domain", () => {
    const r = spawnSync("bash", [script, "apply", "d111.cloudfront.net", "--print"], { encoding: "utf8", env: { ...process.env, BIO_DNS_SNAPSHOT: snapshot } });
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout).Changes).toHaveLength(3);
  });
  it("rejects unknown flags, extra args and bad dist domains with exit 2", () => {
    expect(sh(["apply", "--bogus", "d1.cloudfront.net"]).status).toBe(2);
    expect(sh(["apply", "--print", "d1.cloudfront.net", "d2.cloudfront.net"]).status).toBe(2);
    expect(sh(["apply", "--print", "example.com"]).status).toBe(2);
  });
  it("apply refuses missing, empty or already-cut-over snapshots before any AWS call", () => {
    const dir = tmp();
    const empty = path.join(dir, "empty.json");
    fs.writeFileSync(empty, "");
    const cut = path.join(dir, "cut.json");
    fs.writeFileSync(cut, JSON.stringify([
      { Name: "danielhodeta.com.", Type: "A", AliasTarget: { HostedZoneId: "Z2FDTNDATAQYW2", DNSName: "d1.cloudfront.net." } },
      { Name: "www.danielhodeta.com.", Type: "CNAME", TTL: 300, ResourceRecords: [{ Value: "d1.cloudfront.net" }] },
    ]));
    for (const snap of [path.join(dir, "missing.json"), empty, cut]) {
      const r = sh(["apply", "d111.cloudfront.net"], { BIO_DNS_SNAPSHOT: snap, PATH: `${stub(dir, 99)}:${process.env.PATH}` });
      expect(r.status).toBe(1);
    }
    expect(sh(["apply", "d111.cloudfront.net"], { BIO_DNS_SNAPSHOT: path.join(dir, "missing.json") }).stderr).toContain("no snapshot at");
  });
  it("snapshot refuses to overwrite without --force and leaves the file unchanged", () => {
    const dir = tmp();
    const snap = path.join(dir, "snap.json");
    fs.writeFileSync(snap, "KEEP");
    const r = sh(["snapshot"], { BIO_DNS_SNAPSHOT: snap, PATH: `${stub(dir, 0)}:${process.env.PATH}` });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(snap);
    expect(fs.readFileSync(snap, "utf8")).toBe("KEEP");
  });
  it("snapshot leaves an existing file unchanged when aws fails", () => {
    const dir = tmp();
    const snap = path.join(dir, "snap.json");
    fs.writeFileSync(snap, "KEEP");
    const r = sh(["snapshot", "--force"], { BIO_DNS_SNAPSHOT: snap, PATH: `${stub(dir, 1)}:${process.env.PATH}` });
    expect(r.status).not.toBe(0);
    expect(fs.readFileSync(snap, "utf8")).toBe("KEEP");
  });
  it("snapshot saves valid pre-cutover records via a stubbed aws", () => {
    const dir = tmp();
    const snap = path.join(dir, "sub", "snap.json");
    const r = sh(["snapshot"], { BIO_DNS_SNAPSHOT: snap, STUB_RRS: snapshot, PATH: `${stub(dir, 0)}:${process.env.PATH}` });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain(snap);
    expect(JSON.parse(fs.readFileSync(snap, "utf8"))).toHaveLength(2);
  });
  it("is valid bash", () => {
    expect(spawnSync("bash", ["-n", script]).status).toBe(0);
  });
});
