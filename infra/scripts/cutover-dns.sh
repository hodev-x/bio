#!/usr/bin/env bash
# Switches danielhodeta.com + www between the previous host and the prod CloudFront
# distribution in ONE Route53 change batch (atomic: no moment without a record).
#   cutover-dns.sh preflight
#   cutover-dns.sh snapshot                       # saves current apex A + www CNAME
#   cutover-dns.sh apply    [--print] <dist-domain>
#   cutover-dns.sh rollback [--print] <dist-domain>
# Needs: aws CLI with Route53 rights (AWS_PROFILE), python3. --print renders the batch
# and exits without calling AWS. The prod stack deliberately does not own these records.
set -euo pipefail
APEX="danielhodeta.com."
WWW="www.danielhodeta.com."
SNAP="${BIO_DNS_SNAPSHOT:-$(cd "$(dirname "$0")" && pwd)/.dns-snapshot.json}"

zone_id() {
  aws route53 list-hosted-zones-by-name --dns-name "$APEX" --max-items 1 \
    --query "HostedZones[?Name=='$APEX'].Id | [0]" --output text | sed 's#/hostedzone/##'
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

rollback_batch() { python3 - "$1" "$SNAP" <<'PY'
import json, sys
d, snap = sys.argv[1].rstrip("."), json.load(open(sys.argv[2]))
by = {(r["Name"], r["Type"]): r for r in snap}
a, cname = by[("danielhodeta.com.", "A")], by[("www.danielhodeta.com.", "CNAME")]
alias = {"HostedZoneId": "Z2FDTNDATAQYW2", "DNSName": d + ".", "EvaluateTargetHealth": False}
print(json.dumps({"Comment": "bio rollback to previous host", "Changes": [
  {"Action": "UPSERT", "ResourceRecordSet": a},
  {"Action": "DELETE", "ResourceRecordSet": {"Name": "danielhodeta.com.", "Type": "AAAA", "AliasTarget": alias}},
  {"Action": "UPSERT", "ResourceRecordSet": cname},
]}))
PY
}

submit() {
  local batch; batch="$(cat)"
  local id; id="$(aws route53 change-resource-record-sets --hosted-zone-id "$(zone_id)" --change-batch "$batch" --query ChangeInfo.Id --output text)"
  echo "submitted $id; waiting for INSYNC..."
  aws route53 wait resource-record-sets-changed --id "$id"
  echo "INSYNC"
}

cmd="${1:-}"; shift || true
print=false; if [[ "${1:-}" == "--print" ]]; then print=true; shift; fi
case "$cmd" in
  preflight)
    z="$(zone_id)"
    aws route53 list-resource-record-sets --hosted-zone-id "$z" \
      --query "ResourceRecordSets[?Name=='$APEX' || Name=='$WWW'].[Name,Type,TTL,ResourceRecords[0].Value,AliasTarget.DNSName]" --output table
    caa="$(aws route53 list-resource-record-sets --hosted-zone-id "$z" --query "ResourceRecordSets[?Name=='$APEX' && Type=='CAA'].ResourceRecords[].Value" --output text)"
    if [[ -n "$caa" && "$caa" != *amazon.com* && "$caa" != *amazontrust.com* ]]; then
      echo "FAIL: CAA on $APEX does not allow Amazon ($caa) - ACM cannot issue the certificate" >&2; exit 1
    fi
    echo "preflight ok" ;;
  snapshot)
    aws route53 list-resource-record-sets --hosted-zone-id "$(zone_id)" \
      --query "ResourceRecordSets[?(Name=='$APEX' && Type=='A') || (Name=='$WWW' && Type=='CNAME')]" --output json > "$SNAP"
    echo "saved $SNAP" ;;
  apply)
    [[ -n "${1:-}" ]] || { echo "usage: $0 apply [--print] <dist-domain>" >&2; exit 2; }
    if $print; then apply_batch "$1"; else
      [[ -f "$SNAP" ]] || { echo "no snapshot at $SNAP - run 'snapshot' before 'apply'" >&2; exit 1; }
      apply_batch "$1" | submit
    fi ;;
  rollback)
    [[ -n "${1:-}" ]] || { echo "usage: $0 rollback [--print] <dist-domain>" >&2; exit 2; }
    [[ -f "$SNAP" ]] || { echo "no snapshot at $SNAP - run 'snapshot' before 'apply'" >&2; exit 1; }
    if $print; then rollback_batch "$1"; else rollback_batch "$1" | submit; fi ;;
  *) echo "usage: $0 {preflight|snapshot|apply|rollback} [--print] [dist-domain]" >&2; exit 2 ;;
esac
