#!/usr/bin/env bash
# Switches danielhodeta.com + www between the previous host and the prod CloudFront
# distribution in ONE Route53 change batch (atomic: no moment without a record).
#   cutover-dns.sh preflight
#   cutover-dns.sh snapshot [--force]             # saves current apex A + www CNAME
#   cutover-dns.sh apply    [--print] <dist-domain>
#   cutover-dns.sh rollback [--print] [<dist-domain>]   # dist-domain required only with --print
# Needs: aws CLI with Route53 rights (AWS_PROFILE), python3. --print renders the batch
# and exits without calling AWS. The prod stack deliberately does not own these records.
# Snapshot lives outside the repo: ${XDG_STATE_HOME:-~/.local/state}/bio/dns-snapshot.json
# (override with BIO_DNS_SNAPSHOT).
set -euo pipefail
APEX="danielhodeta.com."
WWW="www.danielhodeta.com."
SNAP="${BIO_DNS_SNAPSHOT:-${XDG_STATE_HOME:-$HOME/.local/state}/bio/dns-snapshot.json}"

die() { echo "$1" >&2; exit "${2:-1}"; }
usage() { die "usage: $0 {preflight|snapshot [--force]|apply [--print] <dist-domain>|rollback [--print] [<dist-domain>]}" 2; }

cmd="${1:-}"; [[ $# -gt 0 ]] && shift
print=false; force=false; dist=""
for a in "$@"; do
  case "$a" in
    --print) print=true ;;
    --force) force=true ;;
    -*) usage ;;
    *) [[ -z "$dist" ]] || usage; dist="$a" ;;
  esac
done
if [[ -n "$dist" ]]; then
  [[ "$dist" =~ ^d[a-z0-9]+\.cloudfront\.net\.?$ ]] || die "invalid CloudFront domain: $dist" 2
fi

zone_id() {
  local z
  z="$(aws route53 list-hosted-zones-by-name --dns-name "$APEX" --max-items 1 \
    --query "HostedZones[?Name=='$APEX' && Config.PrivateZone==\`false\`].Id | [0]" --output text | sed 's#/hostedzone/##')"
  if [[ -z "$z" || "$z" == "None" || "$z" == "null" ]]; then
    echo "no public hosted zone found for $APEX" >&2; return 1
  fi
  echo "$z"
}

# exit 0 = usable pre-cutover snapshot; 3 = apex A already a CloudFront alias; 1 = invalid
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
PY
}

require_snapshot() {
  [[ -f "$SNAP" ]] || die "no snapshot at $SNAP - run 'snapshot' before 'apply'"
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
    if aaaa:
        changes.append({"Action": "DELETE", "ResourceRecordSet": aaaa})
else:
    alias = {"HostedZoneId": "Z2FDTNDATAQYW2", "DNSName": d + ".", "EvaluateTargetHealth": False}
    changes.append({"Action": "DELETE", "ResourceRecordSet": {"Name": "danielhodeta.com.", "Type": "AAAA", "AliasTarget": alias}})
changes.append({"Action": "UPSERT", "ResourceRecordSet": cname})
print(json.dumps({"Comment": "bio rollback to previous host", "Changes": changes}))
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
    z="$(zone_id)" || exit 1
    aws route53 list-resource-record-sets --hosted-zone-id "$z" \
      --query "ResourceRecordSets[?Name=='$APEX' || Name=='$WWW'].[Name,Type,TTL,ResourceRecords[0].Value,AliasTarget.DNSName]" --output table
    caa="$(aws route53 list-resource-record-sets --hosted-zone-id "$z" --query "ResourceRecordSets[?Name=='$APEX' && Type=='CAA'].ResourceRecords[].Value" --output text)"
    if [[ -n "$caa" ]] && ! printf '%s\n' "$caa" | tr '\t' '\n' | grep -Eq '^[0-9]+ issue "(amazon\.com|amazontrust\.com)[";]'; then
      die "FAIL: CAA on $APEX has no 'issue' entry for Amazon ($caa) - ACM cannot issue the certificate"
    fi
    aaaa="$(aws route53 list-resource-record-sets --hosted-zone-id "$z" --query "ResourceRecordSets[?Name=='$APEX' && Type=='AAAA' && !AliasTarget].Name" --output text)"
    [[ -z "$aaaa" ]] || echo "WARN: $APEX has a non-alias AAAA record; rollback will not restore it" >&2
    wwwaddr="$(aws route53 list-resource-record-sets --hosted-zone-id "$z" --query "ResourceRecordSets[?Name=='$WWW' && (Type=='A' || Type=='AAAA')].Type" --output text)"
    [[ -z "$wwwaddr" ]] || echo "WARN: $WWW is not a CNAME (has $wwwaddr); apply would fail atomically" >&2
    echo "preflight ok" ;;
  snapshot)
    [[ -z "$dist" ]] || usage
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
    [[ $rc -eq 0 ]] || die "live records are not an apex A + www CNAME pair - not saving a snapshot"
    mv "$tmp" "$SNAP"
    echo "saved $SNAP" ;;
  apply)
    [[ -n "$dist" ]] || usage
    if $print; then apply_batch "$dist"; else
      require_snapshot
      z="$(zone_id)" || exit 1
      batch="$(apply_batch "$dist")" || die "failed to build change batch"
      [[ -n "$batch" ]] || die "empty change batch"
      submit "$z" "$batch"
    fi ;;
  rollback)
    require_snapshot
    if $print; then
      [[ -n "$dist" ]] || die "rollback --print needs <dist-domain>" 2
      batch="$(rollback_batch "$SNAP" "$dist" "")" || die "failed to build change batch"
      [[ -n "$batch" ]] || die "empty change batch"
      echo "$batch"
    else
      z="$(zone_id)" || exit 1
      live="$(aws route53 list-resource-record-sets --hosted-zone-id "$z" \
        --query "ResourceRecordSets[?Name=='$APEX' && Type=='AAAA'] | [0]" --output json)"
      [[ -n "$live" ]] || die "could not read live AAAA record"
      batch="$(rollback_batch "$SNAP" "" "$live")" || die "failed to build change batch"
      [[ -n "$batch" ]] || die "empty change batch"
      submit "$z" "$batch"
    fi ;;
  *) usage ;;
esac
