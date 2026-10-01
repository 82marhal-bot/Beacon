using './security.bicep'

param vaultName = 'kv-clo25-martina'
param appName = 'app-clo25-martina'
param deployerObjectId = '55f1207d-e3b5-4c64-b019-2f78c1560c7c'

// The secret is read from an environment variable at deploy time.
// The deploy stops with BCP427 if the variable has not been set.
param secretValue = readEnvironmentVariable('SECRET_VALUE')
