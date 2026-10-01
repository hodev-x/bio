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
// Stub `aws`: logs every invocation to <dir>/calls.log, answers per sub-command, and can be told to fail.
// opts.code: exit immediately with this code. env STUB_FAIL_RRS=1 fails only record listing.
const stub = (dir: string, code = 0) => {
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin, { recursive: true });
  const f = path.join(bin, "aws");
  fs.writeFileSync(f, `#!/usr/bin/env bash
echo "$*" >> "${dir}/calls.log"
[ ${code} -ne 0 ] && exit ${code}
case "$2" in
  list-hosted-zones-by-name) echo /hostedzone/ZTEST ;;
  change-resource-record-sets)
    while [ $# -gt 0 ]; do [ "$1" = --change-batch ] && printf '%s' "$2" > "${dir}/batch.json"; shift; done
    echo /change/C1 ;;
  list-resource-record-sets)
    [ -n "$STUB_FAIL_RRS" ] && exit 1
    case "$*" in
      *AAAA*) echo "$STUB_AAAA" ;;
      *"[0].AliasTarget.HostedZoneId"*) echo "$STUB_A_ZONE" ;;
      *) cat "$STUB_RRS" ;;
    esac ;;
esac
`, { mode: 0o755 });
  return bin;
};
const calls = (dir: string) => (fs.existsSync(path.join(dir, "calls.log")) ? fs.readFileSync(path.join(dir, "calls.log"), "utf8") : "");
const withStub = (dir: string, code = 0) => `${stub(dir, code)}:${process.env.PATH}`;
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
      const r = sh(["apply", "d111.cloudfront.net"], { BIO_DNS_SNAPSHOT: snap, PATH: withStub(dir, 99) });
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/no snapshot at|invalid or already/);
      expect(calls(dir)).toBe("");
    }
    expect(sh(["apply", "d111.cloudfront.net"], { BIO_DNS_SNAPSHOT: path.join(dir, "missing.json") }).stderr).toContain("no snapshot at");
  });
  it("snapshot refuses to overwrite without --force and leaves the file unchanged", () => {
    const dir = tmp();
    const snap = path.join(dir, "snap.json");
    fs.writeFileSync(snap, "KEEP");
    const r = sh(["snapshot"], { BIO_DNS_SNAPSHOT: snap, PATH: withStub(dir) });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(snap);
    expect(fs.readFileSync(snap, "utf8")).toBe("KEEP");
  });
  it("snapshot leaves an existing file byte-identical and no temp file when record listing fails", () => {
    const dir = tmp();
    const snapDir = path.join(dir, "state");
    fs.mkdirSync(snapDir);
    const snap = path.join(snapDir, "snap.json");
    fs.writeFileSync(snap, "KEEP");
    const r = sh(["snapshot", "--force"], { BIO_DNS_SNAPSHOT: snap, STUB_FAIL_RRS: "1", PATH: withStub(dir) });
    expect(r.status).not.toBe(0);
    expect(calls(dir)).toContain("list-resource-record-sets");
    expect(fs.readFileSync(snap, "utf8")).toBe("KEEP");
    expect(fs.readdirSync(snapDir)).toEqual(["snap.json"]);
  });
  it("snapshot --force refuses when the live apex is already a CloudFront alias", () => {
    const dir = tmp();
    const snap = path.join(dir, "snap.json");
    fs.writeFileSync(snap, "KEEP");
    const rrs = path.join(dir, "rrs.json");
    fs.writeFileSync(rrs, JSON.stringify([
      { Name: "danielhodeta.com.", Type: "A", AliasTarget: { HostedZoneId: "Z2FDTNDATAQYW2", DNSName: "d1.cloudfront.net." } },
      { Name: "www.danielhodeta.com.", Type: "CNAME", TTL: 300, ResourceRecords: [{ Value: "d1.cloudfront.net" }] },
    ]));
    const r = sh(["snapshot", "--force"], { BIO_DNS_SNAPSHOT: snap, STUB_RRS: rrs, PATH: withStub(dir) });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("already cut over");
    expect(fs.readFileSync(snap, "utf8")).toBe("KEEP");
  });
  describe("live rollback (stub aws)", () => {
    const cfAlias = { HostedZoneId: "Z2FDTNDATAQYW2", DNSName: "d1.cloudfront.net.", EvaluateTargetHealth: false };
    const live = (env: Record<string, string>) => {
      const dir = tmp();
      const r = sh(["rollback"], { PATH: withStub(dir), ...env });
      const batchFile = path.join(dir, "batch.json");
      const actions = fs.existsSync(batchFile) ? (JSON.parse(fs.readFileSync(batchFile, "utf8")).Changes as Array<{ Action: string }>).map((c) => c.Action) : null;
      return { r, dir, actions };
    };
    it("aborts without submitting when the apex is not cut over", () => {
      const { r, dir } = live({ STUB_A_ZONE: "None", STUB_AAAA: "null" });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("not cut over");
      expect(calls(dir)).not.toContain("change-resource-record-sets");
    });
    it("does not delete a non-alias AAAA", () => {
      const aaaa = JSON.stringify({ Name: "danielhodeta.com.", Type: "AAAA", TTL: 300, ResourceRecords: [{ Value: "2001:db8::1" }] });
      const { r, actions } = live({ STUB_A_ZONE: "Z2FDTNDATAQYW2", STUB_AAAA: aaaa });
      expect(r.status, r.stderr).toBe(0);
      expect(actions).toEqual(["UPSERT", "UPSERT"]);
    });
    it("deletes the CloudFront alias AAAA", () => {
      const aaaa = JSON.stringify({ Name: "danielhodeta.com.", Type: "AAAA", AliasTarget: cfAlias });
      const { r, actions } = live({ STUB_A_ZONE: "Z2FDTNDATAQYW2", STUB_AAAA: aaaa });
      expect(r.status, r.stderr).toBe(0);
      expect(actions).toEqual(["UPSERT", "DELETE", "UPSERT"]);
    });
  });
  it("rejects flags and arguments that do not apply to the subcommand", () => {
    expect(sh(["snapshot", "--print"]).status).toBe(2);
    expect(sh(["apply", "--force", "d1.cloudfront.net"]).status).toBe(2);
    expect(sh(["snapshot", "d1.cloudfront.net"]).status).toBe(2);
    expect(sh(["preflight", "--print"]).status).toBe(2);
  });
  it("snapshot saves valid pre-cutover records via a stubbed aws", () => {
    const dir = tmp();
    const snap = path.join(dir, "sub", "snap.json");
    const r = sh(["snapshot"], { BIO_DNS_SNAPSHOT: snap, STUB_RRS: snapshot, PATH: withStub(dir) });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain(snap);
    expect(JSON.parse(fs.readFileSync(snap, "utf8"))).toHaveLength(2);
  });
  describe("prepare (stub aws)", () => {
    const wwwApex = { Name: "www.danielhodeta.com.", Type: "CNAME", TTL: 300, ResourceRecords: [{ Value: "danielhodeta.com." }] };
    it("prepare --print: one batch repointing www CNAME to the apex", () => {
      const b = run("prepare", "--print");
      expect(b.Changes).toEqual([{ Action: "UPSERT", ResourceRecordSet: { Name: "www.danielhodeta.com.", Type: "CNAME", TTL: 300, ResourceRecords: [{ Value: "danielhodeta.com" }] } }]);
    });
    it("prepare --undo --print: one batch restoring the snapshot www CNAME", () => {
      const b = run("prepare", "--undo", "--print");
      expect(b.Changes).toEqual([{ Action: "UPSERT", ResourceRecordSet: { Name: "www.danielhodeta.com.", Type: "CNAME", TTL: 300, ResourceRecords: [{ Value: "old.example.net" }] } }]);
    });
    it("prepare with no snapshot exits 1 before any aws call", () => {
      const dir = tmp();
      const r = sh(["prepare"], { BIO_DNS_SNAPSHOT: path.join(dir, "missing.json"), PATH: withStub(dir, 99) });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("no snapshot at");
      expect(calls(dir)).toBe("");
    });
    it("live prepare submits one batch", () => {
      const dir = tmp();
      const r = sh(["prepare"], { PATH: withStub(dir) });
      expect(r.status, r.stderr).toBe(0);
      expect(JSON.parse(fs.readFileSync(path.join(dir, "batch.json"), "utf8")).Changes).toHaveLength(1);
    });
    it("live prepare --undo is refused when the apex is a CloudFront alias", () => {
      const dir = tmp();
      const r = sh(["prepare", "--undo"], { STUB_A_ZONE: "Z2FDTNDATAQYW2", PATH: withStub(dir) });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("apex is cut over; use rollback");
      expect(calls(dir)).not.toContain("change-resource-record-sets");
    });
    it("live prepare --undo restores when the apex is not cut over", () => {
      const dir = tmp();
      const r = sh(["prepare", "--undo"], { STUB_A_ZONE: "None", PATH: withStub(dir) });
      expect(r.status, r.stderr).toBe(0);
      expect(JSON.parse(fs.readFileSync(path.join(dir, "batch.json"), "utf8")).Changes[0].ResourceRecordSet.ResourceRecords).toEqual([{ Value: "old.example.net" }]);
    });
    it("snapshot refuses when www already points at the apex", () => {
      for (const value of ["danielhodeta.com", "danielhodeta.com."]) {
        const dir = tmp();
        const snap = path.join(dir, "snap.json");
        const rrs = path.join(dir, "rrs.json");
        fs.writeFileSync(rrs, JSON.stringify([{ Name: "danielhodeta.com.", Type: "A", TTL: 300, ResourceRecords: [{ Value: "192.0.2.10" }] }, { ...wwwApex, ResourceRecords: [{ Value: value }] }]));
        const r = sh(["snapshot"], { BIO_DNS_SNAPSHOT: snap, STUB_RRS: rrs, PATH: withStub(dir) });
        expect(r.status).toBe(1);
        expect(r.stderr).toContain("www already points at the apex");
        expect(fs.existsSync(snap)).toBe(false);
      }
    });
    it("validates flags for prepare", () => {
      expect(sh(["prepare", "d1.cloudfront.net"]).status).toBe(2);
      expect(sh(["prepare", "--force"]).status).toBe(2);
      expect(sh(["apply", "--undo", "d1.cloudfront.net"]).status).toBe(2);
    });
  });
  it("is valid bash", () => {
    expect(spawnSync("bash", ["-n", script]).status).toBe(0);
  });
});
