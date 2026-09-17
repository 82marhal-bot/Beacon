using './container.bicep'

param registryName = 'acrclo25martina'
param environmentName = 'cae-clo25-martina'
param containerAppName = 'ca-clo25-martina'
param containerImage = 'acrclo25martina.azurecr.io/beacon:v1'
param minReplicas = 1
param maxReplicas = 5


