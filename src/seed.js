'use strict';
// Vult de database met groepen, gebruikers, voorbeelduitdagingen en (fictieve) speelhistorie.
const { db, hashPassword, tx, DB_PATH } = require('./db');
const fs = require('node:fs');

const DAY = 864e5;
const WEEK = 7 * DAY;

const S = (type, title, extra = {}) => ({ type, title, body: '', explanation: '', data: {}, ...extra });

const CHALLENGES = [
  {
    number: 1, title: 'IPv4-subnetting: de basis', category: 'IP-adressering', icon: 'network', difficulty: 1,
    summary: 'Zonder goede adressering geen netwerk. Fris je kennis van CIDR, subnetmaskers en host-berekeningen op.',
    steps: [
      S('info', 'CIDR in het kort', { body: 'Met **CIDR-notatie** geef je aan hoeveel bits van een IPv4-adres bij het netwerkdeel horen. Een **/24** betekent 24 netwerkbits en 8 hostbits.\n- Aantal adressen: 2^(32 − prefix)\n- Bruikbare hosts: dat aantal min 2 (netwerk- en broadcastadres)\n- Uitzondering: `/31` voor point-to-point links (RFC 3021)' }),
      S('single', 'Hoeveel bruikbare hostadressen heeft een /26-subnet?', { data: { options: ['30', '62', '64', '126'], correct: 1 }, explanation: 'Een /26 heeft 6 hostbits: 2^6 = 64 adressen. Min het netwerk- en broadcastadres blijven er 62 over.' }),
      S('text', 'Wat is het netwerkadres van 192.168.10.77/27?', { body: 'Typ het adres in, bijvoorbeeld `10.0.0.0`.', data: { accepted: ['192.168.10.64'] }, explanation: 'Een /27 werkt in blokken van 32: .0, .32, .64, .96 … Adres .77 valt in het blok .64–.95.' }),
      S('single', 'Welk subnetmasker hoort bij /22?', { data: { options: ['255.255.252.0', '255.255.254.0', '255.255.248.0', '255.255.255.252'], correct: 0 }, explanation: '/22 = 8 + 8 + 6 bits. Zes enen in het derde octet: 11111100 = 252.' }),
      S('text', 'Wat is het broadcastadres van 10.20.30.40/29?', { data: { accepted: ['10.20.30.47'] }, explanation: 'Een /29 werkt in blokken van 8. .40 is het begin van het blok .40–.47, dus .47 is broadcast.' }),
      S('truefalse', 'Een /31-prefix kan gebruikt worden op point-to-point links.', { data: { correct: true }, explanation: 'Volgens RFC 3021 mag een /31 op point-to-point links: beide adressen zijn dan bruikbaar. Dat bespaart adresruimte in het transportnetwerk.' }),
    ],
  },
  {
    number: 2, title: 'Het OSI-model in de praktijk', category: 'Netwerkfundamenten', icon: 'layers', difficulty: 1,
    summary: 'Het OSI-model is de gemeenschappelijke taal van elke netwerkbeheerder. Weet jij op welke laag je moet zoeken?',
    steps: [
      S('info', 'Zeven lagen, één verhaal', { body: 'Het **OSI-model** deelt netwerkcommunicatie op in zeven lagen. Bij storingen werk je ze vaak systematisch af: eerst de **fysieke laag** (kabels, licht, poorten), dan **datalink** (MAC, VLAN), dan **netwerk** (IP, routering) enzovoort.' }),
      S('order', 'Zet de OSI-lagen in de juiste volgorde, van laag 1 naar laag 7.', { data: { items: ['Fysiek', 'Datalink', 'Netwerk', 'Transport', 'Sessie', 'Presentatie', 'Applicatie'] }, explanation: 'Ezelsbruggetje: "Please Do Not Throw Sausage Pizza Away".' }),
      S('match', 'Koppel elk protocol aan de juiste OSI-laag.', { data: { pairs: [{ left: 'Ethernet', right: 'Laag 2 – Datalink' }, { left: 'IPv4', right: 'Laag 3 – Netwerk' }, { left: 'TCP', right: 'Laag 4 – Transport' }, { left: 'HTTP', right: 'Laag 7 – Applicatie' }] } }),
      S('single', 'Op welke OSI-laag beslist een router over het doorsturen van pakketten?', { data: { options: ['Laag 2', 'Laag 3', 'Laag 4', 'Laag 7'], correct: 1 }, explanation: 'Routers kijken naar het IP-adres (laag 3) en hun routeringstabel.' }),
      S('multi', 'Welke van de volgende hoort bij laag 2?', { body: 'Meerdere antwoorden zijn juist.', data: { options: ['MAC-learning op een switch', 'Spanning Tree Protocol (STP)', 'OSPF', 'VLAN-tagging (802.1Q)', 'BGP'], correct: [0, 1, 3] }, explanation: 'OSPF en BGP zijn routeringsprotocollen en horen bij laag 3 (BGP draait zelf over TCP).' }),
    ],
  },
  {
    number: 3, title: "VLAN's en 802.1Q-trunks", category: 'Switching', icon: 'switch', difficulty: 1,
    summary: "VLAN's scheiden klanten, diensten en beheerverkeer. Een verkeerde trunk-configuratie is zo gemaakt: test je kennis.",
    steps: [
      S('info', 'Tags op de lijn', { body: 'Met **IEEE 802.1Q** voeg je een tag aan een Ethernet-frame toe met daarin onder meer een **12-bits VLAN-ID**. Zo kunnen meerdere VLAN\'s over één **trunk** lopen. Providers stapelen vaak tags (QinQ) om klant-VLAN\'s transparant te transporteren.' }),
      S('single', 'Hoeveel bytes voegt een 802.1Q-tag toe aan een Ethernet-frame?', { data: { options: ['2', '4', '8', '12'], correct: 1 }, explanation: 'De tag bestaat uit een TPID (2 bytes, 0x8100) en een TCI (2 bytes, met PCP, DEI en VLAN-ID).' }),
      S('text', "Hoeveel bruikbare VLAN-ID's zijn er met 802.1Q?", { body: "De gereserveerde ID's 0 en 4095 tellen niet mee.", data: { accepted: ['4094'] }, explanation: '12 bits = 4096 waarden. Zonder 0 en 4095 blijven 4094 bruikbare ID\'s over (1–4094).' }),
      S('truefalse', 'Frames in de native VLAN worden op een 802.1Q-trunk standaard ongetagd verstuurd.', { data: { correct: true }, explanation: 'Daarom is het een best practice om de native VLAN te wijzigen naar een ongebruikt VLAN, of native tagging af te dwingen.' }),
      S('multi', 'Welke maatregelen helpen tegen VLAN hopping?', { data: { options: ['Native VLAN wijzigen naar een ongebruikt VLAN', 'Automatische trunk-onderhandeling (DTP) uitschakelen op access-poorten', 'Alle poorten als trunk configureren', "Ongebruikte poorten uitschakelen en in een 'parkeer'-VLAN zetten"], correct: [0, 1, 3] } }),
      S('single', 'Welke standaard beschrijft QinQ (gestapelde VLAN-tags) voor providernetwerken?', { data: { options: ['802.1Q', '802.1ad', '802.1X', '802.3ad'], correct: 1 }, explanation: '802.1ad (Provider Bridging). 802.1X is poortauthenticatie, 802.3ad is link-aggregatie (LACP).' }),
    ],
  },
  {
    number: 4, title: 'OSPF: link-state routing', category: 'Routing', icon: 'router', difficulty: 2,
    summary: 'OSPF is het werkpaard van veel IGP-netwerken. Hoe vormen routers een adjacency en hoe zijn areas opgebouwd?',
    steps: [
      S('info', 'Iedereen kent de kaart', { body: 'Bij **OSPF** bouwt elke router binnen een area dezelfde **link-state database** op en berekent met het **SPF-algoritme (Dijkstra)** de kortste paden. Area 0 vormt de ruggengraat: andere areas moeten daaraan gekoppeld zijn.' }),
      S('single', 'Hoe heet OSPF-area 0?', { data: { options: ['Stub area', 'Backbone area', 'NSSA', 'Totally stubby area'], correct: 1 } }),
      S('multi', 'Welke parameters moeten overeenkomen om een OSPF-adjacency te vormen?', { data: { options: ['Hello- en dead-interval', 'Area-ID', 'Router-ID', 'Subnet en subnetmasker van de link', 'Authenticatie-instellingen', 'OSPF-proces-ID (Cisco)'], correct: [0, 1, 3, 4] }, explanation: 'Het router-ID moet juist uniek zijn. Het proces-ID is lokaal en hoeft niet gelijk te zijn. Let in de praktijk ook op de MTU: bij een mismatch blijft de buur hangen in ExStart/Exchange.' }),
      S('order', 'Zet de OSPF-neighbor-states in de juiste volgorde.', { data: { items: ['Down', 'Init', '2-Way', 'ExStart', 'Exchange', 'Loading', 'Full'] } }),
      S('single', 'Welk IP-protocolnummer gebruikt OSPF?', { data: { options: ['6', '17', '89', '179'], correct: 2 }, explanation: 'OSPF draait direct op IP (protocol 89). 6 = TCP, 17 = UDP en 179 is de TCP-poort van BGP.' }),
      S('truefalse', 'Op een broadcast-netwerk zoals Ethernet kiest OSPF een DR en een BDR.', { data: { correct: true }, explanation: 'De Designated Router beperkt het aantal adjacencies. Op point-to-point links is er geen DR/BDR-verkiezing.' }),
    ],
  },
  {
    number: 5, title: 'BGP: routering tussen providers', category: 'Routing', icon: 'globe', difficulty: 3,
    summary: 'BGP verbindt het internet. Ken jij de attributen en regels die bepalen welk pad je verkeer kiest?',
    steps: [
      S('info', 'Het protocol van het internet', { body: '**BGP** wisselt routes uit tussen **autonome systemen (AS\'en)**. Het is een *path-vector*-protocol: de keuze voor een pad hangt af van attributen zoals **LOCAL_PREF**, **AS_PATH** en **MED**.' }),
      S('single', 'Over welke TCP-poort lopen BGP-sessies?', { data: { options: ['22', '89', '179', '443'], correct: 2 } }),
      S('single', 'Welk attribuut gebruik je binnen je eigen AS om het uitgaande pad te beïnvloeden (hoogste waarde wint)?', { data: { options: ['AS_PATH', 'LOCAL_PREF', 'MED', 'NEXT_HOP'], correct: 1 }, explanation: 'LOCAL_PREF wordt binnen het AS gedeeld via iBGP. Een hogere waarde heeft voorkeur.' }),
      S('truefalse', 'Een router stuurt routes die hij van een iBGP-peer leert standaard door naar andere iBGP-peers.', { data: { correct: false }, explanation: 'Vanwege de iBGP split-horizon-regel niet. Daarom gebruik je een volledige iBGP-mesh, route reflectors of confederaties.' }),
      S('text', 'Wat is het eerste private 16-bits AS-nummer?', { data: { accepted: ['64512'] }, explanation: 'Het private 16-bits bereik loopt van 64512 tot en met 65534 (RFC 6996).' }),
      S('match', 'Koppel het begrip aan de juiste beschrijving.', { data: { pairs: [{ left: 'eBGP', right: 'Sessie tussen verschillende autonome systemen' }, { left: 'iBGP', right: 'Sessie binnen hetzelfde autonome systeem' }, { left: 'Route reflector', right: 'Maakt een volledige iBGP-mesh overbodig' }, { left: 'MED', right: 'Hint aan een buur-AS over het gewenste inkomende pad' }] } }),
    ],
  },
  {
    number: 6, title: 'MPLS in het transportnetwerk', category: 'Transport', icon: 'route', difficulty: 2,
    summary: 'Labels in plaats van lookups: MPLS vormt de basis van veel provider-backbones en VPN-diensten.',
    steps: [
      S('info', 'Schakelen op labels', { body: 'Bij **MPLS** krijgt een pakket aan de rand van het netwerk een **label**. Routers in de kern kijken alleen naar dat label om het pakket door te sturen. Zo bouw je efficiënt **VPN\'s**, **traffic engineering** en snelle omleidingen.' }),
      S('single', 'Hoeveel bits is het labelveld in een MPLS-header?', { data: { options: ['8', '16', '20', '32'], correct: 2 }, explanation: 'De hele MPLS-header is 32 bits: 20 bits label, 3 bits TC, 1 bit Bottom-of-Stack en 8 bits TTL.' }),
      S('match', 'Koppel de term aan de juiste rol.', { data: { pairs: [{ left: 'LER', right: 'Router aan de rand die labels toevoegt of verwijdert' }, { left: 'LSR', right: 'Router in de kern die labels verwisselt (swap)' }, { left: 'LDP', right: 'Protocol om labels tussen routers uit te wisselen' }, { left: 'PHP', right: 'De voorlaatste router verwijdert het buitenste label' }] } }),
      S('truefalse', "De MPLS-header zit tussen de laag 2- en de laag 3-header; daarom heet MPLS ook wel 'laag 2,5'.", { data: { correct: true } }),
      S('single', "Welke dienst geeft klanten een gescheiden laag 3-VPN met eigen routeringstabellen (VRF's)?", { data: { options: ['BGP/MPLS L3VPN', 'VPLS', 'Pseudowire (VPWS)', 'QinQ'], correct: 0 }, explanation: "Bij een L3VPN (RFC 4364) heeft elke klant een eigen VRF en worden routes via MP-BGP uitgewisseld. VPLS en pseudowires zijn laag 2-diensten." }),
    ],
  },
  {
    number: 7, title: 'Mobiele kern: van 4G naar 5G', category: 'Mobiele netwerken', icon: 'antenna', difficulty: 2,
    summary: 'De 5G-kern is opgebouwd uit netwerkfuncties die via een service-gebaseerde architectuur samenwerken. Ken jij ze?',
    steps: [
      S('info', 'Functies in plaats van dozen', { body: 'De **5G Core (5GC)** gebruikt een **Service Based Architecture**: netwerkfuncties zoals AMF, SMF en UPF praten via API\'s met elkaar. Control plane en user plane zijn strikt gescheiden (**CUPS**), zodat de UPF dicht bij de gebruiker kan staan (edge).' }),
      S('match', 'Koppel de 5G-netwerkfunctie aan de taak.', { data: { pairs: [{ left: 'AMF', right: 'Registratie-, verbindings- en mobiliteitsbeheer' }, { left: 'SMF', right: 'Sessiebeheer en IP-adrestoewijzing' }, { left: 'UPF', right: 'Doorsturen van gebruikersdata (user plane)' }, { left: 'UDM', right: 'Beheer van abonnee- en authenticatiegegevens' }] } }),
      S('single', 'Welke interface verbindt de gNB met de UPF voor gebruikersdata?', { data: { options: ['N2', 'N3', 'N4', 'N6'], correct: 1 }, explanation: 'N2 = gNB ↔ AMF (signalering), N3 = gNB ↔ UPF (gebruikersdata), N4 = SMF ↔ UPF, N6 = UPF ↔ datanetwerk.' }),
      S('truefalse', 'Bij 5G Non-Standalone (NSA) gebruikt het netwerk de 4G-kern (EPC).', { data: { correct: true }, explanation: 'NSA (option 3x) combineert 5G-radio met een LTE-anker en de EPC. Standalone (SA) gebruikt de 5GC.' }),
      S('single', 'Welk 4G-kernelement is qua rol het meest vergelijkbaar met de AMF?', { data: { options: ['MME', 'HSS', 'PCRF', 'S-GW'], correct: 0 } }),
      S('text', 'Met welk protocol wordt gebruikersdata tussen basisstation en kern getunneld? (afkorting)', { data: { accepted: ['GTP-U', 'GTPU', 'GTP'] }, explanation: 'GTP-U (GPRS Tunnelling Protocol – User plane), zowel in 4G (S1-U) als 5G (N3).' }),
    ],
  },
  {
    number: 8, title: 'Monitoring en de NOC', category: 'Netwerkbeheer', icon: 'monitor', difficulty: 1,
    summary: 'Je kunt alleen beheren wat je ziet. Test je kennis van SNMP, syslog, flows en de KPI\'s van een Network Operations Center.',
    steps: [
      S('info', 'Ogen en oren van het netwerk', { body: 'Een **NOC** gebruikt verschillende bronnen: **SNMP** (polling en traps) voor status en tellers, **syslog** voor gebeurtenissen en **NetFlow/IPFIX** voor verkeersstromen. Met KPI\'s zoals **MTTR** en beschikbaarheid stuur je op kwaliteit.' }),
      S('single', 'Op welke UDP-poort ontvangt een NMS standaard SNMP-traps?', { data: { options: ['161', '162', '514', '2055'], correct: 1 }, explanation: '161 is voor polling (agent), 162 voor traps, 514 is syslog en 2055 wordt vaak voor NetFlow gebruikt.' }),
      S('order', 'Zet de syslog-niveaus in volgorde, van meest naar minst ernstig (0 → 7).', { data: { items: ['Emergency', 'Alert', 'Critical', 'Error', 'Warning', 'Notice', 'Informational', 'Debug'] } }),
      S('truefalse', 'SNMPv2c-community strings worden versleuteld over het netwerk verstuurd.', { data: { correct: false }, explanation: 'In v1 en v2c gaan community strings in platte tekst over de lijn. Gebruik SNMPv3 met authPriv voor authenticatie én versleuteling.' }),
      S('multi', 'Welke bronnen geven inzicht in verkeersstromen (wie praat met wie)?', { data: { options: ['NetFlow / IPFIX', 'sFlow', 'Syslog', 'ICMP-ping'], correct: [0, 1] } }),
      S('single', 'Wat beschrijft MTTR?', { data: { options: ['De gemiddelde tijd tot een storing is hersteld', 'De gemiddelde tijd tussen twee storingen', 'De maximaal toegestane downtime per maand', 'De tijd tot de eerste reactie van de NOC'], correct: 0 }, explanation: 'MTTR = Mean Time To Repair/Restore. De tijd tussen storingen heet MTBF.' }),
    ],
  },
  {
    number: 9, title: 'DNS en DHCP voor operators', category: 'Netwerkdiensten', icon: 'server', difficulty: 1, publishOffset: 1,
    summary: 'Twee diensten die pas opvallen als ze stuk zijn. Hoe werken DNS en DHCP bij een operator?',
    steps: [
      S('info', 'Onzichtbaar maar onmisbaar', { body: '**DHCP** deelt adressen uit volgens het **DORA**-proces, **DNS** vertaalt namen naar adressen. Bij operators draaien beide op grote schaal en redundant.' }),
      S('order', 'Zet de stappen van het DHCP-proces in de juiste volgorde.', { data: { items: ['Discover', 'Offer', 'Request', 'Acknowledge'] } }),
      S('text', 'Op welke UDP-poort luistert een DHCP-server?', { data: { accepted: ['67'] } }),
      S('single', 'Welk DNS-recordtype bevat een IPv6-adres?', { data: { options: ['A', 'AAAA', 'PTR', 'MX'], correct: 1 } }),
    ],
  },
  // ---- Bonusuitdagingen ----
  {
    number: 8, is_bonus: true, title: 'Troubleshooting onder druk', category: 'Netwerkbeheer', icon: 'shield', difficulty: 3, xp_per_question: 150,
    summary: 'Een zakelijke klant belt: "het internet is traag". In deze bonusuitdaging los je het probleem stap voor stap op.',
    steps: [
      S('info', 'Het scenario', { body: 'Een zakelijke klant meldt sinds vanochtend **trage verbindingen** en af en toe pakketverlies. De monitoring geeft geen down-meldingen. Jij hebt dienst in de NOC.' }),
      S('order', 'Zet de bottom-up-aanpak voor troubleshooting in de juiste volgorde.', { data: { items: ['Fysieke laag: link, lichtniveaus, CRC-fouten', 'Datalink: VLAN, MAC-tabel, duplex', 'Netwerk: IP, routering, ping/traceroute', 'Applicatie: dienst en DNS controleren'] } }),
      S('single', 'De klantpoort toont veel CRC-fouten. Wat is de meest waarschijnlijke oorzaak?', { data: { options: ['Defecte kabel, vuile connector of duplex-mismatch', 'Een verkeerde OSPF-area', 'Een verlopen DHCP-lease', 'Een volle BGP-tabel'], correct: 0 } }),
      S('truefalse', 'Een duplex-mismatch kan zorgen voor late collisions en een slechte doorvoer.', { data: { correct: true } }),
      S('single', 'Welke tool laat zien via welke hops een pakket naar zijn bestemming gaat?', { data: { options: ['ping', 'traceroute / mtr', 'nslookup', 'arp'], correct: 1 } }),
    ],
  },
  {
    number: 5, is_bonus: true, title: 'Glasvezel en GPON', category: 'Toegangsnetwerk', icon: 'fiber', difficulty: 2, xp_per_question: 150,
    summary: 'Fiber-to-the-home groeit hard. Hoe werkt een passief optisch netwerk en waar let je op bij storingen?',
    steps: [
      S('info', 'Licht door het glas', { body: 'Bij **GPON** deelt één vezel vanaf de **OLT** in de centrale via passieve **splitters** zijn capaciteit met tientallen klanten (**ONT\'s**). Downstream en upstream gebruiken verschillende golflengtes.' }),
      S('single', 'Welke golflengte gebruikt GPON voor downstream-verkeer?', { data: { options: ['850 nm', '1310 nm', '1490 nm', '1550 nm'], correct: 2 }, explanation: 'Downstream 1490 nm, upstream 1310 nm. 1550 nm wordt vaak voor een RF-video-overlay gebruikt.' }),
      S('match', 'Koppel de component aan de juiste omschrijving.', { data: { pairs: [{ left: 'OLT', right: 'Apparaat in de centrale dat het PON aanstuurt' }, { left: 'ONT', right: 'Eindapparaat bij de klant' }, { left: 'Splitter', right: 'Passieve verdeler van het optische signaal' }, { left: 'OTDR', right: 'Meetinstrument om breuken en verlies in de vezel te vinden' }] } }),
      S('truefalse', 'Multimode-glasvezel is geschikter dan singlemode voor afstanden van tientallen kilometers.', { data: { correct: false }, explanation: 'Singlemode heeft veel minder modale dispersie en wordt gebruikt voor lange afstanden. Multimode zie je vooral binnen datacenters en gebouwen.' }),
      S('text', 'Hoeveel dB demping veroorzaakt een ideale 1:2-splitter ongeveer?', { body: 'Alleen het getal is genoeg.', data: { accepted: ['3', '3 dB', '3db', '3,0', '3.0'] }, explanation: 'Het vermogen wordt gehalveerd: 10·log10(2) ≈ 3 dB. Een 1:32-splitter zit daardoor rond de 15–17 dB.' }),
    ],
  },
];

const GROUPS = ['NOC', 'Core Network', 'Field Engineering', 'Transport & Fiber'];
const PLAYERS = [
  'PacketPirate', 'Lambda Lisa', 'TTL Expired', 'Route Reflector', 'Fiber Fien', 'Spanning Tree', 'Jitter Bug', 'BGP Bas',
  'Ping Pong', 'Lost in Latency', 'QinQ Queen', 'Subnet Sam', 'Mesh Merel', 'Dark Fiber', 'Kabelkoning', 'Loopback',
  'Signal Sanne', 'Null Route', 'Patch Panel Piet', 'Uptime Umar', 'Anycast Anouk', 'Hop Limit', 'MTU 9000', 'Splice Sophie',
];

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seed({ reset = false } = {}) {
  const G = require('./game');
  if (reset) {
    db.exec(`DELETE FROM answers; DELETE FROM attempts; DELETE FROM user_achievements; DELETE FROM sessions;
      DELETE FROM steps; DELETE FROM challenges; DELETE FROM users; DELETE FROM groups; DELETE FROM seasons;`);
  }
  const now = Date.now();
  const today8 = new Date(); today8.setHours(8, 0, 0, 0);
  // Uitdaging 8 is twee dagen geleden gepubliceerd en loopt nog vijf dagen.
  const publishOf = (n) => today8.getTime() - 2 * DAY + (n - 8) * WEEK;

  tx(() => {
    const groupIds = GROUPS.map((g) => Number(db.prepare('INSERT INTO groups (name) VALUES (?)').run(g).lastInsertRowid));

    db.prepare('INSERT INTO seasons (name, starts_at, ends_at) VALUES (?,?,?)').run('Seizoen 1', publishOf(1) - DAY, publishOf(5));
    db.prepare('INSERT INTO seasons (name, starts_at, ends_at) VALUES (?,?,?)').run('Seizoen 2', publishOf(5), publishOf(5) + 12 * WEEK);

    const challengeIds = [];
    for (const c of CHALLENGES) {
      const pub = publishOf(c.number) + (c.is_bonus ? 0 : 0);
      const r = db.prepare(`INSERT INTO challenges (number, is_bonus, title, summary, category, icon, difficulty, xp_per_question, status,
        publish_at, due_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(c.number, c.is_bonus ? 1 : 0, c.title, c.summary,
        c.category, c.icon, c.difficulty, c.xp_per_question || 100, 'published', pub, pub + WEEK, now, now);
      const id = Number(r.lastInsertRowid);
      c.steps.forEach((s, i) => db.prepare('INSERT INTO steps (challenge_id, position, type, title, body, data, explanation) VALUES (?,?,?,?,?,?,?)')
        .run(id, i, s.type, s.title, s.body, JSON.stringify(s.data), s.explanation));
      challengeIds.push({ ...c, id, publish_at: pub, due_at: pub + WEEK });
    }

    const pwAdmin = hashPassword('admin123');
    const pwDemo = hashPassword('demo123');
    const pwPlayer = hashPassword('welkom123');
    db.prepare('INSERT INTO users (username, display_name, password_hash, role, group_id, created_at) VALUES (?,?,?,?,?,?)')
      .run('admin', 'Trainingsbeheer', pwAdmin, 'admin', null, now);
    const demoId = Number(db.prepare('INSERT INTO users (username, display_name, password_hash, role, group_id, created_at) VALUES (?,?,?,?,?,?)')
      .run('demo', 'Demo Engineer', pwDemo, 'learner', groupIds[0], now).lastInsertRowid);

    const rand = mulberry32(42);
    const players = PLAYERS.map((name, i) => ({
      id: Number(db.prepare('INSERT INTO users (username, display_name, password_hash, role, group_id, created_at) VALUES (?,?,?,?,?,?)')
        .run(name.toLowerCase().replace(/[^a-z0-9]+/g, '.'), name, pwPlayer, 'learner', groupIds[i % groupIds.length], now).lastInsertRowid),
      diligence: 0.55 + rand() * 0.43,
      skill: 0.5 + rand() * 0.45,
    }));

    const insAttempt = db.prepare(`INSERT INTO attempts (user_id, challenge_id, started_at, completed_at, correct_count, question_count, xp, on_time)
      VALUES (?,?,?,?,?,?,?,?)`);
    const insAnswer = db.prepare('INSERT INTO answers (attempt_id, step_id, response, correct, answered_at) VALUES (?,?,?,?,?)');
    const stepsOf = new Map(challengeIds.map((c) => [c.id, db.prepare("SELECT id FROM steps WHERE challenge_id = ? AND type != 'info'").all(c.id).map((r) => r.id)]));

    function play(userId, c, completedAt, skill, r) {
      const qs = stepsOf.get(c.id);
      let correct = 0;
      const results = qs.map(() => { const ok = r() < skill; if (ok) correct++; return ok; });
      const onTime = completedAt <= c.due_at;
      const base = correct * (c.xp_per_question || 100);
      const xp = base + (onTime ? Math.round(base * G.ON_TIME_BONUS) : 0);
      const aid = insAttempt.run(userId, c.id, completedAt - 6 * 60e3, completedAt, correct, qs.length, xp, onTime ? 1 : 0).lastInsertRowid;
      qs.forEach((sid, i) => insAnswer.run(aid, sid, null, results[i] ? 1 : 0, completedAt));
    }

    const playable = challengeIds.filter((c) => c.publish_at <= now);
    for (const p of players) {
      const events = [];
      for (const c of playable) {
        const open = c.due_at > now;
        const chance = c.is_bonus ? p.diligence * 0.55 : open ? p.diligence * 0.6 : p.diligence;
        if (rand() > chance) continue;
        let t;
        if (open) t = c.publish_at + rand() * (now - c.publish_at - 60e3);
        else if (rand() < 0.88) t = c.publish_at + rand() * (WEEK - 3600e3);
        else t = Math.min(now - 60e3, c.due_at + rand() * 3 * DAY);
        events.push({ c, t: Math.round(t) });
      }
      events.sort((a, b) => a.t - b.t);
      for (const e of events) {
        play(p.id, e.c, e.t, p.skill, rand);
        G.evaluateAchievements(p.id, e.t);
      }
    }

    // Demo-account: #5 gemist (laat de "gemist"-status zien), #8 staat nog open.
    const demoRand = mulberry32(7);
    const demoPlan = [[1, false], [2, false], [3, false], [4, false], [6, false], [7, false], [5, true]];
    const demoEvents = demoPlan.map(([n, bonus]) => {
      const c = challengeIds.find((x) => x.number === n && !!x.is_bonus === bonus);
      return { c, t: c.publish_at + DAY + Math.round(demoRand() * 3 * DAY) };
    }).sort((a, b) => a.t - b.t);
    for (const e of demoEvents) {
      play(demoId, e.c, e.t, 0.85, demoRand);
      G.evaluateAchievements(demoId, e.t);
    }
  });
}

if (require.main === module) {
  const reset = process.argv.includes('--reset');
  if (!reset && db.prepare('SELECT COUNT(*) AS n FROM users').get().n) {
    console.log('Database bevat al data. Gebruik "npm run seed" (met --reset) om opnieuw te beginnen.');
  } else {
    seed({ reset });
    console.log(`Database gevuld: ${DB_PATH}`);
  }
}

module.exports = { seed };
