#!/usr/bin/env bash

# Avbryt scriptet om något går fel.
set -euo pipefail

# Argument som skickas in när scriptet körs.
APP_NAME="${1:-}"
RESOURCE_GROUP="${2:-}"

PROFILE_FILE="publish-profile.xml"
SECRET_NAME="AZURE_WEBAPP_PUBLISH_PROFILE"

# Kontrollera att båda argumenten finns.
if [[ -z "$APP_NAME" || -z "$RESOURCE_GROUP" ]]; then
  echo "Usage: $0 <app-name> <resource-group>"
  exit 1
fi

# Radera publish-profilen när scriptet avslutas,
# även om något kommando misslyckas.
cleanup() {
  rm -f "$PROFILE_FILE"
}

trap cleanup EXIT

echo "Hämtar publish profile för $APP_NAME..."

az webapp deployment list-publishing-profiles \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --xml \
  > "$PROFILE_FILE"

echo "Uppdaterar GitHub secret..."

gh secret set "$SECRET_NAME" < "$PROFILE_FILE"

echo "Klart! GitHub-secreten är uppdaterad."