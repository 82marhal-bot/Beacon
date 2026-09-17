# Tutorial

## Vad appen är

*Viral Panic* är ett enkelt API som simulerar en tjänst som plötsligt kan få en kraftig trafikökning. Tanken är att appen ska representera en liten webbtjänst som på kort tid blir mer belastad än vanligt, till exempel efter att en kampanj, nyhet eller länk sprids snabbt.

Applikationen är medvetet enkel. Den innehåller några få endpoints som kan användas för att kontrollera att tjänsten är igång, hämta grundläggande information och simulera ett “panikläge”. Syftet är inte att bygga avancerad applikationslogik, utan att ha en tydlig och testbar tjänst som kan driftsättas till Azure App Service.

Projektets fokus ligger därför på driftsättning, skalbarhet och molninfrastruktur. Genom att hålla själva API:t enkelt blir det lättare att undersöka hur applikationen beter sig när den körs i molnet, hur flera instanser kan användas för lastbalansering och hur olika prisnivåer påverkar arkitekturvalet.

## Så kör du den lokalt

*Kommandona i detta kapitel är skrivna för Bash.*

Projektet kräver .NET 10 SDK, GitHub CLI och Git
För att kontrollera att detta finns skriv in dessa kommandon i terminalen: 

```bash
dotnet --list-sdks
git --version
gh --version
```

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

*Kommandona i detta kapitel är skrivna för Bash.*

Projektet kräver .NET 10 SDK, GitHub CLI och Git
För att kontrollera att detta finns skriv in dessa kommandon i terminalen: 

```bash
dotnet --list-sdks
git --version
gh --version
```

Du behöver även vara inloggad på Azure CLI och ha en aktiv prenumration. Kontrollera att du är inloggad: 

```bash
az account show --output table
```
Om du får ett felmeddelande; Logga in genom: 

```bash
az login
```

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
*Kontrollera att -zip-filen (app.zip) finns innan driftsättning:*

```bash
ls artifacts/
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

### Slå på basic auth

```bash
az resource update \
  --resource-group rg-clo25-martina \
  --namespace Microsoft.Web \
  --resource-type basicPublishingCredentialsPolicies \
  --name scm \
  --parent sites/app-clo25-martina \
  --set properties.allow=true

az webapp deployment list-publishing-profiles \
  --name app-clo25-martina \
  --resource-group rg-clo25-martina \
  --xml > publish-profile.xml

gh secret set AZURE_WEBAPP_PUBLISH_PROFILE < publish-profile.xml
rm publish-profile.xml

```

-----

### Skala ut till 2 instanser

```bash
az appservice plan update \
  --name app-clo25-martina \
  --resource-group rg-clo25-martina \
  --number-of-workers 2
  ```

## Driftsättningsstrategi

Jag använder en automatiserad driftsättningsstrategi med GitHub Actions där applikationen byggs, testas och publiceras innan den driftsätts till Azure App Service. deploy är beroende av att build lyckas, vilket gör att kod som inte går att bygga eller som har misslyckade tester inte driftsätts.
Efter driftsättningen körs även ett health check mot applikationens /health-endpoint för att verifiera att den nya versionen faktiskt är tillgänglig och svarar korrekt.

Strategin passar Viral Panic eftersom applikationen är liten och stateless och därför inte kräver en mer avancerad driftsättningsstrategi i nuläget. En enkel automatiserad deployment ger en tydlig och reproducerbar process samtidigt som risken för manuella fel minskar.

### Först Build sen Deploy

Pipelinen består av två jobs: build och deploy. Först körs build, där koden checkas ut från repot, rätt version av .NET installeras, applikationen byggs och testerna körs. Därefter publiceras applikationen till mappen artifacts/publish, och resultatet laddas upp som en artifact med namnet app.
När build har lyckats startar deploy. Det styrs av raden needs: build, som gör att deployment-jobbet väntar tills build-jobbet är klart och bara fortsätter om det har lyckats. På så sätt deployas inte kod som inte går att bygga eller som har misslyckade tester.

I deploy checkas koden ut igen eftersom jobbet körs separat och behöver tillgång till bland annat health-check.sh. Artifacten från build laddas sedan ner och deployas till Azure App Service med hjälp av publish-profilen som ligger lagrad i GitHub Secrets. Efter deployment körs health-check.sh mot appens /health-endpoint för att verifiera att applikationen faktiskt svarar med HTTP 200.
Ordningen blir alltså: checkout → setup .NET → build → test → publish → upload artifact → download artifact → deploy → health check. Syftet är att verifiera koden innan den driftsätts *(Går koden att bygga och klarar den testerna?)* och sedan även verifiera att den fungerar efter deployment *(Svarar den verkliga appen i Azure?)*.

### Smoke test

Mitt health-check.sh är ett smoke test som körs efter driftsättningen. Scriptet skickar HTTP-anrop till applikationens /health-endpoint och kontrollerar att servern svarar med statuskod 200 OK, vilket betyder att anropet kunde behandlas framgångsrikt. Om appen inte svarar direkt gör scriptet flera försök med fem sekunders mellanrum, eftersom applikationen kan behöva tid att starta efter en driftsättning.

Smoke-testet är värdefullt utöver pipelinens vanliga deployment-status eftersom en lyckad deployment endast visar att driftsättningssteget lyckades. Det garanterar inte att den nya versionen av applikationen faktiskt har startat och kan svara på HTTP-anrop. Health checken verifierar därför den driftsatta applikationen efter deployment. Om /health aldrig svarar med 200 avslutas scriptet med exit-kod 1, vilket gör att steget i pipelinen markeras som misslyckat.

### Autentiering mot Azure

Autentiseringen mot Azure sker med hjälp av en publish profile för App Service. Publish-profilen innehåller känsliga autentiseringsuppgifter och lagras därför som GitHub-secreten AZURE_WEBAPP_PUBLISH_PROFILE. I workflow-filen refereras secreten med ${{ secrets.AZURE_WEBAPP_PUBLISH_PROFILE }} och används av azure/webapps-deploy vid driftsättningen.

Hemligheten ligger inte direkt i koden eftersom kod och workflow-filer versionshanteras och pushas till GitHub. Om autentiseringsuppgifterna hårdkodades skulle de kunna exponeras i repot och dess Git-historik. Genom att separera hemligheter från koden minskar risken att känsliga uppgifter läcker och obehöriga får möjlighet att använda dem för att komma åt eller driftsätta till Azure.

## Beslut jag tagit

### Val av projektnamn

När jag började bygga upp projektet gav jag det namnet som var föreslaget i uppgiften (Beacon). Någon vecka in bestämde jag mig för att kalla projektet för Viral Panic. Jag valde ändå att låta projektnamnet vara Beacon för att minska risken för att förstöra flöden om jag skulle ändra namespaces och annat. Det är ändå inget som syns om någon skulle besöka min applikation. 

### Val av app-idé

Jag valde att bygga Viral Panic eftersom idén med en tjänst som plötsligt går viral passar bra ihop med uppgiftens fokus på skalbarhet och lastbalansering. Det ger mig också möjlighet att på ett enkelt och lite roligare sätt demonstrera vad som händer när applikationen behöver hantera en trafikspik.

### Val av tier

Jag övervägde både B1 och P1v3. P1v3 ger tillgång till funktioner som autoscale, deployment slots och VNet-integration, men för Viral Panic valde jag i det här steget flera B1-instanser eftersom syftet främst är att demonstrera lastbalansering och tillgänglighet till lägre kostnad. Med tre B1-instanser finns redundans på instansnivå, vilket innebär att applikationen fortfarande har tillgängliga instanser som kan hantera trafik om en eller två instanser blir otillgängliga.

Jag valde dock att skala ut App Service-planen till två B1-instanser som grundläge. Det ger bättre tillgänglighet än en ensam instans, eftersom applikationen fortfarande kan hantera trafik om en instans blir otillgänglig. Tre instanser kan vara ett rimligt nästa steg vid högre belastning, men i detta skede bedömde jag att två instanser gav en bättre balans mellan kostnad och redundans.

### Rolling deployment, blue/green eller canary?

Driftsättningen sker direkt till den befintliga App Service-instansen och använder alltså inte exempelvis blue/green- eller canary-deployment. För en liten applikation som Viral Panic är den enklare strategin tillräcklig i detta skede. För en mer verksamhetskritisk applikation hade exempelvis deployment slots och blue/green deployment kunnat minska risken vid nya releaser genom att den nya versionen verifieras innan trafiken flyttas över.

### Hantering av autentiseringsuppgifter
För deployment till Azure App Service används en publish profile som lagras i GitHub Secrets. Publish-profilen lagras inte i repot eftersom den innehåller känsliga autentiseringsuppgifter.
För att förenkla uppdateringen av denna secret har jag skapat scriptet scripts/refresh-secret.sh. Scriptet tar App Service-namn och resursgrupp som argument, hämtar en aktuell publish profile från Azure och uppdaterar AZURE_WEBAPP_PUBLISH_PROFILE i GitHub Secrets. Den tillfälliga lokala filen tas bort även om något steg i scriptet misslyckas.

Scriptet körs inte som en del av varje deployment. Det används istället vid behov, exempelvis om resurserna har skapats på nytt eller autentiseringsuppgifterna behöver uppdateras. Den vanliga CI/CD-pipelinen använder därefter den secret som redan finns lagrad i GitHub.

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


Resursgrupp: rg-clo25-martina
Registernamn: acrclo25martina
Miljönamn: cae-clo25-martina
Containerapp-namn: ca-clo25-martina

