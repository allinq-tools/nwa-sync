# TLC

Gamified trainingsplatform voor netwerkbeheer in de telecomsector: wekelijkse uitdagingen, XP, levels, streaks, een leaderboard en beloningen, plus een **challenge-builder** waarmee beheerders zelf uitdagingen maken.

## Starten

Je hebt Node.js 22.13 of nieuwer nodig. Externe packages zijn niet nodig (de app gebruikt de ingebouwde `node:sqlite`).

```bash
npm start
```

Open daarna http://localhost:3000. Bij de eerste start wordt de database (`data/uplink.db`) gevuld met voorbeelddata.

| Rol | Gebruikersnaam | Wachtwoord |
|---|---|---|
| Beheerder | `admin` | `admin123` |
| Deelnemer | `demo` | `demo123` |
| Fictieve collega's | bv. `packetpirate` | `welkom123` |

Opnieuw beginnen met verse voorbeelddata: `npm run seed`. Een andere poort kies je met `PORT=8080 npm start`.

> Verander de standaardwachtwoorden voordat je het platform echt in gebruik neemt.

## Functies

- **Uitdagingen**: profielkaart (level, XP, seizoens-XP, reputatie), een streak van 10 weken, een verhaallijn met de status van elke uitdaging (voltooid, open, gemist of vergrendeld) en per week een reguliere uitdaging en een bonusuitdaging.
- **Speler**: stappen met voortgangsbolletjes, directe feedback met uitleg en een XP-teller. Je kunt een uitdaging herstarten; alleen je beste poging telt mee.
- **Leaderboard**: ranglijsten voor de organisatie, groepen tegen elkaar en je eigen groep, te sorteren op seizoens-XP, totaal-XP en streak.
- **Beloningen**: automatisch ontgrendeld, met de datum waarop je ze haalde.
- **Beheer**:
  - **Challenge-builder** met 7 staptypes:
    - Uitleg
    - Meerkeuze (één antwoord)
    - Meerkeuze (meerdere antwoorden)
    - Waar/onwaar
    - Open antwoord (exact)
    - Volgorde bepalen
    - Combineren
  - Planning met publicatiedatum en deadline, en de status concept of gepubliceerd.
  - Uitdagingen dupliceren, testen, en importeren of exporteren als JSON.
  - Resultaten per vraag, om te zien welke onderwerpen extra aandacht nodig hebben.
  - Gebruikers en groepen beheren.

## Spelregels

- Elke goed beantwoorde vraag levert `xp_per_question` op (standaard 100).
- Wie vóór de deadline klaar is, krijgt +20% XP en laat de streak doorlopen.
- Reputatie is het percentage vragen dat je bij je eerste poging goed had.
- Levels:

| Level | Naam | Vanaf |
|---|---|---|
| 1 | Trainee | 0 XP |
| 2 | Engineer | 1.000 XP |
| 3 | Senior Engineer | 3.000 XP |
| 4 | Netwerkarchitect | 6.000 XP |
| 5 | NOC Legend | 12.000 XP |

Levels, beloningen en de tijdsbonus pas je aan in `src/game.js`.

## Structuur

```
server.js        HTTP-server (API + statische bestanden)
src/db.js        SQLite-schema, wachtwoord-hashing (scrypt)
src/game.js      Vraagcontrole, scoring, levels, streaks, beloningen
src/api.js       REST-API (auth, spelen, leaderboard, beheer)
src/seed.js      Voorbeeldcontent (9 uitdagingen + 2 bonus) en demodata
public/          Frontend (vanilla JS, geen build-stap)
```

De juiste antwoorden komen nooit bij de browser terecht: de server controleert elk antwoord.
