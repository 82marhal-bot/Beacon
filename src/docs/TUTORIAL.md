# Tutorial

## 1. Introduktion

### Vad appen är

*Viral Panic* är ett enkelt API som simulerar en tjänst som plötsligt kan få en kraftig trafikökning. Tanken är att appen ska representera en liten webbtjänst som på kort tid blir mer belastad än vanligt, till exempel efter att en kampanj, nyhet eller länk sprids snabbt.

Applikationen är medvetet enkel. Den innehåller några få endpoints som kan användas för att kontrollera att tjänsten är igång, hämta grundläggande information och simulera ett “panikläge”. Syftet är inte att bygga avancerad applikationslogik, utan att ha en tydlig och testbar tjänst som kan driftsättas på två olika sätt i Azure: med Azure App Service och som container med Azure Container Apps.

Projektets fokus ligger därför på driftsättning, skalbarhet och molninfrastruktur. Genom att hålla själva API:t enkelt blir det lättare att undersöka hur applikationen beter sig när den körs i molnet, hur flera instanser kan användas för lastbalansering och hur olika prisnivåer påverkar arkitekturvalet.

### Vad vi ska bygga

I den här tutorialen bygger och driftsätter vi samma applikation på två olika sätt i Azure. Det första spåret använder Azure App Service, där .NET-applikationen publiceras direkt till en Web App. Det andra spåret använder Azure Container Apps, där applikationen först paketeras som en Docker-image, lagras i Azure Container Registry och därefter körs som en container.

Infrastrukturen för båda spåren definieras med Bicep och kan provisioneras med projektets scripts. GitHub Actions används sedan för att automatisera build, test och deployment. När miljön är uppsatt kommer lösningen därför att bestå av två parallella deploymentspår för samma Viral Panic-applikation:

- **App Service:** .NET-applikation → Azure App Service
- **Container Apps:** .NET-applikation → Docker-image → Azure Container Registry → Azure Container Apps

Båda spåren använder samma endpoints och samma `/health`-endpoint för verifiering efter deployment.

### Arkitekturöversikt

Viral Panic består av en .NET-applikation som driftsätts genom två parallella spår:

```text
                         Viral Panic
                              |
                 +------------+------------+
                 |                         |
                 v                         v
          App Service-spår          Container Apps-spår
                 |                         |
                 v                         v
          dotnet publish              Docker-image
                 |                         |
                 v                         v
           Azure Web App                   ACR
                                           |
                                           v
                                  Azure Container Apps
```

App Service-spåret använder den publicerade .NET-applikationen direkt, medan Container Apps-spåret först paketerar samma applikation som en container-image och lagrar den i Azure Container Registry. Båda spåren använder Infrastructure as Code med Bicep för att definiera sina Azure-resurser och GitHub Actions för automatiserad build, test och deployment.

### Förutsättningar

Kommandona i tutorialen är skrivna för Bash.

För att följa hela tutorialen används följande verktyg:

- .NET 10 SDK
- Git
- GitHub CLI
- Azure CLI
- Docker

Kontrollera installationerna med:

```bash
dotnet --list-sdks
git --version
gh --version
az --version
docker --version
```

Exemplen i tutorialen använder mina resursnamn, exempelvis `rg-clo25-martina`, `app-clo25-martina` och `acrclo25martina`. Vid en egen implementation kan dessa ersättas med egna namn. Tänk då på att samma namn även används i projektets Bicep-parameterfiler, scripts och GitHub Actions-workflows. Om namnen ändras behöver därför motsvarande värden uppdateras konsekvent i projektets konfiguration.

## 2. Lokal utveckling

Från och med det här kapitlet arbetar vi praktiskt med projektet. 

### Klona repositoryt

Klona projektets repository och gå sedan till projektets rotkatalog:

```bash
git clone https://github.com/82marhal-bot/Beacon.git
cd Beacon
```
Kommandona i resten av tutorialen körs från projektets rot om inget annat anges.

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

### Bygg och testa containern lokalt

I det här avsnittet bygger vi Viral Panic som en Docker-image, startar den lokalt och verifierar att applikationen fungerar innan imagen används i Azure. Dockerfilen beskriver hur applikationen ska byggas till en image och vilka delar som behövs för att sedan kunna köra den.
Dockerfilen finns i `src/Beacon.Api/Dockerfile`. Följande kod är utdrag ur filen och ska inte köras separat. Den visar hur imagen byggs i två steg.
Dockerfilen använder en multi-stage build med två olika .NET-images. I det första steget används `mcr.microsoft.com/dotnet/sdk:10.0`. SDK står för *Software Development Kit* och innehåller verktygen som behövs för att bygga och publicera applikationen.

```</> dockerfile
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
```
När applikationen är färdigbyggd behövs inte längre hela SDK:n. Det slutliga steget använder därför `mcr.microsoft.com/dotnet/aspnet:10.0`, som innehåller det som behövs för att köra den färdigbyggda ASP.NET Core-applikationen.

```</> dockerfile
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
```

Genom att skilja på byggmiljön och den slutliga körmiljön behöver inte hela utvecklingsverktygslådan följa med i den färdiga imagen. Det ger en mindre image som bara innehåller det som behövs för att köra applikationen.

#### Dockerfile och lokal verifiering

Innan imagen används i Azure kan den byggas och testas lokalt. Från projektets rot byggs imagen med:

```bash
docker build \
  --file src/Beacon.Api/Dockerfile \
  --tag beacon:local \
  .
```

`--file` anger vilken Dockerfile som ska användas och `--tag beacon:local` ger den byggda imagen namnet och taggen `beacon:local`. Punkten på slutet anger den aktuella katalogen som build context.
Den färdigbyggda imagen kan sedan startas som en container:

```bash
docker run \
  --rm \
  --publish 8080:8080 \
  beacon:local
```

Låt containern fortsätta köra och öppna en andra terminal för verifieringen nedan. När testet är klart kan containern stoppas med `Ctrl+C`.

`--publish 8080:8080` kopplar port 8080 på den lokala datorn till port 8080 i containern, där Viral Panic lyssnar. `--rm` gör att testcontainern automatiskt tas bort när den stoppas.
När containern körs kan samma `/health`-endpoint som används i App Service-spåret användas för att verifiera applikationen:

```bash
./scripts/health-check.sh http://localhost:8080/health
``` 

## 3. Manuell uppsättning i Azure

### App Service

För deployment behöver Azure CLI vara autentiserad mot rätt tenant och subscription.

Kontrollera den aktiva Azure-kontexten:

```bash
az account show --output table
```

#### Skapa resursgrupp

```bash
az group create \
  --name rg-clo25-martina \
  --location westeurope
  ```

Exemplen använder `westeurope`, men tillgänglig kapacitet kan variera mellan Azure-regioner och över tid. Om en resurs inte kan provisioneras på grund av kapacitetsbegränsningar kan en annan region, exempelvis `swedencentral`, behöva användas. Regionen behöver då ändras konsekvent även i projektets Bicep-konfiguration och scripts.

#### Skapa App Service-plan

```bash
az appservice plan create \
  --name asp-clo25-martina \
  --resource-group rg-clo25-martina \
  --location westeurope \
  --sku B1 \
  --is-linux
  ```

#### Skapa Web App

```bash
az webapp create \
  --name app-clo25-martina \
  --resource-group rg-clo25-martina \
  --plan asp-clo25-martina \
  --runtime "DOTNETCORE:10.0"
  ```

#### Innan driftsättning

`az webapp deploy` använder en `.zip`-fil för deployment. Applikationen byggs och publiceras därför först, och projektfilen `Beacon.Api.csproj` innehåller ett `ZipPublishOutput`-target som automatiskt packar publiceringsresultatet till `app.zip` efter `dotnet publish`:

  <!-- Packar publiceringen till app.zip, bredvid publiceringsmappen -->
  ```xml
  <Target Name="ZipPublishOutput" AfterTargets="Publish">
    <ZipDirectory SourceDirectory="$(PublishDir)"
                  DestinationFile="$(PublishDir)../app.zip"
                  Overwrite="true" />
  </Target>
  ```

Kör sedan kommandot i terminalen:

```bash
dotnet publish src/Beacon.Api --configuration Release --output artifacts/publish
```

Kontrollera att `.zip`-filen (`app.zip`) finns innan driftsättning:

```bash
ls artifacts/
```

Utskriften ska bland annat visa app.zip, som används i nästa steg för driftsättningen till App Service.

#### Driftsätt Web App

```bash
az webapp deploy \
  --resource-group rg-clo25-martina \
  --name app-clo25-martina \
  --src-path artifacts/app.zip \
  --type zip
  ```

#### Tester att göra efter driftsättning

```bash
curl https://app-clo25-martina.azurewebsites.net/health
```

och 

```bash
curl https://app-clo25-martina.azurewebsites.net/panic
```

#### Skala ut till 2 instanser

```bash
az appservice plan update \
  --name asp-clo25-martina \
  --resource-group rg-clo25-martina \
  --number-of-workers 2
  ```

### Container Apps

Container-imagen byggdes och verifierades lokalt i kapitel 2. I det här avsnittet används samma Dockerfile för att bygga imagen i Azure Container Registry och driftsätta den med Azure Container Apps.

#### Skapa Azure Container Registry

Container-imagen behöver lagras i ett containerregister innan den kan användas av Azure Container Apps.

Skapa registret med:

```bash
az acr create \
  --name acrclo25martina \
  --resource-group rg-clo25-martina \
  --location westeurope \
  --sku Basic \
  --admin-enabled true
```

`Basic` är tillräckligt för projektets behov. Admin-användaren aktiveras eftersom den nuvarande Container App-konfigurationen använder ACR:s autentiseringsuppgifter för att hämta den privata imagen. En säkrare lösning med managed identity och rollen `AcrPull` beskrivs senare i tutorialen.

#### Bygg imagen i ACR

När registret finns kan Viral Panics container-image byggas direkt i Azure Container Registry. Samma Dockerfile som användes vid den lokala verifieringen används även här.

Från projektets rot körs:

```bash
az acr build \
  --registry acrclo25martina \
  --image beacon:v1 \
  --file src/Beacon.Api/Dockerfile \
  .
```

`az acr build` skickar projektets byggkontext till Azure Container Registry, där imagen byggs och lagras i registret. `--image beacon:v1` ger imagen namnet `beacon` och taggen `v1`.

Den fullständiga referensen till imagen blir:

```text
acrclo25martina.azurecr.io/beacon:v1
```

Det är samma image-referens som används som den första imagen i `container.bicepparam` när Container Appen senare skapas.

#### Skapa Container Apps Environment

En Container App körs i ett Container Apps Environment. Miljön är en separat Azure-resurs som fungerar som gemensam miljö för en eller flera Container Apps.

Skapa miljön med:

```bash
az containerapp env create \
  --name cae-clo25-martina \
  --resource-group rg-clo25-martina \
  --location westeurope
```

I projektet heter miljön `cae-clo25-martina`. När Container Appen skapas i nästa steg kopplas den till denna miljö.

#### Skapa Container App

När miljön och den första imagen finns kan Container Appen skapas. Den kopplas till den tidigare skapade miljön och använder imagen som ligger i ACR.

Skapa Container Appen med:

```bash
az containerapp create \
  --name ca-clo25-martina \
  --resource-group rg-clo25-martina \
  --environment cae-clo25-martina \
  --image acrclo25martina.azurecr.io/beacon:v1 \
  --registry-server acrclo25martina.azurecr.io \
  --registry-username $(az acr credential show \
    --name acrclo25martina \
    --query username \
    --output tsv) \
  --registry-password $(az acr credential show \
    --name acrclo25martina \
    --query 'passwords[0].value' \
    --output tsv) \
  --target-port 8080 \
  --ingress external \
  --cpu 0.5 \
  --memory 1.0Gi \
  --min-replicas 1 \
  --max-replicas 5
```

Kommandot skapar `ca-clo25-martina` i miljön `cae-clo25-martina` och konfigurerar den att köra den privata imagen från ACR. Användarnamnet och lösenordet hämtas från ACR i stället för att skrivas direkt i kommandot. `--target-port 8080` motsvarar porten där Viral Panic lyssnar inne i containern och `--ingress external` gör applikationen tillgänglig från internet. Antalet replicas begränsas till minst 1 och högst 5. Den HTTP-baserade skalningsregeln konfigureras i nästa steg.

#### Konfigurera HTTP-baserad skalning

Container Appen är konfigurerad med minst 1 och högst 5 replicas. För att låta Azure Container Apps skala antalet replicas utifrån belastningen används även en HTTP-baserad skalningsregel.

Skapa skalningsregeln med:

```bash
az containerapp update \
  --name ca-clo25-martina \
  --resource-group rg-clo25-martina \
  --scale-rule-name http-scaling \
  --scale-rule-http-concurrency 20
```

Regeln använder värdet `20` för samtidiga HTTP-anrop per replica. Värdet är en skalningssignal och inte en hård gräns för hur många anrop applikationen kan ta emot. När belastningen ökar kan Container Apps starta fler replicas, upp till det konfigurerade maximumet på 5. När belastningen minskar kan antalet replicas minska igen, men inte under minimumvärdet 1. Det motsvarar skalningsregeln som senare definieras i `container.bicep` med `concurrentRequests = 20`.

#### Verifiera deploymenten

När Container Appen är skapad kan dess publika adress hämtas från Azure:

```bash
APP_FQDN=$(az containerapp show \
  --name ca-clo25-martina \
  --resource-group rg-clo25-martina \
  --query properties.configuration.ingress.fqdn \
  --output tsv)
```

Kontrollera sedan applikationens `/health`-endpoint med projektets befintliga `health-check.sh`:

```bash
./scripts/health-check.sh "https://${APP_FQDN}/health"
```

Scriptet verifierar att den driftsatta applikationen går att nå och svarar med `HTTP 200`. Samma `/health`-endpoint används senare av CI/CD-pipelinen för att kontrollera applikationen efter en deployment.

Det går även att kontrollera adressen direkt med:

```bash
curl "https://${APP_FQDN}/health"
```

## 4. Automatiserad provisionering med Bicep och scripts

### Infrastructure as Code med Bicep

Projektets Azure-infrastruktur definieras med Bicep och är uppdelad i två filer eftersom Viral Panic driftsätts på två olika sätt. `main.bicep` beskriver infrastrukturen för App Service-spåret, medan `container.bicep` beskriver infrastrukturen för Container Apps-spåret.

### App Service-infrastruktur

`main.bicep` skapar en App Service Plan och en Web App. I stället för att hårdkoda konfigurationen används parametrar för appnamn, App Service Plan-namn, region, planens storlek och antal instanser.

### Container-infrastruktur

`container.bicep` skapar ett Azure Container Registry (ACR), ett Container Apps Environment och en Container App. ACR används för att lagra den image som byggs med Docker. Container Appen hämtar sedan imagen från registret och kör applikationen i Container Apps-miljön.

Ett Container Apps Environment ger en gemensam miljö för en eller flera Container Apps och samlar funktioner som apparna kan behöva, exempelvis nätverksfunktioner. Miljön är en separat Azure-resurs från de Container Apps som körs i det. I projektet heter miljön `cae-clo25-martina` och Viral Panic körs som Container Appen `ca-clo25-martina`.

Kopplingen mellan dem görs i Bicep:

```bicep
resource app 'Microsoft.App/containerApps@2026-01-01' = {
  name: containerAppName
  location: location
  properties: {
    managedEnvironmentId: environment.id
```

`managedEnvironmentId` anger vilket Container Apps Environment som Container Appen ska tillhöra. 

För att Viral Panic ska vara tillgänglig från internet konfigureras extern ingress:

```bicep
ingress: {
  external: true
  targetPort: targetPort
  allowInsecure: false
  transport: 'auto'
}
```

`external: true` gör applikationen tillgänglig utanför Container Apps Environment. `targetPort` är satt till `8080`, vilket anger den port där applikationen lyssnar inne i containern. Detta motsvarar porten som används när containern körs lokalt med Docker. `allowInsecure: false` innebär att osäker HTTP-trafik inte tillåts och omdirigeras till HTTPS.

När infrastrukturen först provisioneras anger `container.bicepparam` vilken image Container Appen ska använda:

```bicep
param containerImage = 'acrclo25martina.azurecr.io/beacon:v1'
```

Värdet skickas till `container.bicep` och används när containern konfigureras:

```bicep
containers: [
  {
    name: 'app'
    image: containerImage
    resources: {
      cpu: json(containerCpu)
      memory: containerMemory
    }
  }
]
```

Detta skiljer provisionering av infrastrukturen från senare deployment av nya applikationsversioner. Bicep skapar och konfigurerar infrastrukturen med en första image. När ny kod senare pushas till `main` bygger CI/CD-pipelinen en ny image och uppdaterar den befintliga Container Appen med imagen som är taggad med den aktuella Git-commitens SHA.
Infrastrukturen behöver därför inte skapas om för varje ny version av Viral Panic. I stället uppdateras vilken image den befintliga Container Appen kör.

Varje replica av Viral Panic konfigureras med `0.5` vCPU och `1.0GiB` minne:

```bicep
param containerCpu string = '0.5'
param containerMemory string = '1.0Gi'
```

Värdena anger hur mycket beräkningskapacitet och arbetsminne varje körande replica får använda. Resurserna behöver vara tillräckliga för applikationens behov, samtidigt som onödigt hög resursallokering kan innebära högre kostnader.

### Reproducerbarhet

En fördel med Infrastructure as Code är att infrastrukturen finns dokumenterad i samma form som används för att skapa den. Om resurserna behöver tas bort kan de därför skapas igen med samma konfiguration utan att varje resurs behöver konfigureras manuellt i Azure-portalen. Det gör också infrastrukturen lättare att beskriva och återskapa för någon annan.
Bicep-filerna används av scripten `deploy-infra.sh`, `deploy-container.sh` och `provision-all.sh`. På så sätt kan provisioneringen automatiseras i stället för att resurserna behöver skapas manuellt steg för steg. Att infrastrukturen kan skapas reproducerbart sparar också tid. Samma konfiguration kan användas flera gånger utan att infrastrukturen behöver byggas upp manuellt från början vid varje tillfälle. Projektet innehåller även `teardown.sh`, som kan användas för att ta bort projektets Azure-resurser när miljön inte längre behövs. Det är särskilt användbart för att undvika onödiga kostnader mellan test- och demonstrationstillfällen.

### Kontroll med what-if

Innan en deployment kan `what-if` användas för att förhandsgranska vilka förändringar Bicep-deploymenten skulle innebära. Det visar vilka resurser som kommer att skapas, ändras eller tas bort och gör det möjligt att kontrollera förändringarna innan de faktiskt genomförs. Det minskar risken för att resurser oavsiktligt ändras eller tas bort vid en deployment. I outputen betyder `+` att en resurs kommer att skapas, `~` att den kommer att ändras och `-` att den kommer att tas bort. Sammanfattningen längst ned visar hur många resurser som påverkas. Kontrollera särskilt oväntade `~` och `-` innan deploymenten körs.

### Provisionering med scripts

Bicep-filerna beskriver vilken infrastruktur som ska finnas i Azure, medan projektets Bash-scripts används för att köra deploymenterna i rätt ordning. På så sätt behöver samma Azure CLI-kommandon inte köras manuellt varje gång infrastrukturen ska provisioneras.

Projektet innehåller tre scripts för detta:

- `deploy-infra.sh` provisionerar App Service-spåret.
- `deploy-container.sh` provisionerar Container Apps-spåret.
- `provision-all.sh` bygger upp båda spåren i den ordning som krävs.

#### Provisionera App Service-spåret

App Service-infrastrukturen kan provisioneras med:

```bash
./scripts/deploy-infra.sh rg-clo25-martina
```

Scriptet använder `infra/main.bicep` tillsammans med `infra/main.bicepparam`. Om resursgruppen inte redan finns skapas den först i `westeurope`. Därefter körs en deployment på resursgruppsnivå med Azure CLI.

Innan förändringarna genomförs kan samma script köras med `--what-if`:

```bash
./scripts/deploy-infra.sh --what-if rg-clo25-martina
```

I detta läge skapas inga resurser av Bicep-deploymenten. Resursgruppen skapas däremot om den saknas, eftersom `what-if` behöver en befintlig resursgrupp för att kunna förhandsgranska deploymenten.

#### Provisionera Container Apps-spåret

Container Apps-infrastrukturen kan provisioneras med:

```bash
./scripts/deploy-container.sh rg-clo25-martina
```

Scriptet använder `infra/container.bicep` tillsammans med `infra/container.bicepparam`. Det förutsätter att Azure Container Registry redan finns och att den image som Container Appen ska använda redan har byggts och lagrats där.

Precis som för App Service-spåret kan deploymenten först förhandsgranskas med `--what-if`:

```bash
./scripts/deploy-container.sh --what-if rg-clo25-martina
```

Scriptet skapar resursgruppen i `westeurope` om den saknas och kör därefter antingen `az deployment group what-if` eller en faktisk deployment på resursgruppsnivå.

Vid en riktig deployment hämtar scriptet `appUrl` från Bicep-deploymentens output och skriver ut adressen till den färdiga Container Appen.

#### Återskapa hela miljön

`provision-all.sh` bygger upp miljön i den ordning resurserna behöver skapas. Först provisioneras App Service-spåret. Därefter skapas Azure Container Registry så att den första container-imagen kan byggas och lagras i registret innan Container Appen skapas.

Detta behövs eftersom `container.bicep` deklarerar både registret och Container Appen, samtidigt som Container Appen behöver referera till en image som redan finns i registret. Scriptet löser därför bootstrap-problemet genom att skapa ACR först, bygga imagen och därefter köra den fullständiga Container Apps-deploymenten.

Hela Azure-infrastrukturen för båda deploymentspåren kan därefter återskapas med:

```bash
./scripts/provision-all.sh rg-clo25-martina acrclo25martina
```

Scriptet använder projektets Bicep-definitioner för att skapa resurserna för App Service-spåret och Container Apps-spåret. 

## 5. CI/CD med GitHub Actions

### App Service

Deploymenten till Azure App Service automatiseras med GitHub Actions. Workflowen bygger och testar applikationen, ser till att infrastrukturen är provisionerad och driftsätter därefter den färdigpublicerade applikationen.

#### När workflowen körs

Workflowen körs automatiskt när kod pushas till `main`:

```yaml
on:
  push:
    branches:
      - main
    paths-ignore:
      - '**.md'
  workflow_dispatch:
```

`workflow_dispatch` gör det också möjligt att starta workflowen manuellt från GitHub. Markdown-filer är undantagna med `paths-ignore`. En ändring som endast berör dokumentationen behöver därför inte starta en ny deployment till Azure.

#### Workflowens jobb

Workflowen är uppdelad i tre jobb:

- `infra`
- `build`
- `deploy`

Deploy-jobbet har följande beroenden:

```yaml
needs: [build, infra]
```

Det innebär att både infrastrukturen och applikationsbygget måste vara färdiga innan deploymenten kan börja. `infra` och `build` kan däremot köras oberoende av varandra.

#### Provisionering av infrastrukturen

`infra`-jobbet checkar först ut repositoryt så att runnern får tillgång till projektets filer. Därefter autentiserar workflowen mot Azure med OIDC. GitHub Actions begär då en kortlivad token som Azure verifierar mot den federerade credential som är kopplad till repositoryt och grenen `main`, vilket innebär att något långlivat service principal-lösenord inte behöver lagras i workflowen. Efter autentiseringen körs projektets infrastrukturscript:

```bash
./scripts/deploy-infra.sh "$AZURE_RESOURCE_GROUP"
```

Scriptet använder Bicep-definitionen för App Service-infrastrukturen. Genom att köra infrastrukturdeploymenten som en del av workflowen kan den senaste versionen av Bicep-konfigurationen appliceras vid deployment. Om infrastrukturen har ändrats i repositoryt kan motsvarande förändringar därmed genomföras i Azure.

#### Bygga och testa applikationen

`build`-jobbet använder en separat GitHub Actions-runner och checkar därför också ut repositoryt. Därefter konfigureras .NET 10 SDK. Applikationen byggs och testerna körs innan den får gå vidare till deployment. Det fungerar som en kvalitetskontroll i pipeline-flödet. Om bygget eller testerna misslyckas ska den versionen inte driftsättas. Efter testerna körs `dotnet publish`. Det skapar den publicerade version av applikationen som behövs för deployment.

#### Artifact mellan jobben

Resultatet från `dotnet publish` laddas upp som ett GitHub Actions-artifact. Det behövs eftersom jobben körs på separata runners och därför inte automatiskt delar samma filsystem. När build-jobbet är färdigt kan dess runner försvinna, medan den publicerade applikationen finns kvar som ett artifact. På så sätt går den byggda och testade versionen vidare till deployment utan att behöva byggas om i deploy-jobbet.

#### Deployment till App Service

När både `infra` och `build` har lyckats kan `deploy` starta. Deploy-jobbet autentiserar sig mot Azure igen med OIDC. Detta behövs eftersom jobbet körs på en egen runner och inte delar Azure-inloggningen från `infra`-jobbet. Det publicerade artifactet hämtas och driftsätts därefter till App Service.

#### Smoke test efter deployment

`health-check.sh` är ett smoke test som körs efter driftsättningen. Scriptet skickar HTTP-anrop till applikationens `/health`-endpoint och kontrollerar att servern svarar med statuskod `200 OK`, vilket betyder att anropet kunde behandlas framgångsrikt. Om appen inte svarar direkt gör scriptet flera försök med fem sekunders mellanrum, eftersom applikationen kan behöva tid att starta efter en driftsättning.

Smoke-testet är värdefullt utöver pipelinens vanliga deployment-status eftersom en lyckad deployment endast visar att driftsättningssteget lyckades. Det garanterar inte att den nya versionen av applikationen faktiskt har startat och kan svara på HTTP-anrop. Health checken verifierar därför den driftsatta applikationen efter deployment. Om `/health` aldrig svarar med `200` avslutas scriptet med exit-kod `1`, vilket gör att steget i pipelinen markeras som misslyckat.

Det ger pipeline-flödet följande övergripande struktur:

```text
Push till main
      |
      +-------------------+
      |                   |
      v                   v
    infra               build
      |                   |
 checkout              checkout
 Azure login           setup .NET
 Bicep                 build
                       test
                       publish
                       artifact
      |                   |
      +---------+---------+
                |
                v
              deploy
                |
        download artifact
          Azure login
                |
        App Service
                |
            /health
```


### Container Apps

Deploymenten till Azure Container Apps automatiseras med GitHub Actions. Till skillnad från App Service-spåret, där den publicerade applikationen överförs som ett GitHub Actions-artifact, paketeras applikationen här som en image. Imagen byggs och lagras i Azure Container Registry (ACR) och används sedan av Azure Container Apps.

Workflowen består av två jobs:

- `build-and-push`
- `deploy`

Deploy-jobbet har följande beroende:

```yaml
needs: build-and-push
```

Det innebär att deploymenten inte börjar förrän testerna har lyckats och imagen har byggts och lagrats i ACR.

#### Test och autentisering

I `build-and-push` checkas repositoryt först ut och .NET 10 SDK konfigureras. Därefter körs testerna:

```bash
dotnet test --configuration Release
```

Om testerna misslyckas stoppas workflowen innan någon image byggs och driftsätts. 

Efter testerna autentiserar sig GitHub Actions mot Azure med OIDC. Workflowen använder repository-variabler för Azure-identitetens client ID, tenant ID och subscription ID, medan GitHub utfärdar en kortlivad OIDC-token. Det gör att workflowen kan utföra de Azure-operationer som behövs utan att ett service principal-lösenord lagras som en GitHub Secret.

#### Bygga och lagra imagen i ACR

I GitHub Actions-workflowen byggs imagen med `az acr build`. Följande är ett utdrag ur workflow-filen och körs automatiskt av pipelinen:

```bash
az acr build \
  --registry "${{ env.ACR_NAME }}" \
  --image "${{ env.IMAGE_NAME }}:${{ github.sha }}" \
  --image "${{ env.IMAGE_NAME }}:latest" \
  --file src/Beacon.Api/Dockerfile \
  .
```

`az acr build` bygger imagen direkt i Azure Container Registry i stället för på GitHub Actions-runnern. Den färdiga imagen lagras i ACR med två taggar:

```text
beacon:<github.sha>
beacon:latest
```

SHA-taggen gör det möjligt att koppla imagen till den Git-commit som startade workflowen. Taggen `latest` kan däremot flyttas till en ny image vid nästa build och används därför inte för att identifiera den version som ska driftsättas.

#### Deployment med SHA-tagg

När `build-and-push` har lyckats startar `deploy`-jobbet. Det autentiserar sig mot Azure eftersom det körs på en separat GitHub Actions-runner. Följande utdrag ur workflow-filen uppdaterar sedan Container Appen med imagen som har den aktuella commitens SHA:

```bash
IMAGE="${{ env.ACR_NAME }}.azurecr.io/${{ env.IMAGE_NAME }}"

az containerapp update \
  --name "${{ env.CONTAINER_APP_NAME }}" \
  --resource-group "${{ env.AZURE_RESOURCE_GROUP }}" \
  --image "$IMAGE:${{ github.sha }}"
```

Container Apps-infrastrukturen behöver inte skapas på nytt vid varje kodändring. Bicep skapar och konfigurerar infrastrukturen, medan CI/CD-pipelinen uppdaterar den befintliga Container Appen med en ny image. Vid den första provisioneringen anges en initial image i `container.bicepparam`:

```bicep
param containerImage = 'acrclo25martina.azurecr.io/beacon:v1'
```

Efterföljande deployments uppdaterar sedan den befintliga Container Appen till den image som hör till den aktuella Git-commiten.

#### Revisioner

När Container Appen uppdateras med en ny image skapas en ny revision. En revision representerar en version av Container Appens konfiguration. I den här pipelinen är den viktigaste förändringen att en ny image används. Container Apps har stöd för att arbeta med flera revisioner och mer avancerad trafikstyrning, men den nuvarande lösningen använder inte den typen av trafikstyrning.

#### ACR som överlämning mellan jobben

Till skillnad från App Service-workflowen behöver Container Apps-spåret inget GitHub Actions-artifact för att föra den byggda applikationen mellan jobben. När `build-and-push` är färdigt finns imagen redan lagrad i ACR:

```text
acrclo25martina.azurecr.io/beacon:<github.sha>
```

Deploy-jobbet behöver därför inte hämta några byggda applikationsfiler från det tidigare jobbet. Det anger i stället vilken image Container Appen ska hämta från ACR. 

De två deploymentspåren överför alltså den version som ska driftsättas på olika sätt:

```text
App Service:
kod → publish → GitHub artifact → App Service

Container Apps:
kod + Dockerfile → ACR build → image i ACR → Container Apps
```

#### Autentisering i två steg

Container Apps-spåret innehåller två autentiseringsrelationer. GitHub Actions autentiserar sig mot Azure med OIDC och en federerad identitet för att bygga imagen i ACR och uppdatera Container Appen.

Container Appen behöver i sin tur kunna autentisera sig mot ACR för att hämta den privata imagen. I den nuvarande lösningen görs detta med ACR:s admin-användare och ett lösenord som lagras som en secret i Container Appen. Autentiseringarna har olika syften: GitHub behöver behörighet att genomföra deploymenten, medan Container Appen behöver behörighet att hämta imagen.

#### Health check efter deployment

Efter deployment hämtar workflowen Container Appens FQDN och kör `health-check.sh` mot:

```text
https://<container-appens-fqdn>/health
```

Samma `health-check.sh` och `/health`-endpoint används här som i App Service-spåret för att verifiera att den driftsatta applikationen har startat och går att nå.

## 6. Skalning och lastbalansering

### App Service

App Service-spåret använder horisontell skalning, vilket innebär att flera instanser av samma applikation kan köras samtidigt. I projektets normala konfiguration kör App Service-planen 2 instanser av SKU:n `B1`.

Antalet instanser styrs av parametern `instanceCount` i Bicep:

```bicep
@minValue(1)
@maxValue(3)
param instanceCount int = 2
```

Infrastrukturen tillåter alltså mellan 1 och 3 instanser, medan den normala konfigurationen använder 2. Eftersom Viral Panic är stateless kan samma applikation köras på flera instanser utan att användarsessioner eller applikationsdata behöver synkroniseras mellan dem.
När flera instanser körs fördelar Azure App Service inkommande trafik mellan dem. `/info` returnerar `Environment.MachineName`, vilket gör det möjligt att se vilken instans som har hanterat ett visst anrop. Genom att anropa endpointen flera gånger kan olika machine-namn observeras när trafiken når olika instanser.
App Service-spåret demonstrerar därmed horisontell skalning och lastbalansering genom att samma applikation körs på flera instanser bakom samma publika adress.

### Container Apps

Azure Container Apps kan automatiskt ändra antalet replicas beroende på belastningen på applikationen. I Viral Panic används HTTP-trafik som skalningssignal.

Skalningen konfigureras i `container.bicep`:

```bicep
scale: {
  minReplicas: minReplicas
  maxReplicas: maxReplicas
  rules: [
    {
      name: 'http-scaling'
      http: {
        metadata: {
          concurrentRequests: '${concurrentRequests}'
        }
      }
    }
  ]
}
```

I projektet används följande värden:

```bicep
param minReplicas int = 1
param maxReplicas int = 5
param concurrentRequests int = 20
``` 

#### Minsta och högsta antal replicas

`minReplicas` är satt till `1`, vilket innebär att minst en replica hålls igång även när belastningen är låg. Container Apps kan även konfigureras med `0` som minimum och då skala ner applikationen helt när den inte används. Det minskar resursanvändningen, men kan ge en cold start när trafik kommer in igen. `maxReplicas` är satt till `5` och sätter en övre gräns för autoskalningen. Container Apps kan därmed lägga till kapacitet när belastningen ökar utan att antalet replicas växer obegränsat.

#### Skalning baserad på HTTP-trafik

Skalningsregeln använder `concurrentRequests` med värdet `20`. Det innebär att antalet samtidiga HTTP-anrop används som signal för hur många replicas som behövs. Värdet är inte en hård gräns där anrop nummer 21 nekas. Det används som skalningssignal för att avgöra när applikationen behöver mer eller mindre kapacitet. När belastningen ökar kan Container Apps skala ut genom att starta fler replicas, upp till `maxReplicas`. När belastningen minskar kan Container Apps skala in igen genom att ta bort replicas som inte längre behövs, men aldrig under `minReplicas`. Själva beslutet om när replicas ska startas och stoppas hanteras av Azure Container Apps. Applikationskoden behöver därför inte själv känna till hur många replicas som körs.

#### Horisontell skalning

Varje replica använder samma resurskonfiguration:

```bicep
resources: {
  cpu: json(containerCpu)
  memory: containerMemory
}
```

När applikationen skalar ut får en befintlig replica inte mer CPU eller minne. I stället startas fler replicas med samma resurskonfiguration. Det är horisontell skalning. Vertikal skalning innebär i stället att en enskild instans får mer CPU eller minne.

#### Demonstrera autoskalning

För att demonstrera autoskalningen behöver applikationen utsättas för flera samtidiga HTTP-anrop. Att skicka många anrop efter varandra ger inte samma belastning, eftersom tidigare anrop kan hinna avslutas innan nästa skickas. Ett load-testverktyg eller script kan därför användas för att skapa samtidiga anrop. Under testet kan antalet aktiva replicas observeras, medan `/info` och frontendens **Observed Replicas**  kan visa vilka replicas klienten har sett under sessionen.

### Stateless applikation
Viral Panic är stateless. Applikationen är inte beroende av att viktigt tillstånd från ett tidigare anrop finns lagrat lokalt i minnet hos en specifik replica. 
Det innebär att replicas är utbytbara. Om ett anrop hanteras av en replica och nästa av en annan behöver den andra replican inte känna till något lokalt tillstånd från den första för att kunna svara korrekt.
Det gör Viral Panic lämplig för horisontell skalning eftersom flera replicas kan hantera trafik parallellt. Om en replica försvinner kan andra fortsätta hantera anrop utan att applikationen förlorar viktigt tillstånd. Container Apps kan därför skala både ut och in och fördela trafik mellan likadana replicas.
Om applikationen i stället hade lagrat viktig användardata endast lokalt i en replicas minne skulle nästa anrop kunna hamna hos en annan replica som saknade denna information. Sådant tillstånd skulle därför behöva lagras i en extern, delad lagringslösning.

### Demonstrera skalning och lastbalansering

Azure Container Apps kan köra flera replicas av samma applikation. Varje replica är en separat körande instans av samma Viral Panic-image. När flera replicas är aktiva kan inkommande HTTP-trafik fördelas mellan dem genom Container Apps inbyggda lastbalansering. Ett anrop behöver därför inte hanteras av samma replica som det föregående.
Viral Panic innehåller endpointen `/info`, som returnerar bland annat:

```c#
machine = Environment.MachineName
```

Eftersom olika replicas kan ha olika machine-namn kan frontendens funktion **Observed Replicas** registrera vilka replicas som har svarat på anrop under sessionen. Det gör det möjligt att synligt demonstrera att trafiken hanteras av olika instanser av samma applikation.
**Observed Replicas** visar vilka machine-namn klienten har observerat under den aktuella webbläsarsessionen. Listan visar inte alla replicas som kör just nu och beskriver inte hur trafiken är fördelad. En tidigare observerad replica kan exempelvis ha skalats bort.


## 7. Autentisering och säkerhet

Lösningen använder flera olika autentiserings- och behörighetslösningar. GitHub Actions behöver autentisera sig mot Azure för att kunna provisionera och driftsätta resurser, medan Container Appen behöver autentisera sig mot Azure Container Registry för att kunna hämta sin privata container-image.

GitHub Actions autentiserar sig mot Azure med OIDC och behöver därför inget långlivat service principal-lösenord i den aktiva CI/CD-pipelinen. Azure-identitetens client ID, tenant ID och subscription ID lagras som GitHub Variables. Container Appen använder däremot fortfarande autentiseringsuppgifter från ACR, där lösenordet lagras som en Container App-secret.

App Service använder dessutom managed identity för åtkomst till Azure Key Vault. 

### GitHub Actions mot Azure

GitHub Actions autentiserar sig mot Azure med OIDC via `azure/login`. Workflowen har behörigheten `id-token: write`, vilket gör att GitHub kan utfärda en kortlivad token för OIDC-autentiseringen.
Azure-identitetens client ID, tenant ID och subscription ID lagras som GitHub Variables och används vid inloggningen:
```yaml
permissions:
  id-token: write
  contents: read

# ...

- name: Sign in to Azure
  uses: azure/login@v3
  with:
    client-id: ${{ vars.AZURE_CLIENT_ID }}
    tenant-id: ${{ vars.AZURE_TENANT_ID }}
    subscription-id: ${{ vars.AZURE_SUBSCRIPTION_ID }}
```

App-registreringen i Microsoft Entra ID har en federerad credential som är bunden till repositoryt och grenen `main`. Azure kan därför verifiera GitHubs OIDC-token och låta workflowen använda den tillhörande identiteten utan ett långlivat service principal-lösenord.
Autentisering och auktorisering har olika funktioner. OIDC verifierar vilken identitet workflowen använder, medan identitetens Azure-roller avgör vilka operationer den får utföra. I den nuvarande lösningen har identiteten rollen Contributor på projektets resursgrupp.

### OIDC vid fullständig återuppbyggnad

Vid en fullständig återuppbyggnad behöver först rätt Azure-subscription väljas. GitHub Actions autentiserar sig med OIDC, men den federerade identiteten behöver också ha rätt Azure-behörigheter. Eftersom rollen Contributor är tilldelad på resursgruppens scope försvinner rolltilldelningen när resursgruppen tas bort. Resursgruppen behöver därför först återskapas och OIDC-identiteten åter få rollen Contributor innan GitHub Actions kan provisionera och driftsätta resurser där.

### Key Vault och managed identity

App Service använder en system-assigned managed identity för att läsa hemligheter från Azure Key Vault utan att applikationen behöver lagra lösenord eller andra autentiseringsuppgifter. Identiteten skapas tillsammans med Web Appen och hanteras automatiskt av Azure. Key Vault provisioneras separat med `security.bicep`. I den nuvarande lösningen används access policies. App Service-identiteten får endast behörigheterna `get` och `list` för secrets. Applikationen kan därmed läsa hemligheten men inte skapa eller ändra den. 

Hemligheten skrivs inte direkt i Bicep-filen. `security.bicepparam` läser i stället värdet från miljövariabeln `SECRET_VALUE`:

```bicep
param secretValue = readEnvironmentVariable('SECRET_VALUE')
```

App Service-konfigurationen använder sedan en Key Vault-referens i app settingen `MY_SECRET`:

```text
@Microsoft.KeyVault(SecretUri=https://kv-clo25-martina.vault.azure.net/secrets/demo-secret)
``` 

När applikationen behöver värdet kan Azure använda Web Appens managed identity för att hämta hemligheten från Key Vault. Något Key Vault-lösenord behöver därför inte lagras i applikationen eller repositoryt. Efter deployment verifierades konfigurationen genom Azure Resource Manager och Key Vault-referensen rapporterade status `Resolved`. Applikationens `/health`-endpoint svarade därefter med HTTP 200, vilket verifierade att Web Appen fortfarande fungerade med den nya konfigurationen.

### Container App mot ACR

Container Appen behöver autentisera sig mot ACR för att kunna hämta den privata imagen.

I den nuvarande lösningen är ACR:s admin-användare aktiverad:

```bicep
properties: {
  adminUserEnabled: true
}
```

Registerkonfigurationen använder ACR:s användarnamn och refererar till ett lösenord som lagras som en Container App-secret:

```bicep
registries: [
  {
    server: acr.properties.loginServer
    username: acr.listCredentials().username
    passwordSecretRef: registryPasswordSecretName
  }
]

secrets: [
  {
    name: registryPasswordSecretName
    value: acr.listCredentials().passwords[0].value
  }
]
```

Själva lösenordet är alltså inte hårdkodat i Bicep-filen. `acr.listCredentials()` hämtar autentiseringsuppgifterna från ACR vid deploymenten och lösenordet lagras som en Container App-secret. Registerkonfigurationen refererar sedan till denna secret med `passwordSecretRef`.


### Secrets lagras där de används

De två typerna av autentiseringsuppgifter används av olika komponenter och lagras därför på olika ställen. ACR-lösenordet används fortfarande av Container Appen och lagras som en Container App-secret i Azure. På så sätt begränsas autentiseringsuppgifterna till den komponent som behöver dem för att hämta images från registret.

### Principle of least privilege

*Principle of least privilege* innebär att en identitet endast bör få de behörigheter som krävs för dess uppgift. Container Appen behöver endast kunna hämta den image som ska köras från ACR och behöver därför inte generell administrativ åtkomst till registret. Den nuvarande lösningen med ACR:s admin-användare är en enklare lösning för projektet, men innebär att ett administrativt användarnamn och lösenord behöver hanteras.

### Möjlig förbättring med managed identity och AcrPull

En säkrare vidareutveckling skulle vara att använda en managed identity för Container Appen och ge identiteten rollen `AcrPull` för att hämta images från ACR. Det skulle ta bort beroendet av ACR:s admin-lösenord och begränsa Container Appens behörighet till det den behöver göra.

Den nuvarande autentiseringskedjan för Container Apps-spåret kan därför sammanfattas som:

```text
GitHub Actions
      |
      | OIDC
      v
Federerad Azure-identitet
      |
      | Contributor
      v
    Azure
      |
      | deployment
      v
Container App
      |
      | ACR credentials
      v
     ACR
      |
      | pull image
      v
container-image
```

En möjlig framtida lösning för den sista autentiseringsrelationen är:

```text
Container App
      |
      | Managed Identity
      v
 Azure-identitet
      |
      | AcrPull
      v
     ACR
```

### Hantering av exponerade secrets

Secrets ska inte hårdkodas i Bicep-filer, workflow-filer eller annan kod som versionshanteras. Om en secret av misstag checkas in i Git räcker det inte att ta bort värdet i en senare commit, eftersom det kan finnas kvar i repositoryts historik. Den exponerade credentialen bör därför betraktas som komprometterad och roteras så att det gamla värdet inte längre är giltigt. Efter rotation behöver den nya autentiseringsuppgiften uppdateras där hemligheten används, exempelvis i GitHub Secrets eller motsvarande Azure-konfiguration.

## 8. App Service jämfört med Container Apps

Viral Panic driftsätts på två olika sätt i Azure: som en .NET-applikation i Azure App Service och som en container i Azure Container Apps. Båda spåren använder samma applikationskod och endpoints, men skiljer sig åt i paketering, infrastruktur och skalning.

### Paketering och deployment

I App Service-spåret byggs och publiceras .NET-applikationen med `dotnet publish`. Det publicerade resultatet driftsätts sedan till Web Appen. App Service tillhandahåller den körmiljö som applikationen behöver. I Container Apps-spåret paketeras applikationen i stället som en container-image. 

Dockerfilen definierar hur applikationen byggs och vilken runtime-image den ska köras med:

```dockerfile
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
```

Imagen innehåller applikationen tillsammans med den runtime-miljö som definieras i Dockerfilen. Den byggs och lagras i ACR och används sedan för att starta containers i Azure Container Apps. Imagen blir därmed en standardiserad och versionsbar enhet som kan köras på kompatibla containerplattformar.

### Infrastruktur

De två spåren behöver olika Azure-resurser och infrastrukturen är därför uppdelad i separata Bicep-filer.

App Service-spåret använder:

```text
App Service Plan
└── Web App
```

Container Apps-spåret använder:

```text
Azure Container Registry
Container Apps Environment
└── Container App
```

`main.bicep` ansvarar för App Service-infrastrukturen och `container.bicep` för Container Apps-infrastrukturen. Uppdelningen gör att respektive fil beskriver de resurser och inställningar som behövs för den aktuella deploymentmodellen.

### Skalning

En tydlig skillnad mellan de två spåren är hur skalningen är konfigurerad. App Service-spåret använder B1 med ett manuellt konfigurerat antal instanser och skalar därför inte automatiskt när belastningen förändras. Container Apps-spåret är däremot konfigurerat för automatisk horisontell skalning:

```text
minReplicas = 1
maxReplicas = 5
concurrentRequests = 20
```

Container Apps kan därför öka eller minska antalet replicas utifrån den samtidiga HTTP-belastningen, inom de konfigurerade gränserna.

### Versionshantering av container-images

Container Apps-workflowen taggar varje image med Git-commitens SHA:

```text
beacon:<github.sha>
```

Container Appen uppdateras sedan med den SHA-taggade imagen, vilket ger spårbarhet mellan den driftsatta imagen och den Git-commit som användes för att bygga den. Imagen får även taggen `latest`, men deploymenten använder SHA-taggen eftersom `latest` kan flyttas till en ny image vid nästa build.

### Gemensamma delar

Trots skillnaderna har spåren flera gemensamma delar. Båda använder samma Viral Panic-applikation och samma endpoints, exempelvis `/health`, `/info` och `/panic`. Båda GitHub Actions-workflowsen triggas automatiskt vid pushes till `main` och kan även startas manuellt med `workflow_dispatch`. Tester körs före deployment och `health-check.sh` används för verifiering efter deployment. Skillnaden ligger därför främst i hur applikationen paketeras och vilken Azure-plattform som kör den.

### Val mellan App Service och Container Apps

I detta projekt används båda alternativen för att demonstrera två olika deploymentmodeller för samma applikation. I ett verkligt projekt behöver applikationen däremot inte driftsättas med båda modellerna. Valet beror på lösningens behov. Faktorer som påverkar valet är bland annat krav på körmiljö och paketering, varierande belastning, behov av automatisk skalning och hur mycket kontroll över körmiljön som behövs.

App Service gör det möjligt att driftsätta den publicerade .NET-applikationen direkt till en managed webbplattform utan att paketera den som en container. Container Apps-spåret innehåller fler komponenter, exempelvis Dockerfile, container-images och ACR, men ger samtidigt en tydligt definierad och versionsbar image. Det visar också hur replicas kan skapas och tas bort automatiskt när belastningen förändras. De två modellerna löser delvis samma problem på olika sätt och valet behöver därför göras utifrån applikationens och driftmiljöns krav.

## 9. Designbeslut och kostnader

### Val av projektnamn

Projektet fick från början namnet Beacon, som var namnet i uppgiften. Senare valde jag att kalla applikationen Viral Panic, men behöll Beacon som internt projektnamn för att undvika onödiga ändringar i exempelvis namespaces och befintliga flöden. Det interna projektnamnet påverkar inte det namn som användaren möter i applikationen.

### Val av app-idé

Jag valde att bygga Viral Panic eftersom idén med en tjänst som plötsligt går viral passar bra ihop med uppgiftens fokus på skalbarhet och lastbalansering. Konceptet gör det möjligt att på ett enkelt och visuellt sätt demonstrera vad som händer när applikationen behöver hantera en trafikspik.

### Val av tier

Jag övervägde både `B1` och `P0v3` för App Service-spåret. `P0v3` ger tillgång till fler funktioner, exempelvis autoscale och deployment slots, men jag valde B1 eftersom syftet främst är att demonstrera flera instanser och lastbalansering till en lägre kostnad.
App Service-planen är konfigurerad med två `B1`-instanser. En instans hade varit billigare men inte gjort det möjligt att demonstrera lastbalansering mellan flera instanser. Tre instanser hade gett ytterligare kapacitet och redundans, men också högre kostnad. Två blev därför en lämplig kompromiss för projektets behov.
Bicep-konfigurationen tillåter mellan en och tre instanser, vilket gör antalet konfigurerbart utan att tre behöver vara normalläget. App Service-spåret använder ett fast antal instanser, medan Container Apps-spåret demonstrerar automatisk horisontell skalning utifrån belastning.
Provisioneringstid och tillgänglig kapacitet blev också faktorer i valet, eftersom `P0v3` i praktiken kunde provisioneras snabbare när B1 hade kapacitetsproblem i regionen. 

#### Prisjämförelse

Som en del av en tidigare övning jämfördes kostnaden för flera App Service-alternativ: `B1`, `B3` och `P0v3`. Jämförelsen finns kvar här eftersom den blev en del av underlaget för valet av App Service-konfiguration i projektet.

| Tier | Instanser | Region | OS | Kostnad/månad |
|---|---:|---|---|---:|
| Basic B1 | 1 | West Europe | Linux | 13.14 USD |
| Basic B1 | 3 | West Europe | Linux | 39.42 USD |
| Basic B3 | 1 | West Europe | Linux | 51.83 USD |
| Basic B3 | 3 | West Europe | Linux | 155.49 USD |
| P0v3 | 1 | West Europe | Linux | 64.97 USD |
| Container Registry Basic | 1 | — | — | 5.00 USD |

*Priserna kontrollerades i september 2026 och används som uppskattningar för arkitekturjämförelsen. Projektets resurser driftsattes i `West Europe`.*

Två `B1`-instanser kostade vid jämförelsetillfället cirka 26.28 USD/månad, jämfört med 64.97 USD/månad för en `P0v3`-instans. Prisjämförelsen stödde därför valet av B1 för projektets ordinarie konfiguration.

### Driftsättningsstrategi

Båda deploymentspåren använder en enkel automatiserad driftsättningsstrategi. Applikationen byggs och testas innan den nya versionen driftsätts. Efter deployment körs även en health check mot `/health` för att verifiera att applikationen går att nå.
I App Service-spåret publiceras applikationen och driftsätts till Web Appen. I Container Apps-spåret byggs i stället en image som taggas med aktuell Git-commits SHA och lagras i ACR. Container Appen uppdateras därefter till den SHA-taggade imagen, vilket ger spårbarhet till den commit som användes för bygget.
Lösningen använder inte någon blue/green- eller canary-strategi. Vid blue/green körs två versioner parallellt och trafiken flyttas till den nya versionen efter verifiering, medan canary innebär att den nya versionen först får en mindre del av trafiken. Viral Panic är en liten och stateless applikation, så en enkel och reproducerbar deploymentprocess har prioriterats framför en mer avancerad release-strategi.
För en mer verksamhetskritisk applikation skulle den nya versionen kunna verifieras innan all trafik flyttas över för att minska risken vid deployment. I App Service skulle exempelvis deployment slots kunna användas för detta. Azure Container Apps har stöd för revisioner och trafikstyrning mellan revisioner, vilket också skulle kunna användas för mer avancerade deploymentstrategier.

### Utveckling av autentiseringslösningen

Autentiseringen för CI/CD-flödet har förändrats under projektets gång. I en tidig version användes en publish profile för deployment till App Service och lagrades som en GitHub Secret, så att autentiseringsuppgifterna inte behövde lagras i repositoryt. När workflowen senare byggdes ut för att även provisionera infrastrukturen med Bicep ersattes publish profile med `azure/login` och `AZURE_CREDENTIALS`. Samma Azure-identitet kunde då användas för både provisionering och deployment.
I den nuvarande lösningen har den lösenordsbaserade autentiseringen ersatts med OIDC och en federerad credential. CI/CD-pipelinen behöver därför inget långlivat service principal-lösenord. Den aktuella OIDC-konfigurationen och övriga autentiseringslösningar beskrivs i kapitel 7.

### Serverless, datalagring och caching

Jag har även övervägt serverless-funktioner, persistent datalagring, caching och CDN. Dessa tjänster ingår inte i den nuvarande lösningen eftersom applikationen inte har behov som motiverar den extra infrastrukturen. Applikationen har inga tunga, schemalagda eller händelsedrivna uppgifter som behöver brytas ut till exempelvis en Azure Function. Den är också stateless och lagrar ingen persistent användardata, vilket innebär att replicas inte behöver dela tillstånd via en databas. Om persistent data infördes skulle den behöva lagras externt så att alla replicas kan komma åt samma information. Eftersom applikationen inte använder någon databas finns det heller inget aktuellt behov av en delad cache. Ett CDN skulle kunna användas för statiska resurser som bilder, CSS och JavaScript, men den extra infrastrukturen är inte motiverad för den nuvarande applikationen. Både caching och CDN kan bli relevanta om applikationens behov och användarbas växer.

## 10. Driftincidenter och lärdomar

### 001 – Fel tenant-ID

Azure CLI var sedan ett tidigare skolprojekt autentiserat mot en annan Microsoft Entra-tenant. Därför hittades inte min Azure-subscription trots att den fanns och var aktiv.

Problemet löstes genom att logga in mot rätt tenant:

```bash
az login --tenant <tenant-id>
```

Lärdomen är att kontrollera vilken tenant och subscription Azure CLI använder innan felsökning av infrastrukturen eller autentiseringskonfigurationen.

### 002 – Docker Engine var inte startad

Vid lokal testning av containerlösningen kunde Docker-kommandona inte köras. Docker CLI var installerat, men Docker Desktop var inte startat och kunde därför inte kommunicera med Docker Engine. Problemet löstes genom att starta Docker Desktop och köra kommandot igen. Lärdomen är att först kontrollera att Docker Engine körs när Docker-kommandon slutar fungera, innan felsökning av Dockerfile eller applikationen.

### 003 – Kapacitetsproblem vid provisionering av App Service
Vid en återuppbyggnad av miljön kunde App Service-planen med SKU `B1` inte provisioneras i West Europe. Azure returnerade ett kapacitetsfel eftersom det saknades tillgängliga instanser för den valda konfigurationen. Problemet låg alltså inte i Bicep-koden eller applikationen. För att kunna fortsätta arbetet användes tillfälligt `P0v3`, som kunde provisioneras i samma region. Den ordinarie konfigurationen är fortfarande två B1-instanser, medan den separata Premium-konfigurationen är en nödlösning med en `P0v3`-instans.
Vid den tillfälliga deploymenten var `instanceCount` satt till tre i parameterfilen, vilket gjorde att tre `P0v3`-instanser provisionerades trots att en hade varit tillräcklig. Parameterfilen korrigerades efteråt och resurserna revs när de inte längre behövdes för att undvika fortsatt Premium-kostnad. Incidenten visade värdet av att hålla SKU och antal instanser parametriserade i Bicep. Infrastrukturen kunde anpassas till ett externt kapacitetsproblem utan att resursdefinitionerna behövde skrivas om. Den visade också varför parameterfiler bör kontrolleras före deployment, särskilt när en dyrare SKU används.






























