# Tutorial

## Vad appen är

*Viral Panic* är ett enkelt API som simulerar en tjänst som plötsligt kan få en kraftig trafikökning. Tanken är att appen ska representera en liten webbtjänst som på kort tid blir mer belastad än vanligt, till exempel efter att en kampanj, nyhet eller länk sprids snabbt.

Applikationen är medvetet enkel. Den innehåller några få endpoints som kan användas för att kontrollera att tjänsten är igång, hämta grundläggande information och simulera ett “panikläge”. Syftet är inte att bygga avancerad applikationslogik, utan att ha en tydlig och testbar tjänst som kan driftsättas på två olika sätt i Azure: med Azure App Service och som container med Azure Container Apps.

Projektets fokus ligger därför på driftsättning, skalbarhet och molninfrastruktur. Genom att hålla själva API:t enkelt blir det lättare att undersöka hur applikationen beter sig när den körs i molnet, hur flera instanser kan användas för lastbalansering och hur olika prisnivåer påverkar arkitekturvalet.

## Förutsättningar

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

## Så kör du den lokalt

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

## Infrastructure as Code med Bicep

Projektets Azure-infrastruktur definieras med Bicep och är uppdelad i två filer eftersom Viral Panic driftsätts på två olika sätt. `main.bicep` beskriver infrastrukturen för App Service-spåret, medan `container.bicep` beskriver infrastrukturen för containerspåret.

### App Service-infrastruktur

`main.bicep` skapar en App Service Plan och en Web App. I stället för att hårdkoda konfigurationen används parametrar för appnamn, App Service Plan-namn, region, planens storlek och antal instanser.

### Container-infrastruktur

`container.bicep` skapar ett Azure Container Registry (ACR), ett Container Apps Environment och en Container App. ACR används för att lagra den image som byggs med Docker. Container Appen hämtar sedan imagen från registret och kör applikationen i Container Apps-miljön.

### Reproducerbarhet

En fördel med Infrastructure as Code är att infrastrukturen finns dokumenterad i samma form som används för att skapa den. Om resurserna behöver tas bort kan de därför skapas igen med samma konfiguration utan att varje resurs behöver konfigureras manuellt i Azure-portalen. Det gör också infrastrukturen lättare att beskriva och återskapa för någon annan.
Bicep-filerna används av scripten `deploy-infra.sh`, `deploy-container.sh` och `provision-all.sh`. På så sätt kan provisioneringen automatiseras i stället för att resurserna behöver skapas manuellt steg för steg. Att infrastrukturen kan skapas reproducerbart sparar också tid. Samma konfiguration kan användas flera gånger utan att infrastrukturen behöver byggas upp manuellt från början vid varje tillfälle.

### Kontroll med what-if

Innan en deployment kan what-if användas för att förhandsgranska vilka förändringar Bicep-deploymenten skulle innebära. Det visar vilka resurser som kommer att skapas, ändras eller tas bort och gör det möjligt att kontrollera förändringarna innan de faktiskt genomförs. Det minskar risken för att resurser oavsiktligt ändras eller tas bort vid en deployment.

## Driftsättning till App Service

För deployment behöver Azure CLI vara autentiserad mot rätt tenant och subscription.

Kontrollera den aktiva Azure-kontexten:

```bash
az account show --output table
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

az webapp deploy använder en .zip-fil för deployment. Applikationen byggs och publiceras därför först, och projektfilen Beacon.Api.csproj innehåller ett ZipPublishOutput-target som automatiskt packar publiceringsresultatet till app.zip efter dotnet publish:

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

-----

### Skala ut till 2 instanser

```bash
az appservice plan update \
  --name app-clo25-martina \
  --resource-group rg-clo25-martina \
  --number-of-workers 2
  ```
## CI/CD – App Service

Deploymenten till Azure App Service automatiseras med GitHub Actions. Workflowen bygger och testar applikationen, ser till att infrastrukturen är provisionerad och driftsätter därefter den färdigpublicerade applikationen.

### När workflowen körs

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

`workflow_dispatch` gör det också möjligt att starta workflowen manuellt från GitHub.

Markdown-filer är undantagna med `paths-ignore`. En ändring som endast berör dokumentationen behöver därför inte starta en ny deployment till Azure.

### Workflowens jobb

Workflowen är uppdelad i tre jobb:

- `infra`
- `build`
- `deploy`

Deploy-jobbet har följande beroenden:

```yaml
needs: [build, infra]
```

Det innebär att både infrastrukturen och applikationsbygget måste vara färdiga innan deploymenten kan börja. `infra` och `build` kan däremot köras oberoende av varandra.

### Provisionering av infrastrukturen

`infra`-jobbet checkar först ut repositoryt så att runnern får tillgång till projektets filer. Därefter autentiserar workflowen mot Azure med credentials som lagras i GitHub-secreten `AZURE_CREDENTIALS`.

Efter autentiseringen körs projektets infrastrukturscript:

```bash
./scripts/deploy-infra.sh "$AZURE_RESOURCE_GROUP"
```

Scriptet använder Bicep-definitionen för App Service-infrastrukturen. Genom att köra infrastrukturdeploymenten som en del av workflowen kan den senaste versionen av Bicep-konfigurationen appliceras vid deployment. Om infrastrukturen har ändrats i repositoryt kan motsvarande förändringar därmed genomföras i Azure.

### Bygga och testa applikationen

`build`-jobbet använder en separat GitHub Actions-runner och checkar därför också ut repositoryt.

Därefter konfigureras .NET 10 SDK, som behövs för att bygga projektet. Applikationen byggs och testerna körs innan den får gå vidare till deployment.

Det fungerar som en kvalitetskontroll i pipeline-flödet. Om bygget eller testerna misslyckas ska den versionen inte driftsättas.

Efter testerna körs `dotnet publish`. Det skapar den publicerade version av applikationen som behövs för deployment.

### Artifact mellan jobben

Resultatet från `dotnet publish` laddas upp som ett GitHub Actions-artifact.

Det behövs eftersom jobben körs på separata runners och därför inte automatiskt delar samma filsystem. När build-jobbet är färdigt kan dess runner försvinna, medan den publicerade applikationen finns kvar som ett artifact.

Deploy-jobbet kan sedan ladda ner samma artifact. På så sätt är det den version av applikationen som har byggts och testats som går vidare till deployment, utan att applikationen behöver byggas om i deploy-jobbet.

### Deployment till App Service

När både `infra` och `build` har lyckats kan `deploy` starta.

Deploy-jobbet autentiserar sig mot Azure igen med `AZURE_CREDENTIALS`. Detta behövs eftersom jobbet körs på en egen runner och inte delar Azure-inloggningen från `infra`-jobbet.

Det publicerade artifactet hämtas och driftsätts därefter till App Service.

### Smoke test efter deployment

health-check.sh är ett smoke test som körs efter driftsättningen. Scriptet skickar HTTP-anrop till applikationens /health-endpoint och kontrollerar att servern svarar med statuskod 200 OK, vilket betyder att anropet kunde behandlas framgångsrikt. Om appen inte svarar direkt gör scriptet flera försök med fem sekunders mellanrum, eftersom applikationen kan behöva tid att starta efter en driftsättning.

Smoke-testet är värdefullt utöver pipelinens vanliga deployment-status eftersom en lyckad deployment endast visar att driftsättningssteget lyckades. Det garanterar inte att den nya versionen av applikationen faktiskt har startat och kan svara på HTTP-anrop. Health checken verifierar därför den driftsatta applikationen efter deployment. Om /health aldrig svarar med 200 avslutas scriptet med exit-kod 1, vilket gör att steget i pipelinen markeras som misslyckat.

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

## Driftsättning som container

För containerspåret behöver Viral Panic paketeras så att applikationen kan köras i en container. Dockerfilen beskriver hur applikationen ska byggas till en image och vilka delar som behövs för att sedan kunna köra den.
Dockerfilen använder en multi-stage build med två olika .NET-images. I det första steget används `mcr.microsoft.com/dotnet/sdk:10.0`. SDK står för *Software Development Kit* och innehåller verktygen som behövs för att bygga och publicera applikationen.

```</> dockerfile
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
```
När applikationen är färdigbyggd behövs inte längre hela SDK:n. Det slutliga steget använder därför mcr.microsoft.com/dotnet/aspnet:10.0, som innehåller det som behövs för att köra den färdigbyggda ASP.NET Core-applikationen.

```</> dockerfile
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
```

Genom att skilja på byggmiljön och den slutliga körmiljön behöver inte hela utvecklingsverktygslådan följa med i den färdiga imagen. Det ger en mindre image som bara innehåller det som behövs för att köra applikationen.

### Dockerfile och lokal verifiering

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

`--publish 8080:8080` kopplar port 8080 på den lokala datorn till port 8080 i containern, där Viral Panic lyssnar. `--rm` gör att testcontainern automatiskt tas bort när den stoppas.
När containern körs kan samma /health-endpoint som används i App Service-spåret användas för att verifiera applikationen:

```bash
./scripts/health-check.sh http://localhost:8080/health
``` 

Det fungerar eftersom det är samma Viral Panic-applikation som körs i båda fallen. Skillnaden är hur applikationen paketeras och driftsätts. I containerspåret byggs applikationen till en image som senare kan lagras i Azure Container Registry och köras av Azure Container Apps.

### Azure Container Registry

När Docker-imagen har byggts behöver den lagras på en plats där Azure Container Apps kan hämta den. I lösningen används Azure Container Registry (ACR) för detta. Projektets registry heter `acrclo25martina`.

När kod pushas till `main` startar GitHub Actions-workflowen för containerspåret. Efter att testerna har körts loggar workflowen in i Azure med credentials som finns lagrade i GitHub-secreten `AZURE_CREDENTIALS`.

Imagen byggs därefter i Azure Container Registry med `az acr build`:

```bash
az acr build \
  --registry "${{ env.ACR_NAME }}" \
  --image "${{ env.IMAGE_NAME }}:${{ github.sha }}" \
  --image "${{ env.IMAGE_NAME }}:latest" \
  --file src/Beacon.Api/Dockerfile \
  .
```

Imagen får två taggar: en tagg baserad på Git-commitens SHA och taggen `latest`. SHA-taggen gör det möjligt att koppla en image till exakt den version av koden som användes när imagen byggdes. `latest` kan flyttas till en ny image vid nästa build och används därför inte för att identifiera den version som ska driftsättas.

Vid deployment uppdateras Container Appen med imagen som har den aktuella commitens SHA:

```bash 
IMAGE="${{ env.ACR_NAME }}.azurecr.io/${{ env.IMAGE_NAME }}"

az containerapp update \
  --name "${{ env.CONTAINER_APP_NAME }}" \
  --resource-group "${{ env.AZURE_RESOURCE_GROUP }}" \
  --image "$IMAGE:${{ github.sha }}"
```

På så sätt kan den driftsatta versionen kopplas till en specifik Git-commit.

### Autentisering mot ACR

Container Appen behöver autentisera sig mot ACR för att kunna hämta imagen. I `container.bicep` konfigureras registryt med användarnamn från ACR och ett lösenord som lagras som en secret i Container Appen.

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

ACR:s admin-användare är aktiverad i den nuvarande lösningen för att denna autentisering ska fungera. Ett säkrare alternativ är att använda managed identity tillsammans med rollen AcrPull, vilket gör att registry-lösenord inte behöver användas. Detta är en möjlig säkerhetsförbättring av lösningen.

## Azure Container Apps

Viral Panic driftsätts även som en container med Azure Container Apps. Infrastrukturen för containerspåret definieras i `container.bicep` och består av ett Azure Container Registry, ett Container Apps Environment och en Container App.

### Container Apps Environment

Ett Container Apps Environment ger en gemensam miljö för en eller flera Container Apps och samlar funktioner som apparna kan behöva, exempelvis nätverksfunktioner. Environmentet är en separat Azure-resurs från de Container Apps som körs i det.

I projektet heter environmentet `cae-clo25-martina` och Viral Panic körs som Container Appen `ca-clo25-martina`.

Kopplingen mellan dem görs i Bicep:

```bicep
resource app 'Microsoft.App/containerApps@2026-01-01' = {
  name: containerAppName
  location: location
  properties: {
    managedEnvironmentId: environment.id
```

`managedEnvironmentId` anger vilket Container Apps Environment som Container Appen ska tillhöra.

### Ingress och HTTPS

För att Viral Panic ska vara tillgänglig från internet konfigureras extern ingress:

```bicep
ingress: {
  external: true
  targetPort: targetPort
  allowInsecure: false
  transport: 'auto'
}
```

`external: true` gör applikationen tillgänglig utanför Container Apps Environment. `targetPort` är satt till `8080`, vilket anger den port där applikationen lyssnar inne i containern. Detta motsvarar porten som används när containern körs lokalt med Docker.
`allowInsecure: false` innebär att osäker HTTP-trafik inte tillåts och omdirigeras till HTTPS.

### Initial image och senare deployments

När infrastrukturen först provisioneras anger `container.bicepparam` vilken image Container Appen ska använda:

```bicep
param containerImage = 'acrclo25martina.azurecr.io/beacon:v1'
```

Värdet skickas till container.bicep och används när containern konfigureras:

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

Detta skiljer provisionering av infrastrukturen från senare deployment av nya applikationsversioner. Bicep skapar och konfigurerar infrastrukturen med en initial image. När ny kod senare pushas till main bygger CI/CD-pipelinen en ny image och uppdaterar den befintliga Container Appen med imagen som är taggad med den aktuella Git-commitens SHA.
Infrastrukturen behöver därför inte skapas om för varje ny version av Viral Panic. Istället uppdateras vilken image den befintliga Container Appen kör.

### CPU och minne

Varje replica av Viral Panic konfigureras med 0.5 vCPU och 1.0Gi minne:

```bicep
param containerCpu string = '0.5'
param containerMemory string = '1.0Gi'
```

Värdena anger hur mycket beräkningskapacitet och arbetsminne varje körande replica får använda. Resurserna behöver vara tillräckliga för applikationens behov, samtidigt som onödigt hög resursallokering kan innebära högre kostnader.

### Replicas och lastbalansering

Azure Container Apps kan köra flera replicas av samma applikation. Varje replica är en separat körande instans av samma Viral Panic-image. När flera replicas är aktiva kan inkommande HTTP-trafik fördelas mellan dem genom Container Apps inbyggda lastbalansering. En request behöver därför inte hanteras av samma replica som föregående request.
Viral Panic innehåller endpointen `/info`, som returnerar bland annat:

```c#
machine = Environment.MachineName
```

Eftersom olika replicas kan ha olika machine-namn kan frontendens funktion *Observed Replicas* registrera vilka replicas som har svarat på requests under sessionen. Detta ger ett synligt sätt att demonstrera att trafik kan hanteras av olika körande instanser av samma applikation.
Observed Replicas visar vilka machine-namn klienten har observerat under den aktuella webbläsarsessionen. Listan visar inte hur trafiken är fördelad och ska inte tolkas som en lista över alla replicas som kör just nu. En tidigare observerad replica kan exempelvis ha skalats bort efter att den observerades.

### Stateless applikation
Viral Panic är stateless. Applikationen är inte beroende av att viktig state från en tidigare request finns lagrad lokalt i minnet hos en specifik replica.  
Det innebär att replicas är utbytbara. Om en request hanteras av en replica och nästa request av en annan behöver den andra replican inte känna till något lokalt tillstånd från den första för att kunna svara korrekt.
Detta gör Viral Panic lämplig för horisontell skalning eftersom flera replicas kan hantera trafik parallellt. Om en replica försvinner kan andra replicas fortsätta hantera requests utan att applikationen förlorar viktig state. Det gör att Container Apps kan skala både ut och in och fördela trafik mellan likadana replicas.
Om applikationen i stället hade lagrat viktig användardata endast lokalt i en replicas minne skulle nästa request kunna hamna hos en annan replica som saknade denna information. Sådan state skulle därför behöva lagras i en extern, delad lagringslösning om applikationen behövde den.


## Skalning i Container Apps

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

### Minsta och högsta antal replicas

`minReplicas` är satt till 1, vilket innebär att minst en replica hålls igång även när belastningen är låg. Container Apps kan även konfigureras med 0 som minimum och då skala ner applikationen helt när den inte används. Det kan minska resursanvändningen, men innebär att en ny replica först behöver startas när trafik kommer in igen.
`maxReplicas` är satt till 5 och sätter en övre gräns för autoskalningen. På så sätt kan Container Apps lägga till kapacitet när belastningen ökar utan att antalet replicas och resursanvändningen kan växa obegränsat.

### Skalning baserad på HTTP-trafik

Skalningsregeln använder `concurrentRequests` med värdet 20. Det innebär att antalet samtidiga HTTP-requests används som signal för hur många replicas som behövs.
Värdet är inte en hård gräns där request nummer 21 nekas. Det används av Container Apps autoscaler för att avgöra när applikationen behöver mer eller mindre kapacitet.
När belastningen ökar kan Container Apps skala ut genom att starta fler replicas, upp till `maxReplicas`. När belastningen minskar kan tjänsten skala in igen genom att ta bort replicas som inte längre behövs, men aldrig under `minReplicas`.
Själva beslutet om när replicas ska startas och stoppas hanteras av Azure Container Apps. Applikationskoden behöver därför inte själv känna till hur många replicas som körs.

### Horisontell skalning

Varje replica använder samma resurskonfiguration:

```bicep
resources: {
  cpu: json(containerCpu)
  memory: containerMemory
}
```

I projektet är detta 0.5 vCPU och 1.0 GiB minne per replica.
När applikationen skalar ut får alltså inte en befintlig replica mer CPU eller minne. I stället startas fler replicas med samma resurskonfiguration. Detta är horisontell skalning.
Vertikal skalning skulle i stället innebära att en enskild instans får mer CPU eller minne.

### Demonstrera autoskalning
För att demonstrera autoskalningen behöver applikationen utsättas för flera samtidiga requests. Att manuellt skicka många requests efter varandra är inte samma sak, eftersom tidigare requests kan hinna avslutas innan nästa skickas.
Ett load-testverktyg eller script kan därför användas för att skapa parallell trafik. Under testet kan antalet aktiva replicas observeras och `/info` kan användas för att se olika machine-namn när trafik hanteras av olika replicas.
Frontendens funktion Observed Replicas kan också användas för att synliggöra vilka replicas klienten har observerat under sessionen.

## CI/CD – Container Apps

Deploymenten till Azure Container Apps automatiseras med GitHub Actions. Till skillnad från App Service-spåret, där den publicerade applikationen överförs som ett GitHub Actions-artifact, paketeras applikationen här som en container-image. Imagen byggs och lagras i Azure Container Registry (ACR) och används sedan av Azure Container Apps.

Workflowen består av två jobs:

- `build-and-push`
- `deploy`

Deploy-jobbet har följande beroende:

```yaml
needs: build-and-push
```

Det innebär att deploymenten inte börjar förrän testerna har lyckats och container-imagen har byggts och lagrats i ACR.

### Test och autentisering

I `build-and-push` checkas repositoryt först ut och .NET 10 SDK konfigureras. Därefter körs projektets tester:

```bash
dotnet test --configuration Release
```

Om testerna misslyckas stoppas workflowen innan någon ny image byggs och driftsätts.

Efter testerna autentiserar sig GitHub Actions mot Azure med credentials som lagras i GitHub-secreten `AZURE_CREDENTIALS`. Det gör det möjligt för workflowen att utföra de Azure-operationer som behövs i de följande stegen.

### Bygga och lagra imagen i ACR

Container-imagen byggs med `az acr build`:

```bash
az acr build \
  --registry "${{ env.ACR_NAME }}" \
  --image "${{ env.IMAGE_NAME }}:${{ github.sha }}" \
  --image "${{ env.IMAGE_NAME }}:latest" \
  --file src/Beacon.Api/Dockerfile \
  .
```

`az acr build` innebär att imagen byggs med hjälp av Azure Container Registry i stället för att först byggas lokalt på GitHub Actions-runnern och därefter pushas till registret.

Den färdiga imagen lagras i ACR med två taggar:

```text
beacon:<github.sha>
beacon:latest
```

SHA-taggen baseras på den Git-commit som startade workflowen och gör det möjligt att koppla en image till en specifik version av koden. Taggen `latest` kan däremot flyttas till en ny image vid nästa build och används därför inte för att identifiera den version som ska driftsättas.

### Deployment med SHA-tagg

När `build-and-push` har lyckats startar `deploy`-jobbet. Även detta jobb autentiserar sig mot Azure eftersom det körs på en separat GitHub Actions-runner.

Container Appen uppdateras därefter med imagen som har den aktuella commitens SHA:

```bash
IMAGE="${{ env.ACR_NAME }}.azurecr.io/${{ env.IMAGE_NAME }}"

az containerapp update \
  --name "${{ env.CONTAINER_APP_NAME }}" \
  --resource-group "${{ env.AZURE_RESOURCE_GROUP }}" \
  --image "$IMAGE:${{ github.sha }}"
```

Container Apps-infrastrukturen behöver alltså inte skapas på nytt vid varje kodändring. Bicep används för att skapa och konfigurera infrastrukturen, medan CI/CD-pipelinen kan uppdatera den befintliga Container Appen så att den kör en ny version av imagen.

Vid den första provisioneringen anges en initial image i `container.bicepparam`:

```bicep
param containerImage = 'acrclo25martina.azurecr.io/beacon:v1'
```

Efterföljande deployments uppdaterar sedan den befintliga Container Appen till den image som hör till den aktuella Git-commiten.

### Revisioner

När Container Appen uppdateras med en ny image rullas en ny revision ut. En revision representerar en version av Container Appens konfiguration. I denna pipeline är den viktigaste förändringen att en ny container-image används.

Container Apps har stöd för att arbeta med flera revisioner och mer avancerad trafikstyrning, men den nuvarande lösningen använder inte någon blue/green- eller canary-strategi. Pipelinen uppdaterar Container Appen till den nya SHA-taggade imagen.

### ACR som överlämning mellan jobben

Till skillnad från App Service-workflowen behöver containerspåret inget GitHub Actions-artifact för att föra den byggda applikationen mellan jobben.

När `build-and-push` är färdigt finns imagen redan lagrad i ACR:

```text
acrclo25martina.azurecr.io/beacon:<github.sha>
```

Deploy-jobbet behöver därför inte hämta några byggda applikationsfiler från det tidigare jobbet. Det anger i stället vilken image Container Appen ska använda, och Container Appen kan sedan hämta imagen från ACR.

De två deploymentspåren använder alltså olika sätt att överföra den version som ska driftsättas:

```text
App Service:
kod → publish → GitHub artifact → App Service

Container Apps:
kod + Dockerfile → ACR build → image i ACR → Container Apps
```

### Autentisering i två steg

Containerspåret innehåller två olika autentiseringsrelationer.

GitHub Actions autentiserar sig mot Azure med `AZURE_CREDENTIALS` för att kunna utföra Azure-operationer, exempelvis att uppdatera Container Appen.

Container Appen behöver i sin tur kunna autentisera sig mot ACR för att hämta den privata imagen. I den nuvarande lösningen görs detta med ACR:s admin-användare och ett lösenord som lagras som en secret i Container Appen.

Dessa två autentiseringar har alltså olika syften: GitHub behöver behörighet att genomföra deploymenten, medan Container Appen behöver behörighet att hämta imagen som den ska köra.

### Health check efter deployment

Efter att den nya revisionen har rullats ut hämtar workflowen Container Appens FQDN och kör projektets befintliga `health-check.sh` mot:

```text
https://<container-appens-fqdn>/health
```

En lyckad `az containerapp update` visar att Azure accepterade och genomförde uppdateringen, men garanterar inte i sig att den nya versionen av applikationen har startat korrekt och kan svara på HTTP-anrop.

Health checken fungerar därför som ett smoke test efter deployment och verifierar den faktiskt körande applikationen.

Samma `/health`-endpoint och samma health-check-script kan användas för både App Service och Container Apps trots att applikationen paketeras och driftsätts på olika sätt.


## Autentisering och secrets

Lösningen behöver hantera autentisering i flera olika delar av deploymentflödet. GitHub Actions behöver autentisera sig mot Azure för att kunna genomföra deployments, medan Container Appen behöver autentisera sig mot Azure Container Registry för att kunna hämta sin container-image.

Hemligheter lagras inte direkt i repositoryt. I stället används GitHub Secrets och Container Apps secrets beroende på vilken komponent som behöver använda informationen.

### GitHub Actions mot Azure

GitHub Actions autentiserar sig mot Azure med `azure/login`:

```yaml
- uses: azure/login@v3
  with:
    creds: ${{ secrets.AZURE_CREDENTIALS }}
```

`AZURE_CREDENTIALS` lagras som en GitHub Secret och själva autentiseringsuppgifterna behöver därför inte skrivas direkt i workflow-filen eller checkas in i Git-repositoryt.

Autentisering och auktorisering fyller två olika funktioner. Autentiseringen verifierar vilken identitet workflowen använder. Därefter avgör identitetens behörigheter vilka operationer den får utföra i Azure.

Att autentiseringen lyckas innebär därför inte automatiskt att identiteten får utföra alla operationer. Om identiteten exempelvis saknar behörighet att uppdatera en Container App kommer motsvarande deploymentsteg att misslyckas.

### Container App mot ACR

Container Appen behöver kunna autentisera sig mot ACR för att hämta den privata image som ska köras.

I den nuvarande lösningen är ACR:s admin-användare aktiverad:

```bicep
properties: {
  adminUserEnabled: true
}
```

Registry-konfigurationen använder ACR:s användarnamn och refererar till ett lösenord som lagras som en secret i Container Appen:

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

Själva lösenordet är alltså inte hårdkodat i Bicep-filen. `acr.listCredentials()` hämtar credentials från ACR vid deploymenten och lösenordet lagras som en Container App-secret. Registry-konfigurationen refererar sedan till denna secret med `passwordSecretRef`.

### Secrets lagras där de används

De två typerna av credentials används av olika komponenter och lagras därför på olika ställen.

`AZURE_CREDENTIALS` används av GitHub Actions och lagras som en GitHub Secret. ACR-lösenordet används däremot av Container Appen och lagras som en Container App-secret i Azure.

På så sätt behöver en komponent inte få tillgång till credentials som den inte behöver för sitt eget arbete.

### Principle of least privilege

En viktig säkerhetsprincip är *principle of least privilege*, vilket innebär att en identitet endast bör få de behörigheter som krävs för dess uppgift.

Container Appens uppgift i förhållande till ACR är att kunna hämta den image som ska köras. Den behöver därför egentligen inte generell administrativ åtkomst till registret.

Den nuvarande lösningen med ACR:s admin-användare är en enklare lösning för projektet, men innebär att ett administrativt användarnamn och lösenord behöver hanteras.

### Möjlig förbättring med managed identity

En säkrare vidareutveckling skulle vara att använda en managed identity för Container Appen och ge denna identitet rollen `AcrPull` på registret.

Container Appen skulle då autentiseras med sin Azure-identitet och auktoriseras att hämta images från ACR genom den tilldelade rollen. Det skulle göra det möjligt att ta bort beroendet av ACR:s admin-lösenord och ge Container Appen en mer begränsad behörighet som motsvarar det den faktiskt behöver göra.

Den nuvarande lösningen kan därför sammanfattas som:

```text
GitHub Actions
      |
      | AZURE_CREDENTIALS
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

Secrets ska inte hårdkodas i kod, Bicep-filer eller workflow-filer som versionshanteras.

Om en secret av misstag checkas in i Git räcker det inte att enbart ta bort värdet i en senare commit, eftersom det kan finnas kvar i repositoryts historik. Den exponerade credentialen bör därför betraktas som komprometterad och roteras så att det gamla värdet inte längre är giltigt.

Efter rotation behöver den nya credentialen uppdateras där den legitima hemligheten används, exempelvis i GitHub Secrets eller motsvarande Azure-konfiguration.

## Återskapa hela miljön

Eftersom infrastrukturen definieras som kod och projektet innehåller scripts för provisionering behöver resurserna inte återskapas manuellt en i taget.

För att återskapa lösningen från ett tomt Azure-läge behöver först rätt Azure-subscription väljas och GitHub-secreten `AZURE_CREDENTIALS` konfigureras med en identitet som har de behörigheter som deploymenten behöver.

Projektet kan därefter byggas och testas lokalt:

```bash
dotnet build
dotnet test
```

Azure-infrastrukturen för båda deploymentspåren kan provisioneras med projektets script:

```bash
./scripts/provision-all.sh rg-clo25-martina acrclo25martina
```

Scriptet använder projektets Bicep-definitioner för att skapa resurserna för App Service-spåret och Container Apps-spåret.

Efter att infrastrukturen finns kan GitHub Actions-workflowsen användas för att driftsätta applikationen. Båda workflowsen kan startas manuellt med `workflow_dispatch` och körs även automatiskt vid relevanta pushes till `main`.

App Service-workflowen bygger och publicerar .NET-applikationen och driftsätter resultatet till Web Appen. Container Apps-workflowen bygger en container-image i ACR och uppdaterar Container Appen med den SHA-taggade imagen.

Efter respektive deployment körs samma `/health`-endpoint för att verifiera att applikationen har startat och går att nå.

De tidigare kapitlen beskriver varje steg mer detaljerat, inklusive lokal körning, manuell App Service-deployment, Docker-verifiering, Bicep-provisionering och respektive CI/CD-flöde.


## App Service jämfört med Container Apps

Viral Panic driftsätts på två olika sätt i Azure: som en vanlig .NET-applikation i Azure App Service och som en container i Azure Container Apps. Båda spåren använder samma applikationskod och endpoints, men skiljer sig åt i hur applikationen paketeras, vilken infrastruktur som krävs och hur skalningen hanteras.

### Paketering och deployment

I App Service-spåret byggs och publiceras .NET-applikationen med `dotnet publish`. Det publicerade resultatet används sedan vid deployment till Web Appen. App Service tillhandahåller den körmiljö som applikationen behöver.

I Container Apps-spåret paketeras applikationen i stället som en container-image. Dockerfilen definierar både hur applikationen byggs och vilken runtime-image den färdiga applikationen ska köras med:

```dockerfile
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
```

Container-imagen innehåller därmed applikationen tillsammans med den runtime-miljö som imagen definierar. Imagen byggs och lagras i ACR och används sedan för att starta containers i Azure Container Apps.

Det gör container-imagen till en standardiserad och versionsbar enhet som kan köras på kompatibla containerplattformar.

### Infrastruktur

De två spåren behöver olika Azure-resurser och infrastrukturen är därför uppdelad i separata Bicep-filer.

App Service-spåret använder:

```text
App Service Plan
└── Web App
```

Container-spåret använder:

```text
Azure Container Registry
Container Apps Environment
└── Container App
```

`main.bicep` ansvarar för App Service-infrastrukturen och `container.bicep` för containerinfrastrukturen. Uppdelningen gör att respektive fil kan beskriva de resurser och inställningar som behövs för just den deploymentmodellen.

### Skalning

En tydlig skillnad mellan de två implementationerna är hur skalningen är konfigurerad.

App Service-spåret använder B1 och antalet instanser konfigureras manuellt. Den nuvarande lösningen skalar därför inte automatiskt ut eller in när belastningen förändras.

Container Apps-spåret är däremot konfigurerat för automatisk horisontell skalning:

```text
minReplicas = 1
maxReplicas = 5
concurrentRequests = 20
```

Container Apps kan därför öka antalet replicas när den samtidiga HTTP-belastningen ökar och minska antalet igen när belastningen sjunker, inom de konfigurerade gränserna.

### Versionshantering av container-images

Container-workflowen taggar varje image med Git-commitens SHA:

```text
beacon:<github.sha>
```

Container Appen uppdateras sedan med den SHA-taggade imagen. Det ger spårbarhet mellan en driftsatt container-image och den specifika Git-commit som användes för att bygga den.

Imagen får även taggen `latest`, men deploymenten använder SHA-taggen eftersom `latest` kan flyttas till en ny image vid nästa build.

### Gemensamma delar

Trots skillnaderna är en stor del av lösningen gemensam. Båda spåren använder samma Viral Panic-applikation och samma endpoints, exempelvis `/health`, `/info` och `/panic`.

Båda GitHub Actions-workflowsen triggas automatiskt vid relevanta pushes till `main` och kan även startas manuellt med `workflow_dispatch`. Tester körs före deployment och samma `/health`-endpoint och health-check-script används för att verifiera applikationen efter deployment.

Skillnaden ligger därför framför allt i hur samma applikation paketeras och vilken Azure-plattform som kör den.

### Val mellan App Service och Container Apps

I detta projekt används båda alternativen för att demonstrera två olika deploymentmodeller för samma applikation. I ett verkligt projekt behöver samma applikation inte automatiskt driftsättas med båda modellerna.

Valet beror på lösningens behov. Faktorer som kan påverka är bland annat applikationens krav på körmiljö och paketering, hur belastningen varierar, behovet av automatisk skalning och hur mycket kontroll över den körbara miljön som behövs.

App Service gör det möjligt att driftsätta den publicerade .NET-applikationen direkt till en managed webbplattform utan att själv paketera den som en container. Containerlösningen innebär fler komponenter, exempelvis Dockerfile, container-images och ACR, men ger samtidigt en tydligt definierad och versionsbar körbar image.

Container Apps-spåret i Viral Panic visar dessutom hur replicas kan skapas och tas bort automatiskt från samma image när belastningen förändras.

Det finns därför inte ett generellt val som passar alla applikationer. De två modellerna löser delvis samma problem på olika sätt och valet behöver göras utifrån applikationens och driftmiljöns krav.

## Beslut jag tagit

### Val av projektnamn

När jag började bygga upp projektet gav jag det namnet som var föreslaget i uppgiften (Beacon). Någon vecka in bestämde jag mig för att kalla projektet för Viral Panic. Jag valde ändå att låta projektnamnet vara Beacon för att minska risken för att förstöra flöden om jag skulle ändra namespaces och annat. Det är ändå inget som syns om någon skulle besöka min applikation. 

### Val av app-idé

Jag valde att bygga Viral Panic eftersom idén med en tjänst som plötsligt går viral passar bra ihop med uppgiftens fokus på skalbarhet och lastbalansering. Det ger mig också möjlighet att på ett enkelt och lite roligare sätt demonstrera vad som händer när applikationen behöver hantera en trafikspik.

### Val av tier

Jag övervägde både B1 och P1v3. P1v3 ger tillgång till fler funktioner, exempelvis autoscale och deployment slots, men för Viral Panic valde jag B1 eftersom syftet i detta steg främst är att demonstrera flera instanser och lastbalansering till en lägre kostnad.
Jag valde att köra App Service-planen med två B1-instanser. En enda instans hade varit billigare, men hade inte gett samma möjlighet att demonstrera hur trafik kan hanteras av flera instanser. Dessutom skulle applikationen vara beroende av att den enda instansen var tillgänglig.
Tre instanser hade gett ytterligare kapacitet och redundans, men också högre kostnad. För den här applikationen bedömde jag inte att den extra instansen gav tillräcklig nytta för att motivera kostnaden. Två instanser blev därför en kompromiss: tillräckligt för att demonstrera lastbalansering och ge redundans på instansnivå, utan att köra fler instanser än projektet behöver.
B1 har inte stöd för den autoskalning som jag använder i Container Apps-spåret. Antalet App Service-instanser är därför konfigurerat till två, medan Container Apps får demonstrera automatisk horisontell skalning utifrån belastning.

#### Prisjämförelse

Prisjämförelsen gjordes för Sweden Central, medan resurserna i laborationen driftsattes i West Europe. Detta på grund av att Sweden Central hade varit det mest logiska att välja eftersom vi bor i Sverige, men i praktiken gick detta inte att välja när jag skulle bygga min App Service och jag valde därför att bygga den i West Europe istället. 

| Tier | Instanser | Region | OS | Kostnad/månad |
|---|---:|---|---|---:|
| Basic B1 | 1 | West Europe | Linux | 13.14 USD |
| Basic B1 | 3 | West Europe | Linux | 39.42 USD |
| Basic B3 | 1 | West Europe | Linux | 51.83 USD |
| Basic B3 | 3 | West Europe | Linux | 155.49 USD |
| Premium V3 | 1 | West Europe | Linux | 64.97 USD |
| Container Registry Basic | 1 | — | — | 5.00 USD |

*Priserna kontrollerades i september 2026 och används som uppskattningar för arkitekturjämförelsen*

Tre B1-instanser kostade vid jämförelsetillfället cirka 39.42 USD/månad, jämfört med 64.97 USD/månad för en P1v3-instans. För Viral Panic prioriterade jag i detta skede flera instanser eftersom de gör det möjligt att demonstrera lastbalansering och redundans, medan funktionerna i Premium V3 inte var nödvändiga för den här delen av lösningen.

### Driftsättningsstrategi

Jag har valt en enkel automatiserad driftsättningsstrategi för båda deploymentspåren. När en deployment genomförs byggs och testas applikationen först innan den nya versionen driftsätts. Efter deployment körs även en health check mot /health för att verifiera att den körande applikationen går att nå.
I App Service-spåret publiceras applikationen och driftsätts till den befintliga Web Appen. I Container Apps-spåret byggs i stället en container-image som taggas med aktuell Git-commits SHA och lagras i ACR. Container Appen uppdateras därefter till den SHA-taggade imagen, vilket gör det möjligt att koppla den driftsatta versionen till en specifik commit.
Lösningen använder inte någon blue/green- eller canary-strategi. Viral Panic är en liten och stateless applikation och för projektets syfte har jag därför valt att prioritera en enkel och reproducerbar deploymentprocess framför en mer avancerad release-strategi.
För en mer verksamhetskritisk applikation hade en strategi där den nya versionen verifieras innan all trafik flyttas över kunnat minska risken vid deployment. I App Service skulle exempelvis deployment slots kunna användas för detta. Azure Container Apps har stöd för revisioner och trafikstyrning mellan revisioner, vilket också skulle kunna användas för mer avancerade deploymentstrategier.

### Rolling deployment, blue/green eller canary?

Driftsättningen sker direkt till den befintliga App Service-instansen och använder alltså inte exempelvis blue/green- eller canary-deployment. För en liten applikation som Viral Panic är den enklare strategin tillräcklig i detta skede. För en mer verksamhetskritisk applikation hade exempelvis deployment slots och blue/green deployment kunnat minska risken vid nya releaser genom att den nya versionen verifieras innan trafiken flyttas över.

### Hantering av autentiseringsuppgifter

I en tidigare version av App Service-workflowen använde jag en publish profile för deployment. Publish-profilen lagrades i GitHub Secrets som AZURE_WEBAPP_PUBLISH_PROFILE så att autentiseringsuppgifterna inte behövde lagras direkt i repositoryt. Jag skapade även scripts/refresh-secret.sh för att kunna hämta en ny publish profile från Azure och uppdatera GitHub-secreten vid behov.
När CI/CD-flödet senare byggdes ut till att även provisionera infrastrukturen med Bicep ändrade jag autentiseringen. Den nuvarande workflowen använder i stället azure/login tillsammans med GitHub-secreten AZURE_CREDENTIALS. Samma Azure-inloggning kan då användas för de Azure-operationer som workflowen behöver utföra, både för provisionering av infrastrukturen och deployment av applikationen.
Publish profile används därför inte längre av den nuvarande App Service-workflowen. AZURE_CREDENTIALS är i stället den autentiseringslösning som används av GitHub Actions mot Azure.
Container Apps-spåret har dessutom en separat autentiseringsrelation. Container Appen behöver kunna hämta sin privata image från ACR. I den nuvarande lösningen används ACR:s admin-användare och ett lösenord som lagras som en secret i Container Appen. För projektets omfattning är detta en enkel lösning, men en möjlig förbättring är att använda managed identity tillsammans med rollen AcrPull, vilket skulle minska behovet av att hantera ACR:s admin-credentials.

AZURE_CREDENTIALS behålls tills OIDC bevisats över en rivning,
inte bara över en push.

### Serverless, datalagring och caching

Jag har även övervägt om Viral Panic skulle ha nytta av serverless-funktioner, persistent datalagring, caching eller CDN. I den nuvarande lösningen har jag valt att inte lägga till dessa tjänster eftersom applikationen inte har något behov som motiverar dem.
Viral Panic är en liten webbapplikation och har i nuläget ingen tung, schemalagd eller händelsedriven uppgift som behöver brytas ut från applikationen. En Azure Function skulle därför främst innebära ytterligare infrastruktur utan att lösa ett befintligt problem. Om applikationen exempelvis hade haft bakgrundsarbete som bildbehandling eller schemalagda uppgifter hade serverless kunnat vara ett mer relevant alternativ.
Applikationen lagrar inte heller någon persistent användardata. Den är stateless och replicas behöver därför inte dela tillstånd via en databas. Om persistent data infördes skulle den behöva lagras externt så att alla replicas kan komma åt samma information.
Eftersom Viral Panic inte använder någon databas finns det i nuläget inte heller återkommande databasfrågor som behöver avlastas med en delad cache. Caching skulle kunna bli relevant om applikationen senare fick data som läses ofta men ändras sällan.
Ett CDN skulle kunna användas för applikationens statiska resurser, exempelvis bilder, CSS och JavaScript, och distribuera dem närmare användarna. För den nuvarande lilla applikationen bedömde jag dock att den extra infrastrukturen inte är motiverad. Vid en större och geografiskt distribuerad användarbas skulle detta kunna vara ett relevant nästa steg.

## Driftincidenter

- **001 – Fel tenant-ID:** Azure CLI var sedan ett tidigare skolprojekt autentiserat mot en annan Microsoft Entra-tenant. Det gjorde att min Azure-subscription inte hittades. Problemet löstes genom att logga in mot rätt tenant med `az login --tenant <tenant-id>`.

- **002 – Docker Engine var inte startad:** Vid lokal testning av containerlösningen kunde Docker-kommandona inte köras eftersom Docker Desktop inte var startat. Docker CLI fanns installerat, men kunde inte kommunicera med Docker Engine som bygger images och kör containers. Problemet löstes genom att starta Docker Desktop och därefter köra kommandot igen.




