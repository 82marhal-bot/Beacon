# Viral Panic

En liten webbapp som byggs vidare på under kursen Skalbara molnapplikationer.

![src/images/sture-calm.png](/src/images/sture-calm.png)

*Viral Panic* är ett enkelt API som simulerar en tjänst som plötsligt kan få en kraftig trafikökning. Tanken är att appen ska representera en liten webbtjänst som på kort tid blir mer belastad än vanligt, till exempel efter att en kampanj, nyhet eller länk sprids snabbt.

Applikationen är medvetet enkel. Den innehåller några få endpoints som kan användas för att kontrollera att tjänsten är igång, hämta grundläggande information och simulera ett “panikläge”. Syftet är inte att bygga avancerad applikationslogik, utan att ha en tydlig och testbar tjänst som kan driftsättas till Azure App Service.

Projektets fokus ligger därför på driftsättning, skalbarhet och molninfrastruktur. Genom att hålla själva API:t enkelt blir det lättare att undersöka hur applikationen beter sig när den körs i molnet, hur flera instanser kan användas för lastbalansering och hur olika prisnivåer påverkar arkitekturvalet.

Rör full dokumentation, läs: [src/docs/TUTORIAL.md](src/docs/TUTORIAL.md).