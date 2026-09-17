#!/usr/bin/env bash
# Deletes a resource group and everything in it. There is no undo.
# Run from the repo root.
# Usage: ./scripts/teardown.sh <resource-group>
# Set FORCE=1 to skip the confirmation prompt.

set -euo pipefail

# Read the optional flag first, then drop it, so the arguments below keep their
# positions whether or not it was given.
WHAT_IF=false
if [ "${1:-}" = "--what-if" ]; then
  WHAT_IF=true
  shift
fi

RESOURCE_GROUP="${1:?Provide the resource group as the first argument}"

if [ "$(az group exists --name "$RESOURCE_GROUP")" != "true" ]; then
  echo "Resource group $RESOURCE_GROUP does not exist. Nothing to do."
  exit 0
fi

echo "This will delete everything in $RESOURCE_GROUP:"
az resource list \
  --resource-group "$RESOURCE_GROUP" \
  --query "[].{Name:name, Type:type}" \
  --output table

if [ "${FORCE:-0}" != "1" ]; then
  read -r -p "Type the resource group name to confirm: " CONFIRM
  if [ "$CONFIRM" != "$RESOURCE_GROUP" ]; then
    echo "Names did not match. Nothing was deleted."
    exit 1
  fi
fi

az group delete --name "$RESOURCE_GROUP" --yes --no-wait
echo "Delete started. It runs in the background."
echo "Check with: az group exists --name $RESOURCE_GROUP"