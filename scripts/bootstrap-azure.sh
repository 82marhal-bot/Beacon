#!/usr/bin/env bash
# Bootstraps Azure after a full teardown.
# Creates the resource group if needed and restores the RG-scoped
# Contributor role used by the GitHub Actions OIDC identity.
#
# Run locally while signed in with Azure CLI.
#
# Usage:
#   ./scripts/bootstrap-azure.sh <resource-group>

set -euo pipefail

RESOURCE_GROUP="${1:?Provide the resource group as the first argument}"
LOCATION="${LOCATION:-westeurope}"

# GitHub Actions OIDC identity.
AZURE_CLIENT_ID="1ef9ae43-39b6-4c73-bc21-2f84676424d8"

echo "== Azure bootstrap =="

SUBSCRIPTION_ID=$(az account show --query id --output tsv)

echo "Subscription: $SUBSCRIPTION_ID"
echo "Resource group: $RESOURCE_GROUP"
echo "Location: $LOCATION"

echo
echo "== 1/2 Resource group =="

if [ "$(az group exists --name "$RESOURCE_GROUP")" = "false" ]; then
  az group create \
    --name "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --output none

  echo "Created resource group."
else
  echo "Resource group already exists."
fi

echo
echo "== 2/2 GitHub Actions OIDC role =="

SCOPE="/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP"

ROLE_EXISTS=$(az role assignment list \
  --resource-group "$RESOURCE_GROUP" \
  --assignee "$AZURE_CLIENT_ID" \
  --role Contributor \
  --query "length(@)" \
  --output tsv)

if [ "$ROLE_EXISTS" = "0" ]; then
  MSYS_NO_PATHCONV=1 az role assignment create \
    --assignee-object-id "$AZURE_OBJECT_ID" \
    --assignee-principal-type ServicePrincipal \
    --role Contributor \
    --scope "$SCOPE" \
    --output none

  echo "Created Contributor role assignment."
else
  echo "Contributor role assignment already exists."
fi
echo
echo "Azure bootstrap complete."