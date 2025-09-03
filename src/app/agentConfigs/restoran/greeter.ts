import { RealtimeAgent } from '@openai/agents/realtime';
import { FANCITA_GREETER_INSTRUCTIONS } from '../shared';

export const greeterAgent = new RealtimeAgent({
  name: 'greeter',
  voice: 'marin',
  handoffDescription: 'Agent that greets the user and determines if they want to make a reservation or place an order.',

  instructions: FANCITA_GREETER_INSTRUCTIONS + `

## 7) Knowledge Base (menu za reference)
# 🧊 Hladna predjela - **Carpaccio biftek s tartufom** – 17,00 € - **Carpaccio biftek s rokulom** – 14,00 € - **Pijat morskih plodova** – 13,00 € - **Salata od hobotnice** – 12,00 € - **Slani sardoni** – 10,00 € - **Bakalar** – 10,00 € - **Salata Caprese** – 7,00 € - **Salata s prženim kozicama** – 11,00 € - **Cezar salata** – 11,00 € - **Šopska salata** – 8,00 € - **Salata Rustika s biftekom, Grana Padanom i dressingom** – 20,00 €

# 🍲 Juhe - **Kokošja juha** – 5,00 € - **Riblja juha** – 6,00 €

# 🍝 Domaća tjestenina i topla predjela - **Pohani sir** – 8,00 € - **Goveđi gulaš** – 12,00 € - **Pljukanci s kozicama i gljivama** – 17,00 € - **Pljukanci s gljivama, tartufom, pršutom i vrhnjem** – 17,00 € - **Pappardelle s tartufom i vrhnjem** – 17,00 € - **Pappardelle s kozicama i tikvicama** – 17,00 € - **Pappardelle bolonjez** – 12,00 € - **Pappardelle s povrćem** – 12,00 € - **Lazanje / Pasticcio** – 12,00 € - **Rižoto s kozicama** – 17,00 € - **Rižoto "Antonio" s kozicama, tikvicama i čilijem** – 17,00 €

# 👨‍🍳 Šef kuhinje preporučuje - **Filet bijele ribe s tartufom** – 22,00 € - **Filet bijele ribe s gratiniranim morskim plodovima** – 20,00 € - **Padellata** – 20,00 € - **"Tomahawk" Steak (1 kg)** – 40,00 € - **Tagliata bifteka s tartufom i Grana Padanom** – 25,00 € - **Sotè biftek "Fančita"** – 22,00 € - **Medaljoni s gorgonzolom i vinom** – 22,00 € - **Janjeći kotleti** – 25,00 € - **Janjeća koljenica** – 20,00 € - **Svinjski medaljoni u umaku od tartufa** – 20,00 € - **Svinjski medaljoni u umaku od gorgonzole** – 15,00 € - **Gourmet plata "Fančita" za 2 osobe** – 35,00 €

# 🐚 Školjke - **Dagnje / Pedoči** – 10,00 € - **Jakobove kapice (komad)** – 4,00 € - **Gratinirani morski plodovi** – 14,00 € - **Miješane školjke** – 15,00 €

# 🐟 Ribe, mekušci i rakovi - **Orada** – 17,00 € - **Brancin** – 17,00 € - **Filet brancina** – 18,00 € - **Pohani brancin** – 18,00 € - **Lignje na žaru** – 15,00 € - **Lignje pržene** – 15,00 € - **Pržene kozice** – 15,00 € - **Kozice "Matias" u finom umaku** – 21,00 € - **Kozice na žaru** – 21,00 € - **Bijela riba 1. klase (1 kg)** – 40,00 € - **Riblja plata "Klaudia" za 2 osobe** – 40,00 €

# 🥩 Mesni specijaliteti – Govedina - **Biftek na žaru** – 29,00 € - **Biftek sa zelenim paprom** – 30,00 € - **Biftek u umaku od gljiva** – 30,00 € - **Biftek u umaku od tartufa** – 35,00 € - **Biftek u umaku od gorgonzole** – 30,00 € - **Tagliata bifteka s Grana Padanom** – 23,00 € - **Biftek Chateaubriand za 2 osobe** – 60,00 € - **Rib eye steak sa zelenim paprom** – 22,00 € - **Rib eye steak u umaku od gljiva** – 22,00 € - **Rib eye steak u umaku od tartufa** – 27,00 € - **Rib eye steak u umaku od gorgonzole** – 22,00 € - **Ramstek sa zelenim paprom** – 22,00 € - **Ramstek u umaku od gljiva** – 22,00 € - **Ramstek u umaku od tartufa** – 27,00 € - **Ramstek u umaku od gorgonzole** – 22,00 € - **Teleća rebarca** – 21,00 €

# 🐖 Mesni specijaliteti – Svinjetina - **Miješano meso na žaru** – 15,00 € - **Ćevapčići** – 12,00 € - **Bečki odrezak** – 12,00 € - **Svinjska rebarca** – 13,00 €

# 🍗 Mesni specijaliteti – Piletina - **Pileći savici** – 18,00 € - **Naravni pileći odrezak na žaru** – 12,00 € - **Naravni pileći odrezak u umaku od gorgonzole** – 13,00 € - **Hrskava piletina** – 12,00 € - **Cordon Bleu** – 18,00 €

# 🍕 Pizza (Ø 32 cm) - **Fančita** – 12,00 € - **Goli otok** – 6,00 € - **Margherita** – 10,00 € - **Capriciosa** – 11,00 € - **4 formaggi** – 11,00 € - **Azzimonti** – 11,00 € - **Frutti di mare** – 12,00 € - **Seljačka** – 12,00 € - **Mexico** – 11,00 € - **Würstel** – 10,00 € - **4 stagioni** – 11,00 € - **Tuna** – 11,00 € - **Šunka** – 10,00 € - **Tartufi** – 12,00 € - **Nives** – 12,00 € - **Hawaii** – 11,00 € - **Rokula** – 11,00 € - **Buffala** – 11,00 €

# ➕ Dodatki - **Dodatak** – 1,00 € - **Dodatak pršut** – 3,00 €
`,

  tools: [],
  handoffs: [], // will be populated later in index.ts
});
