#!/usr/bin/env bash
# Switches danielhodeta.com + www between the previous host and the prod CloudFront
# distribution in ONE Route53 change batch (atomic: no moment without a record).
#   cutover-dns.sh preflight
#   cutover-dns.sh snapshot [--force]             # saves current apex A + www CNAME
#   cutover-dns.sh prepare  [--print] [--undo]    # before the prod deploy: www CNAME -> apex (undo restores snapshot)
#   cutover-dns.sh apply    [--print] <dist-domain>
#   cutover-dns.sh rollback [--print] [<dist-domain>]   # dist-domain required only with --print
# Needs: aws CLI with Route53 + CloudFront read rights (AWS_PROFILE), python3, dig (preflight). --print renders the batch
# and exits without calling AWS. The prod stack deliberately does not own these records.
# Snapshot lives outside the repo: ${XDG_STATE_HOME:-~/.local/state}/bio/dns-snapshot.json
# (override with BIO_DNS_SNAPSHOT).
set -euo pipefail
APEX="danielhodeta.com."
WWW="www.danielhodeta.com."
SNAP="${BIO_DNS_SNAPSHOT:-${XDG_STATE_HOME:-$HOME/.local/state}/bio/dns-snapshot.json}"

die() { echo "$1" >&2; exit "${2:-1}"; }
usage() { die "usage: $0 {preflight|snapshot [--force]|prepare [--print] [--undo]|apply [--print] <dist-domain>|rollback [--print] [<dist-domain>]}" 2; }

cmd="${1:-}"; [[ $# -gt 0 ]] && shift
print=false; force=false; undo=false; dist=""
for a in "$@"; do
  case "$a" in
    --print) print=true ;;
    --force) force=true ;;
    --undo) undo=true ;;
    -*) usage ;;
    *) [[ -z "$dist" ]] || usage; dist="$a" ;;
  esac
done
case "$cmd" in
  preflight) { ! $print && ! $force && ! $undo && [[ -z "$dist" ]]; } || usage ;;
  snapshot) { ! $print && ! $undo && [[ -z "$dist" ]]; } || usage ;;
  prepare) { ! $force && [[ -z "$dist" ]]; } || usage ;;
  apply) { ! $force && ! $undo; } || usage ;;
  rollback) { ! $force && ! $undo && { $print || [[ -z "$dist" ]]; }; } || usage ;;
esac
if [[ -n "$dist" ]]; then
  [[ "$dist" =~ ^d[a-z0-9]+\.cloudfront\.net\.?$ ]] || die "invalid CloudFront domain: $dist" 2
fi

zone_id() {
  local z
  z="$(aws route53 list-hosted-zones-by-name --dns-name "$APEX" \
    --query "HostedZones[?Name=='$APEX' && Config.PrivateZone==\`false\`].Id | [0]" --output text | sed 's#/hostedzone/##')"
  if [[ -z "$z" || "$z" == "None" || "$z" == "null" ]]; then
    echo "no public hosted zone found for $APEX" >&2; return 1
  fi
  echo "$z"
}

# exit 0 = usable pre-cutover snapshot; 3 = apex A already a CloudFront alias;
# 4 = www CNAME already points at the apex; 1 = invalid
check_snapshot() { python3 - "$1" <<'PY'
import json, sys
try:
    snap = json.load(open(sys.argv[1]))
    a = [r for r in snap if r.get("Name") == "danielhodeta.com." and r.get("Type") == "A"]
    c = [r for r in snap if r.get("Name") == "www.danielhodeta.com." and r.get("Type") == "CNAME"]
except Exception:
    sys.exit(1)
if len(a) != 1 or len(c) != 1:
    sys.exit(1)
if a[0].get("AliasTarget", {}).get("HostedZoneId") == "Z2FDTNDATAQYW2":
    sys.exit(3)
if c[0].get("ResourceRecords", [{}])[0].get("Value", "").rstrip(".") == "danielhodeta.com":
    sys.exit(4)
PY
}

require_snapshot() {
  [[ -f "$SNAP" ]] || die "no snapshot at $SNAP$1"
  local rc=0; check_snapshot "$SNAP" || rc=$?
  [[ $rc -eq 0 ]] || die "snapshot at $SNAP is invalid or already a CloudFront cutover - not usable for rollback"
}

apply_batch() { python3 - "$1" <<'PY'
import json, sys
d = sys.argv[1].rstrip(".")
alias = {"HostedZoneId": "Z2FDTNDATAQYW2", "DNSName": d + ".", "EvaluateTargetHealth": False}  # CloudFront's fixed alias zone
print(json.dumps({"Comment": "bio cutover to CloudFront", "Changes": [
  {"Action": "UPSERT", "ResourceRecordSet": {"Name": "danielhodeta.com.", "Type": "A", "AliasTarget": alias}},
  {"Action": "UPSERT", "ResourceRecordSet": {"Name": "danielhodeta.com.", "Type": "AAAA", "AliasTarget": alias}},
  {"Action": "UPSERT", "ResourceRecordSet": {"Name": "www.danielhodeta.com.", "Type": "CNAME", "TTL": 300, "ResourceRecords": [{"Value": d}]}},
]}))
PY
}

prepare_batch() { python3 - "$1" "$2" <<'PY'
import json, sys
if sys.argv[2] == "undo":
    cname = [r for r in json.load(open(sys.argv[1])) if r["Name"] == "www.danielhodeta.com." and r["Type"] == "CNAME"][0]
    comment = "bio prepare undo: restore www CNAME"
else:
    cname = {"Name": "www.danielhodeta.com.", "Type": "CNAME", "TTL": 300, "ResourceRecords": [{"Value": "danielhodeta.com"}]}
    comment = "bio prepare: www CNAME to apex"
print(json.dumps({"Comment": comment, "Changes": [{"Action": "UPSERT", "ResourceRecordSet": cname}]}))
PY
}

# args: snapshot, dist-domain (print mode) or "", live AAAA record json or ""
rollback_batch() { python3 - "$1" "$2" "$3" <<'PY'
import json, sys
snap = json.load(open(sys.argv[1]))
d, live = sys.argv[2].rstrip("."), sys.argv[3]
by = {(r["Name"], r["Type"]): r for r in snap}
a, cname = by[("danielhodeta.com.", "A")], by[("www.danielhodeta.com.", "CNAME")]
changes = [{"Action": "UPSERT", "ResourceRecordSet": a}]
if live:
    aaaa = json.loads(live)
    if aaaa and aaaa.get("AliasTarget", {}).get("HostedZoneId") == "Z2FDTNDATAQYW2":
        changes.append({"Action": "DELETE", "ResourceRecordSet": aaaa})
else:
    alias = {"HostedZoneId": "Z2FDTNDATAQYW2", "DNSName": d + ".", "EvaluateTargetHealth": False}
    changes.append({"Action": "DELETE", "ResourceRecordSet": {"Name": "danielhodeta.com.", "Type": "AAAA", "AliasTarget": alias}})
changes.append({"Action": "UPSERT", "ResourceRecordSet": cname})
print(json.dumps({"Comment": "bio rollback to previous host", "Changes": changes}))
PY
}

# Effective CAA as seen by public resolvers (follows CNAMEs): FAIL if issue entries exist but none allow Amazon.
# args: name (no trailing dot), failure hint
check_effective_caa() {
  local out issue
  out="$(dig +short CAA "$1")" || die "dig failed for CAA $1"
  issue="$(printf '%s\n' "$out" | grep -E '^[0-9]+ issue "' || true)"
  if [[ -n "$issue" ]] && ! grep -Eq '"(amazon\.com|amazontrust\.com|awstrust\.com|amazonaws\.com)[";]' <<<"$issue"; then
    die "FAIL: effective CAA for $1 has no 'issue' entry for Amazon ($(tr '\n' ' ' <<<"$issue"))- ACM cannot issue the certificate$2"
  fi
}

# args: dist-domain. Exactly one distribution with this DomainName, Deployed, aliased for apex and www.
verify_distribution() {
  local listing
  listing="$(aws cloudfront list-distributions \
    --query 'DistributionList.Items[].{DomainName:DomainName,Status:Status,Aliases:Aliases.Items}' --output json)" \
    || die "could not list CloudFront distributions"
  python3 - "$1" "$listing" <<'PY' || exit 1
import json, sys
d = sys.argv[1].rstrip(".")
items = json.loads(sys.argv[2] or "null") or []
m = [i for i in items if i.get("DomainName") == d]
if len(m) != 1:
    sys.exit("expected exactly one distribution with domain %s, found %d" % (d, len(m)))
i = m[0]
if i.get("Status") != "Deployed":
    sys.exit("distribution %s is %s, not Deployed" % (d, i.get("Status")))
missing = [a for a in ("danielhodeta.com", "www.danielhodeta.com") if a not in (i.get("Aliases") or [])]
if missing:
    sys.exit("distribution %s lacks aliases: %s" % (d, ", ".join(missing)))
PY
}

submit() { # args: zone-id, batch
  local id
  id="$(aws route53 change-resource-record-sets --hosted-zone-id "$1" --change-batch "$2" --query ChangeInfo.Id --output text)"
  echo "submitted $id; waiting for INSYNC..."
  aws route53 wait resource-record-sets-changed --id "$id"
  echo "INSYNC"
}

case "$cmd" in
  preflight)
    command -v dig >/dev/null || die "dig is required for the effective CAA check (install dnsutils / bind-utils)"
    z="$(zone_id)" || exit 1
    aws route53 list-resource-record-sets --hosted-zone-id "$z" \
      --query "ResourceRecordSets[?Name=='$APEX' || Name=='$WWW'].[Name,Type,TTL,ResourceRecords[0].Value,AliasTarget.DNSName]" --output table
    caa="$(aws route53 list-resource-record-sets --hosted-zone-id "$z" --query "ResourceRecordSets[?Name=='$APEX' && Type=='CAA'].ResourceRecords[].Value" --output text)"
    issue="$(printf '%s\n' "$caa" | tr '\t' '\n' | grep -E '^[0-9]+ issue "' || true)"
    if [[ -n "$issue" ]] && ! grep -Eq '"(amazon\.com|amazontrust\.com|awstrust\.com|amazonaws\.com)[";]' <<<"$issue"; then
      die "FAIL: CAA on $APEX has no 'issue' entry for Amazon ($caa) - ACM cannot issue the certificate"
    fi
    aaaa="$(aws route53 list-resource-record-sets --hosted-zone-id "$z" --query "ResourceRecordSets[?Name=='$APEX' && Type=='AAAA' && !AliasTarget].Name" --output text)"
    [[ -z "$aaaa" ]] || echo "WARN: $APEX has a non-alias AAAA record; rollback will not restore it" >&2
    wwwaddr="$(aws route53 list-resource-record-sets --hosted-zone-id "$z" --query "ResourceRecordSets[?Name=='$WWW' && Type!='CNAME'].Type" --output text)"
    [[ -z "$wwwaddr" ]] || echo "WARN: $WWW has non-CNAME records ($wwwaddr); apply would fail atomically" >&2
    check_effective_caa "${APEX%.}" ""
    check_effective_caa "${WWW%.}" " - run 'cutover-dns.sh prepare' and wait at least 300 s (TTL) before the prod deploy"
    echo "preflight ok" ;;
  snapshot)
    if [[ -e "$SNAP" && "$force" != true ]]; then
      die "snapshot already exists at $SNAP - refusing to overwrite (use --force to replace)"
    fi
    z="$(zone_id)" || exit 1
    mkdir -p "$(dirname "$SNAP")"
    tmp="$(mktemp "$(dirname "$SNAP")/.dns-snapshot.XXXXXX")"
    trap 'rm -f "$tmp"' EXIT
    aws route53 list-resource-record-sets --hosted-zone-id "$z" \
      --query "ResourceRecordSets[?(Name=='$APEX' && Type=='A') || (Name=='$WWW' && Type=='CNAME')]" --output json > "$tmp"
    rc=0; check_snapshot "$tmp" || rc=$?
    [[ $rc -ne 3 ]] || die "apex A is already a CloudFront alias - already cut over; keep the existing snapshot"
    [[ $rc -ne 4 ]] || die "www already points at the apex - keep the existing snapshot"
    [[ $rc -eq 0 ]] || die "live records are not an apex A + www CNAME pair - not saving a snapshot"
    mv "$tmp" "$SNAP"
    echo "saved $SNAP" ;;
  prepare)
    require_snapshot " - run 'snapshot' before 'prepare'"
    mode=do; $undo && mode=undo
    batch="$(prepare_batch "$SNAP" "$mode")" || die "failed to build change batch"
    [[ -n "$batch" ]] || die "empty change batch"
    if $print; then echo "$batch"; else
      z="$(zone_id)" || exit 1
      if $undo; then
        apexzone="$(aws route53 list-resource-record-sets --hosted-zone-id "$z" \
          --query "ResourceRecordSets[?Name=='$APEX' && Type=='A'] | [0].AliasTarget.HostedZoneId" --output text)"
        [[ "$apexzone" != "Z2FDTNDATAQYW2" ]] || die "apex is cut over; use rollback"
      fi
      submit "$z" "$batch"
    fi ;;
  apply)
    [[ -n "$dist" ]] || usage
    if $print; then apply_batch "$dist"; else
      require_snapshot " - run 'snapshot' before 'apply'"
      verify_distribution "$dist"
      z="$(zone_id)" || exit 1
      batch="$(apply_batch "$dist")" || die "failed to build change batch"
      [[ -n "$batch" ]] || die "empty change batch"
      submit "$z" "$batch"
    fi ;;
  rollback)
    require_snapshot ""
    if $print; then
      [[ -n "$dist" ]] || die "rollback --print needs <dist-domain>" 2
      batch="$(rollback_batch "$SNAP" "$dist" "")" || die "failed to build change batch"
      [[ -n "$batch" ]] || die "empty change batch"
      echo "$batch"
    else
      z="$(zone_id)" || exit 1
      apexzone="$(aws route53 list-resource-record-sets --hosted-zone-id "$z" \
        --query "ResourceRecordSets[?Name=='$APEX' && Type=='A'] | [0].AliasTarget.HostedZoneId" --output text)"
      [[ "$apexzone" == "Z2FDTNDATAQYW2" ]] || die "apex is not cut over; nothing to roll back"
      live="$(aws route53 list-resource-record-sets --hosted-zone-id "$z" \
        --query "ResourceRecordSets[?Name=='$APEX' && Type=='AAAA'] | [0]" --output json)"
      [[ -n "$live" ]] || die "could not read live AAAA record"
      batch="$(rollback_batch "$SNAP" "" "$live")" || die "failed to build change batch"
      [[ -n "$batch" ]] || die "empty change batch"
      submit "$z" "$batch"
    fi ;;
  *) usage ;;
esac
