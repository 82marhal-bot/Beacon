# Tutorial

## Vad appen är

*Viral Panic* är ett enkelt API som simulerar en tjänst som plötsligt kan få en kraftig trafikökning. Tanken är att appen ska representera en liten webbtjänst som på kort tid blir mer belastad än vanligt, till exempel efter att en kampanj, nyhet eller länk sprids snabbt.

Applikationen är medvetet enkel. Den innehåller några få endpoints som kan användas för att kontrollera att tjänsten är igång, hämta grundläggande information och simulera ett “panikläge”. Syftet är inte att bygga avancerad applikationslogik, utan att ha en tydlig och testbar tjänst som kan driftsättas till Azure App Service.

Projektets fokus ligger därför på driftsättning, skalbarhet och molninfrastruktur. Genom att hålla själva API:t enkelt blir det lättare att undersöka hur applikationen beter sig när den körs i molnet, hur flera instanser kan användas för lastbalansering och hur olika prisnivåer påverkar arkitekturvalet.

## Så kör du den lokalt

Projektet kräver .NET 10 SDK.
Kommandona i detta kapitel är skrivna för Bash.

### Bygg lösningen

```bash
dotnet build
```
### Kör tester

```bash
dotnet test
```
### Starta applikationen

```bash
dotnet run --project src/Beacon.Api
```

Applikationen är då tillgänglig på:
- http://localhost:5001/
- http://localhost:5001/health
- http://localhost:5001/info
- http://localhost:5001/panic

### För att köra med HTTPS-profilen

```bash
dotnet run --project src/Beacon.Api --launch-profile https
```

Applikationen lyssnar då även på `https://localhost:7001`.

## Driftsättning till App Service

Kommandona i detta kapitel är skrivna för Bash.

### Skapa resursgrupp

```bash
az group create \
  --name rg-clo25-martina \
  --location westeurope
  ```

### Skapa App Service-plan

```bash
az appservice plan create \
  --name asp-clo25-martina \
  --resource-group rg-clo25-martina \
  --location westeurope \
  --sku B1 \
  --is-linux
  ```

### Skapa Web App

```bash
az webapp create \
  --name app-clo25-martina \
  --resource-group rg-clo25-martina \
  --plan asp-clo25-martina \
  --runtime "DOTNETCORE:10.0"
  ```

### Skala ut till 2 instanser

```bash
az appservice plan update \
  --name app-clo25-martina \
  --resource-group rg-clo25-martina \
  --number-of-workers 2
  ```


### Innan driftsättning

az webapp deploy vill ha en .zip-fil, så att appen ska byggas och packas innan den skickas upp. Denna packning görs i projektfilen Beacon.Api.csproj. Om det inte redan finns i projektfilen, lägg till detta före </Project>:

  <!-- Packar publiceringen till app.zip, bredvid publiceringsmappen -->
  ```xml
  <Target Name="ZipPublishOutput" AfterTargets="Publish">
    <ZipDirectory SourceDirectory="$(PublishDir)"
                  DestinationFile="$(PublishDir)../app.zip"
                  Overwrite="true" />
  </Target>
  ```

**Kör sedan kommandot i terminalen:**

```bash
dotnet publish src/Beacon.Api --configuration Release --output artifacts/publish
```

### Driftsätt webapp

```bash
az webapp deploy \
  --resource-group rg-clo25-martina \
  --name app-clo25-martina \
  --src-path artifacts/app.zip \
  --type zip
  ```

### Tester att göra efter driftsättning

**Kör:**
```bash
curl https://app-clo25-martina.azurewebsites.net/health
```

och 

```bash
curl https://app-clo25-martina.azurewebsites.net/panic
```

## Beslut jag tagit

### Val av app-idé

Jag valde att bygga Viral Panic eftersom idén med en tjänst som plötsligt går viral passar bra ihop med uppgiftens fokus på skalbarhet och lastbalansering. Det ger mig också möjlighet att på ett enkelt och lite roligare sätt demonstrera vad som händer när applikationen behöver hantera en trafikspik.

### Val av tier

Jag övervägde både B1 och P1v3. P1v3 ger tillgång till funktioner som autoscale, deployment slots och VNet-integration, men för Viral Panic valde jag i det här steget flera B1-instanser eftersom syftet främst är att demonstrera lastbalansering och tillgänglighet till lägre kostnad. Med tre B1-instanser finns redundans på instansnivå, vilket innebär att applikationen fortfarande har tillgängliga instanser som kan hantera trafik om en eller två instanser blir otillgängliga.

Jag valde dock att skala ut App Service-planen till två B1-instanser som grundläge. Det ger bättre tillgänglighet än en ensam instans, eftersom applikationen fortfarande kan hantera trafik om en instans blir otillgänglig. Tre instanser kan vara ett rimligt nästa steg vid högre belastning, men i detta skede bedömde jag att två instanser gav en bättre balans mellan kostnad och redundans.

## Driftincident

- **001 – Fel tenant-ID:** Azure CLI var sedan ett tidigare skolprojekt autentiserat mot en annan Microsoft Entra-tenant. Det gjorde att min Azure-subscription inte hittades. Problemet löstes genom att logga in mot rätt tenant med `az login --tenant <tenant-id>`.


## Prisjämförelse

Prisjämförelsen gjordes för Sweden Central, medan resurserna i laborationen driftsattes i West Europe. Detta på grund av att Sweden Central hade varit det mest logiska att välja eftersom vi bor i Sverige, men i praktiken gick detta inte att välja när jag skulle bygga min App Service och jag valde därför att bygga den i West Europe istället. 

| Tier | Instanser | Region | OS | Kostnad/månad |
|---|---:|---|---|---:|
| Basic B1 | 1 | Sweden Central | Linux | 13.14 USD |
| Basic B1 | 3 | Sweden Central | Linux | 39.42 USD |
| Basic B3 | 1 | Sweden Central | Linux | 51.83 USD |
| Basic B3 | 3 | Sweden Central | Linux | 155.49 USD |
| Premium V3 | 1 | Sweden Central | Linux | 64.97 USD |
| Container Registry Basic | 1 | — | — | 5.00 USD |

*Priserna kontrollerades i augusti 2026 och används som uppskattningar för arkitekturjämförelsen*

Tre B1-instanser kostade vid jämförelsetillfället cirka 39.42 USD/månad, jämfört med 64.97 USD/månad för en P1v3-instans. För Viral Panic prioriterade jag i detta skede flera instanser eftersom de gör det möjligt att demonstrera lastbalansering och redundans, medan funktionerna i Premium V3 inte var nödvändiga för den här delen av lösningen.