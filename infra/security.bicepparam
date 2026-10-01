using './security.bicep'

param vaultName = 'kv-clo25-martina'
param appName = 'app-clo25-martina'
param deployerObjectId = 'ditt-objectid-fran-steg-2'

// The secret is read from an environment variable at deploy time.
// The deploy stops with BCP427 if the variable has not been set.
param secretValue = readEnvironmentVariable('SECRET_VALUE')
