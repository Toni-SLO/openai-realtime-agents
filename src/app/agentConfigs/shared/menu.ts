// Multilingual menu for Fančita Restaurant
// Each item has translations for HR, SL, EN, DE, IT, NL

export interface MenuItem {
  id: string;
  price: number;
  translations: {
    hr: string;
    sl: string;
    en: string;
    de: string;
    it: string;
    nl: string;
  };
}

export interface MenuCategory {
  id: string;
  translations: {
    hr: string;
    sl: string;
    en: string;
    de: string;
    it: string;
    nl: string;
  };
  items: MenuItem[];
}

export const FANCITA_MENU: MenuCategory[] = [
  {
    id: 'cold_appetizers',
    translations: {
      hr: 'Hladni predjedi',
      sl: 'Hladne predjedi',
      en: 'Cold appetizers',
      de: 'Kalte Vorspeisen',
      it: 'Antipasti freddi',
      nl: 'Koude voorgerechten'
    },
    items: [
      {
        id: 'carpaccio_truffle',
        price: 17.00,
        translations: {
          hr: 'Carpaccio biftek s tartufima',
          sl: 'Carpaccio biftek s tartufi',
          en: 'Carpaccio beefsteak with truffle',
          de: 'Carpaccio (Filetsteak) mit Trüffel',
          it: 'Carpaccio con tartufo',
          nl: 'Carpaccio biefstuk met truffels'
        }
      },
      {
        id: 'carpaccio_rocket',
        price: 14.00,
        translations: {
          hr: 'Carpaccio biftek s rukolom',
          sl: 'Carpaccio biftek z rukolo',
          en: 'Carpaccio beefsteak with rocket',
          de: 'Carpaccio (Filetsteak) mit Rauke',
          it: 'Carpaccio con rucola',
          nl: 'Carpaccio biefstuk met rucola'
        }
      },
      {
        id: 'seafood_plate',
        price: 13.00,
        translations: {
          hr: 'Tanjur morskih plodova',
          sl: 'Krožnik morskih sadežev',
          en: 'Seafood plate',
          de: 'Meeresfrüchte Platte',
          it: 'Piatto frutti di mare',
          nl: 'Zeevruchten bord'
        }
      },
      {
        id: 'octopus_salad',
        price: 12.00,
        translations: {
          hr: 'Salata od hobotnice',
          sl: 'Hobotnica v solati',
          en: 'Octopus salad',
          de: 'Oktopus Salat',
          it: 'Insalata di polpo',
          nl: 'Octopussalade'
        }
      },
      {
        id: 'salted_anchovies',
        price: 10.00,
        translations: {
          hr: 'Inćuni na soli',
          sl: 'Sardoni v slanici',
          en: 'Salted anchovies',
          de: 'Salzsardinen',
          it: 'Acciughe al sale',
          nl: 'Gezouten ansjovis'
        }
      },
      {
        id: 'dry_cod',
        price: 10.00,
        translations: {
          hr: 'Bakalar',
          sl: 'Polenovka',
          en: 'Dry cod',
          de: 'Stockfisch',
          it: 'Baccalà',
          nl: 'Droge kabeljauw'
        }
      },
      {
        id: 'caprese_salad',
        price: 7.00,
        translations: {
          hr: 'Salata Caprese',
          sl: 'Solata Caprese',
          en: 'Salad Caprese',
          de: 'Salat Caprese',
          it: 'Insalata Caprese',
          nl: 'Salade Caprese'
        }
      },
      {
        id: 'fried_shrimp_salad',
        price: 11.00,
        translations: {
          hr: 'Salata s prženim kozicama',
          sl: 'Solata z ocvrtimi kozicami',
          en: 'Salad with fried shrimps',
          de: 'Salat mit gebackenen Garnelen',
          it: 'Insalata con gamberetti fritti',
          nl: 'Salade met gefrituurde garnalen'
        }
      },
      {
        id: 'caesar_salad',
        price: 11.00,
        translations: {
          hr: 'Caesar salata',
          sl: 'Cesar solata',
          en: 'Caesar salad',
          de: 'Caesar Salat',
          it: 'Insalata Caesar',
          nl: 'Salade Caesar'
        }
      },
      {
        id: 'sopska_salad',
        price: 8.00,
        translations: {
          hr: 'Šopska salata',
          sl: 'Šopska solata',
          en: '"Šopska" salad',
          de: 'Salat "Šopska" mit Käse',
          it: 'Insalata "Šopska"',
          nl: 'Salade "Šopska"'
        }
      },
      {
        id: 'rustic_steak_salad',
        price: 20.00,
        translations: {
          hr: 'Rustikalna salata s biftekom, Grana Padano i dresingom',
          sl: 'Rustika solata z biftkom, s sirom Grana Padano in prelivom',
          en: 'Rustic salad with beefsteak, Grana Padano and dressing',
          de: 'Rustikaler Salat mit Filetsteak, Grana Padano und Dressing',
          it: 'Insalata Rustica con filetto di manzo, Grana Padano e Dressing',
          nl: 'Rustieke salade met biefstuk, Grana Padano en dressing'
        }
      }
    ]
  },
  {
    id: 'soups',
    translations: {
      hr: 'Juhe',
      sl: 'Juhe',
      en: 'Soups',
      de: 'Suppen',
      it: 'Brodi',
      nl: 'Soepen'
    },
    items: [
      {
        id: 'chicken_soup',
        price: 5.00,
        translations: {
          hr: 'Pileća juha',
          sl: 'Kokošja juha',
          en: 'Chicken soup',
          de: 'Hühnersuppe',
          it: 'Brodo di gallina',
          nl: 'Kippensoep'
        }
      },
      {
        id: 'fish_soup',
        price: 6.00,
        translations: {
          hr: 'Riblja juha',
          sl: 'Ribja juha',
          en: 'Fish soup',
          de: 'Fischsuppe',
          it: 'Brodo di pesce',
          nl: 'Vissoep'
        }
      }
    ]
  },
  {
    id: 'pasta_hot_appetizers',
    translations: {
      hr: 'Domaće tjestenine i topli predjedi',
      sl: 'Domače testenine in tople predjedi',
      en: 'Homemade pasta and hot appetizers',
      de: 'Hausgemachte Pasta und Warme Vorspeisen',
      it: 'Pasta fatta in casa e antipasti caldi',
      nl: 'Huisgemaakte pasta en warme voorgerechten'
    },
    items: [
      {
        id: 'breaded_cheese',
        price: 8.00,
        translations: {
          hr: 'Poharani sir',
          sl: 'Ocvrti sir',
          en: 'Breadcrumbed cheese',
          de: 'Gebackener Käse',
          it: 'Formaggio impanato',
          nl: 'Gepaneerde kaas'
        }
      },
      {
        id: 'beef_goulash',
        price: 12.00,
        translations: {
          hr: 'Gulaš od govedine',
          sl: 'Goveji golaž',
          en: 'Beef goulash',
          de: 'Rindergulasch mit Gnocchi',
          it: 'Goulash (stufato) di manzo',
          nl: 'Rundvleesstoofpot'
        }
      },
      {
        id: 'pljukanci_shrimp_mushrooms',
        price: 17.00,
        translations: {
          hr: 'Pljukanci s gamberi i gljivama',
          sl: 'Pljukanci z gamberi in gobami',
          en: 'Pljukanci with shrimps and mushrooms',
          de: 'Pljukanci mit Garnelen und Pilzen',
          it: 'Pljukanci con gamberi e funghi',
          nl: 'Pljukanci met garnalen en paddenstoelen'
        }
      },
      {
        id: 'pljukanci_mushrooms_prosciutto_truffle',
        price: 17.00,
        translations: {
          hr: 'Pljukanci s gljivama, pršutom, tartufima i vrhnjem',
          sl: 'Pljukanci z gobami, pršutom, tartufi in smetano',
          en: 'Pljukanci with mushrooms, prosciutto, truffle and cream',
          de: 'Pljukanci mit Pilzen, Prosciutto, Trüffel und Sahne',
          it: 'Pljukanci con funghi, prosciutto, tartufo e panna',
          nl: 'Pljukanci met paddenstoelen, prosciutto, truffel en room'
        }
      },
      {
        id: 'pappardelle_truffle_cream',
        price: 17.00,
        translations: {
          hr: 'Pappardelle s tartufima i vrhnjem',
          sl: 'Pappardelle s tartufi in smetano',
          en: 'Pappardelle with truffle and cream',
          de: 'Pappardelle mit Trüffel und Sahne',
          it: 'Pappardelle con tartufo e panna',
          nl: 'Pappardelle met truffel en room'
        }
      },
      {
        id: 'pappardelle_shrimp_zucchini',
        price: 17.00,
        translations: {
          hr: 'Pappardelle s gamberi i tikvicama',
          sl: 'Pappardelle z gamberi in bučkami',
          en: 'Pappardelle with shrimps and zucchini',
          de: 'Pappardelle mit Garnelen und Zucchini',
          it: 'Pappardelle con gamberi e zucchine',
          nl: 'Pappardelle met garnalen en courgette'
        }
      },
      {
        id: 'pappardelle_bolognese',
        price: 12.00,
        translations: {
          hr: 'Pappardelle bolonjeze',
          sl: 'Pappardelle bolognese',
          en: 'Pappardelle bolognese',
          de: 'Pappardelle nach Bologner Art',
          it: 'Pappardelle alla bolognese',
          nl: 'Pappardelle bolognese'
        }
      },
      {
        id: 'pappardelle_vegetables',
        price: 12.00,
        translations: {
          hr: 'Pappardelle s povrćem',
          sl: 'Pappardelle z zelenjavo',
          en: 'Pappardelle with vegetables',
          de: 'Pappardelle mit Gemüse',
          it: 'Pappardelle con verdure',
          nl: 'Pappardelle met groenten'
        }
      },
      {
        id: 'pasticcio',
        price: 12.00,
        translations: {
          hr: 'Pasticcio',
          sl: 'Lazanje / Pasticcio',
          en: 'Pasticcio',
          de: 'Lasagne / Pasticcio',
          it: 'Pasticcio',
          nl: 'Pasticcio'
        }
      },
      {
        id: 'risotto_shrimp',
        price: 17.00,
        translations: {
          hr: 'Rižot s gamberi',
          sl: 'Rižota z gamberi',
          en: 'Risotto with shrimps',
          de: 'Risotto mit Garnelen',
          it: 'Risotto con gamberetti',
          nl: 'Risotto met garnalen'
        }
      },
      {
        id: 'risotto_antonio',
        price: 17.00,
        translations: {
          hr: 'Rižot "Antonio" s gamberi, tikvicama i čilijem',
          sl: 'Rižota "Antonio" z gamberi, bučkami in čilijem',
          en: 'Risotto "Antonio" with shrimps, zucchini and chilli',
          de: 'Risotto "Antonio" mit Garnelen, Zucchini und Chilli',
          it: 'Risotto "Antonio" con gamberetti, zucchine e chilli',
          nl: 'Risotto "Antonio" met garnalen, courgette en chili'
        }
      }
    ]
  },
  {
    id: 'chef_recommends',
    translations: {
      hr: 'Chef preporučuje',
      sl: 'Šef kuhinje priporoča',
      en: 'Chef recommends',
      de: 'Chef empfiehlt',
      it: 'Chef raccomanda',
      nl: 'Chef-kok beveelt aan'
    },
    items: [
      {
        id: 'white_fish_fillet_truffle',
        price: 22.00,
        translations: {
          hr: 'File bijele ribe s tartufima',
          sl: 'File bele ribe s tartufi',
          en: 'White fish fillet with truffle',
          de: 'Weissfischfilet mit Trüffel und Mangold-Kartoffeln',
          it: 'Filetto di pesce bianco con tartufo',
          nl: 'Witte visfilet met truffel'
        }
      },
      {
        id: 'white_fish_fillet_seafood',
        price: 20.00,
        translations: {
          hr: 'File bijele ribe s gratiniranim morskim plodovima',
          sl: 'File bele ribe z gratiniranimi morskimi sadeži',
          en: 'White fish fillet with gratinated seafood',
          de: 'Weissfischfilet mit gratinierten Meeresfrüchten und Mangold-Kartoffeln',
          it: 'Filetto di pesce bianco e frutti di mare gratinati',
          nl: 'Witte visfilet met gegratineerde zeevruchten'
        }
      },
      {
        id: 'padellata',
        price: 20.00,
        translations: {
          hr: 'Padellata',
          sl: 'Padellata',
          en: 'Padellata',
          de: 'Padellata (Pappardelle mit Garnelen, Scampi, Miesmuscheln und Sauce)',
          it: 'Padellata',
          nl: 'Padellata'
        }
      },
      {
        id: 'tomahawk_steak',
        price: 40.00,
        translations: {
          hr: '"Tomahawk" Steak (1 kg)',
          sl: '"Tomahawk" Steak (1 kg)',
          en: '"Tomahawk" Steak (1 kg)',
          de: '"Tomahawk" Steak (1 kg) mit Frittierte Kartoffeln und gegrillte Gemüse',
          it: '"Tomahawk" Steak (1 kg)',
          nl: '"Tomahawk" Steak (1 kg)'
        }
      },
      {
        id: 'tagliata_truffle_grana',
        price: 25.00,
        translations: {
          hr: 'Tagliata biftek s tartufima i Grana Padano',
          sl: 'Tagliata biftek s tartufi in sirom Grana Padano',
          en: 'Tagliata beefsteak with truffle and Grana Padano',
          de: 'Tagliata Filetsteak mit Trüffeln und Grana Padano',
          it: 'Tagliata di filetto con tartufo e Grana Padano',
          nl: 'Tagliata biefstuk met truffel en Grana Padano'
        }
      },
      {
        id: 'sote_beefsteak_fancita',
        price: 22.00,
        translations: {
          hr: 'Sotè biftek "Fančita"',
          sl: 'Sotè biftek "Fančita"',
          en: 'Sotè beefsteak "Fančita"',
          de: 'Sotè Filetsteak "Fančita" mit Frittierte Kartoffeln und gegrillte Gemüse',
          it: 'Sotè filetto "Fančita"',
          nl: 'Sote biefstuk "Fančita"'
        }
      },
      {
        id: 'medallions_gorgonzola_wine',
        price: 22.00,
        translations: {
          hr: 'Medaljoni s gorgonzolom i vinom',
          sl: 'Medaljoni z gorgonzolo in vinom',
          en: 'Medallions with gorgonzola and wine',
          de: 'Medaillons mit Gorgonzola und Wein mit Frittierte Kartoffeln und grill Gemüse',
          it: 'Medaglioni con salsa di gorgonzola e vino',
          nl: 'Medaillons met gorgonzola en wijn'
        }
      },
      {
        id: 'lamb_chops',
        price: 25.00,
        translations: {
          hr: 'Jagnjeći kotleti',
          sl: 'Jagnječji kotleti',
          en: 'Lamb chops',
          de: 'Lammkoteletts mit Frittierte Kartoffeln und gegrillte Gemüse',
          it: 'Costolette di agnello',
          nl: 'Lamskoteletjes'
        }
      },
      {
        id: 'lamb_shank',
        price: 20.00,
        translations: {
          hr: 'Jagnjeća but',
          sl: 'Jagnječja krača',
          en: 'Lamb shank',
          de: 'Lammkeule mit Frittierte Kartoffeln und gegrillte Gemüse',
          it: 'Stinco d\'agnello',
          nl: 'Lamsschenkel'
        }
      },
      {
        id: 'pork_medallions_truffle',
        price: 20.00,
        translations: {
          hr: 'Svinjski medaljoni u tartufi umaku',
          sl: 'Svinjski medaljoni v omaki s tartufi',
          en: 'Pork medallions in truffle sauce',
          de: 'Schweinefilet mit Trüffelsauce mit Frittierte Kartoffeln und gegrillte Gemüse',
          it: 'Filetto di maiale con salsa di tartufo',
          nl: 'Varkensmedaillons in truffelsaus'
        }
      },
      {
        id: 'pork_medallions_gorgonzola',
        price: 15.00,
        translations: {
          hr: 'Svinjski medaljoni u gorgonzola umaku',
          sl: 'Svinjski medaljoni v omaki iz gorgonzole',
          en: 'Pork medallions in gorgonzola sauce',
          de: 'Schweinfilet mit Gorgonzolasauce mit Frittierte Kartoffeln und gegrillte Gemüse',
          it: 'Filetto di maiale con salsa di gorgonzola',
          nl: 'Varkensmedaillons in gorgonzolasaus'
        }
      },
      {
        id: 'gourmet_plate_fancita',
        price: 35.00,
        translations: {
          hr: 'Gourmet tanjur "Fančita" za 2 osobe',
          sl: 'Gourmet plošča "Fančita" za 2 osebi',
          en: 'Gourmet plate "Fančita" for 2 persons',
          de: 'Gourmet Platte "Fančita" für 2 Personen',
          it: 'Gourmet Piatto "Fančita" per 2 persone',
          nl: 'Gourmetbord "Fančita" voor 2 personen'
        }
      }
    ]
  },
  {
    id: 'shellfish',
    translations: {
      hr: 'Školjke',
      sl: 'Školjke',
      en: 'Shellfish',
      de: 'Muscheln',
      it: 'Conchiglie',
      nl: 'Mosselen'
    },
    items: [
      {
        id: 'mussels',
        price: 10.00,
        translations: {
          hr: 'Dagnje',
          sl: 'Dagnje / Klepavice',
          en: 'Mussels',
          de: 'Miesmuscheln',
          it: 'Cozze',
          nl: 'Mosselen'
        }
      },
      {
        id: 'scallops_piece',
        price: 4.00,
        translations: {
          hr: 'Jakobove kapice (komad)',
          sl: 'Jakobova kapica (komad)',
          en: 'Queen scallops (piece)',
          de: 'Jakobsmuscheln (Stück)',
          it: 'Capesante (pezzo)',
          nl: 'Sint-jakobsschelpen (deel)'
        }
      },
      {
        id: 'gratinated_seafood',
        price: 14.00,
        translations: {
          hr: 'Gratinirani morski plodovi',
          sl: 'Gratinirani morski sadeži',
          en: 'Gratinated seafood',
          de: 'Meeresfrüchte gratiniert',
          it: 'Frutti di mare gratinati',
          nl: 'Gegratineerde zeevruchten'
        }
      },
      {
        id: 'mixed_shellfish',
        price: 15.00,
        translations: {
          hr: 'Miješane školjke',
          sl: 'Mešane školjke',
          en: 'Mixed shellfish',
          de: 'Gemischte Muscheln',
          it: 'Conchiglie miste',
          nl: 'Gemengde mosselen'
        }
      }
    ]
  },
  {
    id: 'fish_seafood',
    translations: {
      hr: 'Ribe, mekušci i rakovi',
      sl: 'Ribe, mekužci in raki',
      en: 'Fish, mollusks and crustaceans',
      de: 'Fische, Weichtiere und Krabbe',
      it: 'Pesce, molluschi e crostacei',
      nl: 'Vis, weekdieren en krabben'
    },
    items: [
      {
        id: 'gilthead',
        price: 17.00,
        translations: {
          hr: 'Orada',
          sl: 'Orada',
          en: 'Gilthead',
          de: 'Goldbrasse mit Mangold-Kartoffeln',
          it: 'Orata',
          nl: 'Goudbrasem'
        }
      },
      {
        id: 'seabass',
        price: 17.00,
        translations: {
          hr: 'Brancin',
          sl: 'Brancin',
          en: 'Seabass',
          de: 'Seebarsch mit Mangold-Kartoffeln',
          it: 'Branzino',
          nl: 'Zeebaars'
        }
      },
      {
        id: 'seabass_fillet',
        price: 18.00,
        translations: {
          hr: 'File brancina',
          sl: 'File brancina',
          en: 'Seabass fillet',
          de: 'Weissfischfilet mit Mangold-Kartoffeln',
          it: 'Filetto di branzino',
          nl: 'Zeebaarsfilet'
        }
      },
      {
        id: 'breaded_seabass_fillet',
        price: 18.00,
        translations: {
          hr: 'Poharani file brancina',
          sl: 'Ocvrti file brancina',
          en: 'Breadcrumbed seabass fillet',
          de: 'Panierte Seebarschfilet mit Mangold-Kartoffeln',
          it: 'Filetto di branzino impanato',
          nl: 'Gepaneerde zeebaarsfilet'
        }
      },
      {
        id: 'grilled_squid',
        price: 15.00,
        translations: {
          hr: 'Lignje na žaru',
          sl: 'Lignji na žaru',
          en: 'Grilled squids',
          de: 'Gegrillte Calamari mit Mangold-Kartoffeln',
          it: 'Calamari alla griglia',
          nl: 'Gegrilde inktvissen'
        }
      },
      {
        id: 'fried_squid',
        price: 15.00,
        translations: {
          hr: 'Pržene lignje',
          sl: 'Ocvrti lignji',
          en: 'Fried squids',
          de: 'Frittierte Calamari mit Mangold-Kartoffeln',
          it: 'Calamari fritti',
          nl: 'Gefrituurde inktvissen'
        }
      },
      {
        id: 'breaded_shrimp',
        price: 15.00,
        translations: {
          hr: 'Poharane kozice',
          sl: 'Ocvrte kozice',
          en: 'Breadcrumbed shrimps',
          de: 'Panierte Garnelen',
          it: 'Gamberetti impanati',
          nl: 'Gepaneerde garnalen'
        }
      },
      {
        id: 'shrimp_matias',
        price: 21.00,
        translations: {
          hr: 'Kozice "Matias" u finoj omaki',
          sl: 'Kozice "Matias" v posebni omaki',
          en: 'Shrimps "Matias" in fine sauce',
          de: 'Garnelen "Matias" in feiner Sauce',
          it: 'Gamberi "Matias" in salsa fina',
          nl: 'Garnalen "Matias" in fijne saus'
        }
      },
      {
        id: 'grilled_king_prawns',
        price: 21.00,
        translations: {
          hr: 'Kozice na žaru',
          sl: 'Kozice na žaru',
          en: 'Grilled king prawns',
          de: 'Königsgarnelen gegrillt',
          it: 'Gamberoni alla griglia',
          nl: 'Gegrilde garnalen'
        }
      },
      {
        id: 'white_fish_first_class',
        price: 40.00,
        translations: {
          hr: 'Bijela riba 1. klase (1 kg)',
          sl: 'Bela riba 1. vrste (1 kg)',
          en: 'White fish 1. class (1 kg)',
          de: 'Weisser Fisch 1. Klasse (1 kg) mit Mangold-Kartoffeln',
          it: 'Pesce bianco 1. classe (1 kg)',
          nl: 'Witte vis 1. klasse (1 kg)'
        }
      },
      {
        id: 'fish_plate_klaudia',
        price: 40.00,
        translations: {
          hr: 'Ribji tanjur "Klaudia" za 2 osobe',
          sl: 'Ribja plošča "Klaudia" za 2 osebi',
          en: 'Fish plate "Klaudia" for 2 persons',
          de: 'Fischplatte "Klaudia" für 2 Personen',
          it: 'Piatto di pesce "Klaudia" per 2 persone',
          nl: 'Visbord "Klaudia" voor 2 personen'
        }
      }
    ]
  },
  {
    id: 'meat_beef',
    translations: {
      hr: 'Mesne specijalitete - Govedina',
      sl: 'Mesne specialitete - Govedina',
      en: 'Meat specialties - Beef',
      de: 'Fleischspezialitäten – Rindfleisch',
      it: 'Specialità di carne – Manzo',
      nl: 'Vleesspecialiteiten - Rundvlees'
    },
    items: [
      {
        id: 'beefsteak_grilled',
        price: 29.00,
        translations: {
          hr: 'Biftek na žaru',
          sl: 'Biftek na žaru',
          en: 'Beefsteak grilled',
          de: 'Filetsteak gegrillt',
          it: 'Filetto di manzo alla griglia',
          nl: 'Biefstuk gegrild'
        }
      },
      {
        id: 'beefsteak_green_pepper',
        price: 30.00,
        translations: {
          hr: 'Biftek sa zelenim paprom',
          sl: 'Biftek z zelenim poprom',
          en: 'Green pepper beefsteak',
          de: 'Filetsteak mit grünem Pfeffer',
          it: 'Filetto di manzo al pepe verde',
          nl: 'Biefstuk met groene pepersaus'
        }
      },
      {
        id: 'beefsteak_mushroom_sauce',
        price: 30.00,
        translations: {
          hr: 'Biftek u gljivastom umaku',
          sl: 'Biftek z gobovo omako',
          en: 'Beefsteak in mushroom sauce',
          de: 'Filetsteak mit Pilzsauce',
          it: 'Filetto di manzo con salsa di funghi',
          nl: 'Biefstuk met paddestoelensaus'
        }
      },
      {
        id: 'beefsteak_truffle_sauce',
        price: 35.00,
        translations: {
          hr: 'Biftek u tartufi umaku',
          sl: 'Biftek v omaki s tartufi',
          en: 'Beefsteak in truffle sauce',
          de: 'Filetsteak mit Trüffelsauce',
          it: 'Filetto di manzo con salsa di tartuffo',
          nl: 'Biefstuk met truffelsaus'
        }
      },
      {
        id: 'beefsteak_gorgonzola_sauce',
        price: 30.00,
        translations: {
          hr: 'Biftek u gorgonzola umaku',
          sl: 'Biftek v omaki iz gorgonzole',
          en: 'Beefsteak in gorgonzola sauce',
          de: 'Filetsteak mit Gorgonzolasauce',
          it: 'Filetto di manzo con salsa di gorgonzola',
          nl: 'Biefstuk met gorgonzolasaus'
        }
      },
      {
        id: 'tagliata_beefsteak_grana',
        price: 23.00,
        translations: {
          hr: 'Tagliata biftek s Grana Padano',
          sl: 'Tagliata biftek s sirom Grana Padano',
          en: 'Tagliata beefsteak with Grana Padano',
          de: 'Tagliata Filetsteak mit Grana Padano (ohne Beilage)',
          it: 'Tagliata di filetto di manzo con Grana Padano',
          nl: 'Biefstuk tagliata met Grana Padano'
        }
      },
      {
        id: 'beefsteak_chateaubriand',
        price: 60.00,
        translations: {
          hr: 'Biftek Chateaubriand za 2 osobe',
          sl: 'Biftek Chateaubriand za 2 osebi',
          en: 'Beefsteak Chateaubriand for 2 persons',
          de: 'Filetsteak Chateaubriand für 2 Personen',
          it: 'Filetto di manzo Chateaubriand per 2 persone',
          nl: 'Biefstuk Chateaubriand voor 2 personen'
        }
      },
      {
        id: 'rib_eye_green_pepper',
        price: 22.00,
        translations: {
          hr: 'Rib eye steak sa zelenim paprom',
          sl: 'Rib eye steak z zelenim poprom',
          en: 'Green pepper rib eye steak',
          de: 'Rib-Eye Steak mit grünem Pfeffer',
          it: 'Rib eye steak al pepe verde',
          nl: 'Rib eye steak met groene pepersaus'
        }
      },
      {
        id: 'rib_eye_mushroom_sauce',
        price: 22.00,
        translations: {
          hr: 'Rib eye steak u gljivastom umaku',
          sl: 'Rib eye steak z gobovo omako',
          en: 'Rib eye steak in mushroom sauce',
          de: 'Rib-Eye Steak mit Pilzsauce',
          it: 'Rib eye steak con salsa di funghi',
          nl: 'Rib eye steak met paddestoelensaus'
        }
      },
      {
        id: 'rib_eye_truffle_sauce',
        price: 27.00,
        translations: {
          hr: 'Rib eye steak u tartufi umaku',
          sl: 'Rib eye steak v omaki s tartufi',
          en: 'Rib eye steak in truffle sauce',
          de: 'Rib-Eye Steak mit Trüffelsauce',
          it: 'Rib eye steak con salsa di tartufo',
          nl: 'Rib eye steak met truffelsaus'
        }
      },
      {
        id: 'rib_eye_gorgonzola_sauce',
        price: 22.00,
        translations: {
          hr: 'Rib eye steak u gorgonzola umaku',
          sl: 'Rib eye steak v omaki iz gorgonzole',
          en: 'Rib eye steak in gorgonzola sauce',
          de: 'Rib-Eye Steak mit Gorgonzolasauce',
          it: 'Rib eye steak con salsa di gorgonzola',
          nl: 'Rib eye steak met gorgonzolasaus'
        }
      },
      {
        id: 'rumpsteak_green_pepper',
        price: 22.00,
        translations: {
          hr: 'Rostbef sa zelenim paprom',
          sl: 'Ramstek z zelenim poprom',
          en: 'Green pepper rumpsteak',
          de: 'Rumpsteak mit grünem Pfeffer',
          it: 'Roastbeef al pepe verde',
          nl: 'Rosbief met groene pepersaus'
        }
      },
      {
        id: 'rumpsteak_mushroom_sauce',
        price: 22.00,
        translations: {
          hr: 'Rostbef u gljivastom umaku',
          sl: 'Ramstek z gobovo omako',
          en: 'Rumpsteak in mushroom sauce',
          de: 'Rumpsteak mit Pilzsauce',
          it: 'Roastbeef con salsa di funghi',
          nl: 'Rosbief met paddestoelensaus'
        }
      },
      {
        id: 'rumpsteak_truffle_sauce',
        price: 27.00,
        translations: {
          hr: 'Rostbef u tartufi umaku',
          sl: 'Ramstek v omaki s tartufi',
          en: 'Rumpsteak in truffle sauce',
          de: 'Rumpsteak mit Trüffelsauce',
          it: 'Roastbeef con salsa di tartufo',
          nl: 'Rosbief met truffelsaus'
        }
      },
      {
        id: 'rumpsteak_gorgonzola_sauce',
        price: 22.00,
        translations: {
          hr: 'Rostbef u gorgonzola umaku',
          sl: 'Ramstek v omaki iz gorgonzole',
          en: 'Rumpsteak in gorgonzola sauce',
          de: 'Rumpsteak mit Gorgonzolasauce',
          it: 'Roastbeef con salsa di gorgonzola',
          nl: 'Rosbief met gorgonzolasaus'
        }
      },
      {
        id: 'veal_ribs',
        price: 21.00,
        translations: {
          hr: 'Teleća rebarca',
          sl: 'Telečja rebra',
          en: 'Veal ribs',
          de: 'Kalbsrippen',
          it: 'Costolette di vitello',
          nl: 'Kalfsribben'
        }
      }
    ]
  },
  {
    id: 'meat_pork',
    translations: {
      hr: 'Mesne specijalitete - Svinjsko meso',
      sl: 'Mesne specialitete - Svinjina',
      en: 'Meat specialties - Pork',
      de: 'Fleischspezialitäten – Schweinefleisch',
      it: 'Specialità di carne – Maiale',
      nl: 'Vleesspecialiteiten - Varkensvlees'
    },
    items: [
      {
        id: 'grilled_mixed_meat',
        price: 15.00,
        translations: {
          hr: 'Miješano meso na žaru',
          sl: 'Mešano meso na žaru',
          en: 'Grilled mixed meat',
          de: 'Gemischtes gegrilltes Fleisch',
          it: 'Carne mista ai ferri',
          nl: 'Gegrild mixvlees'
        }
      },
      {
        id: 'cevapcici',
        price: 12.00,
        translations: {
          hr: 'Ćevapčići',
          sl: 'Čevapčiči',
          en: 'Ćevapčići',
          de: 'Ćevapčići',
          it: 'Ćevapčići',
          nl: 'Ćevapčići'
        }
      },
      {
        id: 'wiener_schnitzel',
        price: 12.00,
        translations: {
          hr: 'Bečki odrezak',
          sl: 'Dunajski zrezek',
          en: 'Escalope Vienna style',
          de: 'Wiener Schnitzel',
          it: 'Bistecca alla Wiennese',
          nl: 'Wiener schnitzel'
        }
      },
      {
        id: 'pork_ribs',
        price: 13.00,
        translations: {
          hr: 'Svinjska rebarca',
          sl: 'Svinjska rebra',
          en: 'Pork ribs',
          de: 'Schweinerippen',
          it: 'Costolette di maiale',
          nl: 'Varkensribben'
        }
      }
    ]
  },
  {
    id: 'meat_chicken',
    translations: {
      hr: 'Mesne specijalitete - Pileće meso',
      sl: 'Mesne specialitete - Piščanec',
      en: 'Meat specialties - Chicken',
      de: 'Fleischspezialitäten – Hühnerfleisch',
      it: 'Specialità di carne – Pollo',
      nl: 'Vleesspecialiteiten - Kip'
    },
    items: [
      {
        id: 'chicken_rollups',
        price: 18.00,
        translations: {
          hr: 'Pileći zavici',
          sl: 'Piščančji zvitki',
          en: 'Chicken roll-ups',
          de: 'Hähnchenröllchen und gegrillte Gemüse',
          it: 'Involtini di pollo',
          nl: 'Kiprolletjes'
        }
      },
      {
        id: 'grilled_chicken_escalope',
        price: 12.00,
        translations: {
          hr: 'Pileći odrezak na žaru',
          sl: 'Piščančji zrezek na žaru',
          en: 'Grilled chicken escalope',
          de: 'Gegrillte Hühnerbrust und gegrillte Gemüse',
          it: 'Petto di pollo alla griglia',
          nl: 'Gegrilde kipschnitzel'
        }
      },
      {
        id: 'chicken_escalope_gorgonzola',
        price: 13.00,
        translations: {
          hr: 'Pileći odrezak u gorgonzola umaku',
          sl: 'Piščančji zrezek v omaki iz gorgonzole',
          en: 'Chicken escalope in gorgonzola sauce',
          de: 'Hühnerbrust mit Gorgonzolasauce und gegrillte Gemüse',
          it: 'Petto di pollo con salsa di gorgonzola',
          nl: 'Kipschnitzel in gorgonzolasaus'
        }
      },
      {
        id: 'crispy_chicken',
        price: 12.00,
        translations: {
          hr: 'Hrskava piletina',
          sl: 'Hrustljavi piščanec',
          en: 'Crispy chicken',
          de: 'Knuspriges Hähnchen',
          it: 'Petto di pollo croccante',
          nl: 'Knapperige kip'
        }
      },
      {
        id: 'cordon_bleu',
        price: 18.00,
        translations: {
          hr: '"Cordon Bleu"',
          sl: '"Cordon Bleu"',
          en: '"Cordon Bleu"',
          de: '"Cordon Bleu"',
          it: '"Cordon Bleu"',
          nl: '"Cordon Bleu"'
        }
      }
    ]
  },
  {
    id: 'pizza',
    translations: {
      hr: 'Pizza (Ø 32 cm)',
      sl: 'Pizza (Ø 32 cm)',
      en: 'Pizza (Ø 32 cm)',
      de: 'Pizza (Ø 32 cm)',
      it: 'Pizza (Ø 32 cm)',
      nl: 'Pizza (Ø 32 cm)'
    },
    items: [
      {
        id: 'fancita',
        price: 12.00,
        translations: {
          hr: 'Fančita - rajčica, sir, šunka, pršut, gljive, mliječni sir, origano',
          sl: 'Fančita - paradižnik, sir, šunka, pršut, gobice, mlečni sir, origano',
          en: 'Fančita - tomato, cheese, ham, prosciutto, mushrooms, milk cheese, oregano',
          de: 'Fančita - Tomate, Käse, Schinken, Prosciutto, Pilze, Milchkäse, Oregano',
          it: 'Fančita - pomodoro, formaggio, prosciutto cotto, prosciutto crudo, funghi, formaggio al latte, origano',
          nl: 'Fančita - tomaat, kaas, ham, prosciutto, champignons, melkkaas, oregano'
        }
      },
      {
        id: 'goli_otok',
        price: 6.00,
        translations: {
          hr: 'Goli otok - maslinovo ulje, začini',
          sl: 'Goli otok - oljčno olje, začimbe',
          en: 'Goli otok - olive oil, spices',
          de: 'Goli otok - Olivenöl, Gewürze',
          it: 'Goli otok - olio d\'oliva, spezie',
          nl: 'Goli otok - olijfolie, kruiden'
        }
      },
      {
        id: 'margherita',
        price: 10.00,
        translations: {
          hr: 'Margherita - rajčica, sir, origano',
          sl: 'Margherita - paradižnik, sir, origano',
          en: 'Margherita - tomato, cheese, oregano',
          de: 'Margherita - Tomate, Käse, Oregano',
          it: 'Margherita - pomodoro, formaggio, origano',
          nl: 'Margherita - tomaat, kaas, origano'
        }
      },
      {
        id: 'capriciosa',
        price: 11.00,
        translations: {
          hr: 'Capriciosa - rajčica, sir, šunka, gljive, origano',
          sl: 'Capriciosa - paradižnik, sir, šunka, gobice, origano',
          en: 'Capriciosa - tomato, cheese, ham, mushrooms, oregano',
          de: 'Capriciosa - Tomate, Käse, Schinken, Pilze, Oregano',
          it: 'Capriciosa - pomodoro, formaggio, prosciutto cotto, funghi, origano',
          nl: 'Capriciosa - tomaat, kaas, ham, champignons, origano'
        }
      },
      {
        id: 'quattro_formaggi',
        price: 11.00,
        translations: {
          hr: '4 formaggi - rajčica, sir, gorgonzola, grana padano, mliječni sir, origano',
          sl: '4 formaggi - paradižnik, sir, gorgonzola, naribani sir, mlečni sir, origano',
          en: '4 formaggi - tomato, cheese, gorgonzola, Grana Padano, milk cheese, oregano',
          de: '4 formaggi - Tomate, Käse, Gorgonzola, geriebener Käse, Milchkäse, Oregano',
          it: '4 formaggi - pomodoro, formaggio, gorgonzola, formaggio grattugiato e al latte, origano',
          nl: '4 formaggi - tomaat, kaas, gorgonzola, Grana Padano, melkkaas, origano'
        }
      },
      {
        id: 'azzimonti',
        price: 11.00,
        translations: {
          hr: 'Azzimonti - rajčica, sir, sezonsko povrće, origano, maslinovo ulje',
          sl: 'Azzimonti - paradižnik, sir, sezonska zelenjava, origano, oljčno olje',
          en: 'Azzimonti - tomato, cheese, seasonal vegetables, oregano, olive oil',
          de: 'Azzimonti - Tomate, Käse, Gemüse der Saison, Oregano, Olivenöl',
          it: 'Azzimonti - pomodoro, formaggio, verdure di stagione, origano, olio d\'oliva',
          nl: 'Azzimonti - tomaat, kaas, seizoensgroenten, origano, olijfolie'
        }
      },
      {
        id: 'frutti_di_mare',
        price: 12.00,
        translations: {
          hr: 'Frutti di mare - rajčica, sir, morski plodovi, tršćanski umak, origano',
          sl: 'Frutti di mare - paradižnik, sir, morski sadeži, tržaška omaka, origano',
          en: 'Frutti di mare - tomato, cheese, seafood, garlic-parsley sauce, oregano',
          de: 'Frutti di mare - Tomate, Käse, Meeresfrüchte, Triest-Sauce, Oregano',
          it: 'Frutti di mare - pomodoro, formaggio, frutti di mare, salsa triestina, origano',
          nl: 'Frutti di mare - tomaat, kaas, zeevruchten, knoflook-peterseliesaus, origano'
        }
      },
      {
        id: 'contadina',
        price: 12.00,
        translations: {
          hr: 'Seljačka - rajčica, sir, panceta, pršut, crveni luk, jaje, origano',
          sl: 'Kmečka - paradižnik, sir, panceta, pršut, čebula, jajce, origano',
          en: 'Contadina - tomato, cheese, bacon, prosciutto, red onion, egg, oregano',
          de: 'Bauern - Tomate, Käse, Pancetta, Prosciutto, rote Zwiebel, Ei, Oregano',
          it: 'Contadina - pomodoro, formaggio, pancetta, prosciutto crudo, cipolla rossa, uovo, origano',
          nl: 'Boeren - tomaat, kaas, spek, prosciutto, rode ui, ei, origano'
        }
      },
      {
        id: 'mexico',
        price: 11.00,
        translations: {
          hr: 'Mexico - rajčica, sir, pikantna salama, čili, začini',
          sl: 'Mexico - paradižnik, sir, pikantna salama, feferoni, začimbe',
          en: 'Mexico - tomato, cheese, spicy salami, chilli, spices',
          de: 'Mexico - Tomate, Käse, scharfe Salami, Peperoni, Gewürze',
          it: 'Mexico - pomodoro, formaggio, salame piccante, peperoni, spezie',
          nl: 'Mexico - tomaat, kaas, pikante salami, chili, kruiden'
        }
      },
      {
        id: 'wurstel',
        price: 10.00,
        translations: {
          hr: 'Würstel - rajčica, sir, hrenovke, origano',
          sl: 'Würstel - paradižnik, sir, hrenovke, origano',
          en: 'Würstel - tomato, cheese, frankfurter sausage, oregano',
          de: 'Würstel - Tomate, Käse, Würstel, Oregano',
          it: 'Würstel - pomodoro, formaggio, wurstel, origano',
          nl: 'Würstel - tomaat, kaas, knakworst, origano'
        }
      },
      {
        id: 'quattro_stagioni',
        price: 11.00,
        translations: {
          hr: '4 stagioni - rajčica, sir, šunka, gljive, hrenovke, artičoke, origano',
          sl: '4 stagioni - paradižnik, sir, šunka, gobice, hrenovke, artičoke, origano',
          en: '4 stagioni - tomato, cheese, ham, mushrooms, frankfurter sausage, artichokes, oregano',
          de: '4 stagioni - Tomate, Käse, Schinken, Pilze, Würstel, Artischocken, Oregano',
          it: '4 stagioni - pomodoro, formaggio, prosciutto cotto, funghi, wurstel, carciofi, origano',
          nl: '4 stagioni - tomaat, kaas, ham, champignons, knakworst, artisjok, origano'
        }
      },
      {
        id: 'tuna',
        price: 11.00,
        translations: {
          hr: 'Tuna - rajčica, sir, tuna, luk, maslinovo ulje, origano',
          sl: 'Tuna - paradižnik, sir, tuna, oliva, čebula, oljčno olje, origano',
          en: 'Tuna - tomato, cheese, tuna, onion, olive oil, oregano',
          de: 'Thunfisch - Tomate, Käse, Thunfisch, Oliven, Zwiebeln, Olivenöl, Oregano',
          it: 'Tonno - pomodoro, formaggio, tonno, olive, cipolla, olio d\'oliva, origano',
          nl: 'Tuna - tomaat, kaas, tonijn, ui, olijfolie, origano'
        }
      },
      {
        id: 'ham',
        price: 10.00,
        translations: {
          hr: 'Šunka - rajčica, sir, šunka, origano',
          sl: 'Šunka - paradižnik, sir, šunka, origano',
          en: 'Ham - tomato, cheese, ham, oregano',
          de: 'Schinken - Tomate, Käse, Schinken, Oregano',
          it: 'Prosciutto - pomodoro, formaggio, prosciutto cotto, origano',
          nl: 'Ham - tomaat, kaas, ham, origano'
        }
      },
      {
        id: 'truffles',
        price: 12.00,
        translations: {
          hr: 'Tartufi - rajčica, tartufi sir, pršut',
          sl: 'Tartufi - paradižnik, sir s tartufi, pršut',
          en: 'Truffles - tomato, truffle cheese, prosciutto',
          de: 'Trüffel - Tomate, Käse mit Trüffel, Prosciutto',
          it: 'Tartufi - pomodoro, formaggio con tartufo, prosciutto crudo',
          nl: 'Truffles - tomaat, truffelkaas, prosciutto'
        }
      },
      {
        id: 'nives',
        price: 12.00,
        translations: {
          hr: 'Nives - rajčica, sir, šunka, gljive, pikantna salama, gorgonzola, origano',
          sl: 'Nives - paradižnik, sir, šunka, gobice, pikantna salama, gorgonzola, origano',
          en: 'Nives - tomato, cheese, ham, mushrooms, spicy salami, gorgonzola, oregano',
          de: 'Nives - Tomate, Käse, Schinken, Pilze, scharfe Salami, Gorgonzola, Oregano',
          it: 'Nives - pomodoro, formaggio, prosc. cotto, funghi, salame piccante, gorgonzola, origano',
          nl: 'Nives - tomaat, kaas, ham, champignons, pikante salami, gorgonzola, origano'
        }
      },
      {
        id: 'hawaii',
        price: 11.00,
        translations: {
          hr: 'Hawaii - rajčica, sir, šunka, ananas, origano',
          sl: 'Hawaii - paradižnik, sir, šunka, ananas, origano',
          en: 'Hawaii - tomato, cheese, ham, pineapple, oregano',
          de: 'Hawaii - Tomate, Käse, Schinken, Ananas, Oregano',
          it: 'Hawaii - pomodoro, formaggio, prosciutto cotto, ananas, origano',
          nl: 'Hawaii - tomaat, kaas, ham, ananas, origano'
        }
      },
      {
        id: 'rucola',
        price: 11.00,
        translations: {
          hr: 'Rukola - rajčica, sir, šunka, rukola, origano',
          sl: 'Rokula - paradižnik, sir, šunka, rukola, origano',
          en: 'Rucola - tomato, cheese, ham, rocket salad, oregano',
          de: 'Rucola - Tomate, Käse, Schinken, Rucola, Oregano',
          it: 'Rucola - pomodoro, formaggio, prosciutto cotto, rucola, origano',
          nl: 'Rucola - tomaat, kaas, ham, rucola, origano'
        }
      },
      {
        id: 'buffala',
        price: 11.00,
        translations: {
          hr: 'Buffala - rajčica, mozzarela bufala, bosiljak',
          sl: 'Buffala - paradižnik, mozzarela buffala, bazilika',
          en: 'Buffala - tomato, mozzarela buffala, basil',
          de: 'Buffala (dünner Teig) - Tomate, Büffelmozzarella, Basilikum',
          it: 'Buffala - pomodoro, mozzarella di bufala, basilico',
          nl: 'Buffala - tomaat, mozzarella Bufala, basilicum'
        }
      },
      {
        id: 'extra_topping',
        price: 1.00,
        translations: {
          hr: 'Dodatak',
          sl: 'Dodatek',
          en: 'Extra topping',
          de: 'Zugabe',
          it: 'Supplemento',
          nl: 'Toevoeging'
        }
      },
      {
        id: 'extra_prosciutto',
        price: 3.00,
        translations: {
          hr: 'Dodatak pršut',
          sl: 'Dodatek pršut',
          en: 'Extra prosciutto',
          de: 'Zugabe Prosciutto',
          it: 'Supplemento prosciutto crudo',
          nl: 'Toevoeging prosciutto'
        }
      }
    ]
  }
];

// Helper functions for agent usage
export function getMenuForAgent(language: string): string {
  const lang = language.toLowerCase();
  const supportedLangs = ['hr', 'sl', 'en', 'de', 'it', 'nl'];
  const targetLang = supportedLangs.includes(lang) ? lang : 'hr';
  
  let menuText = '';
  
  FANCITA_MENU.forEach(category => {
    menuText += `\n## ${category.translations[targetLang as keyof typeof category.translations]}\n`;
    
    category.items.forEach(item => {
      const translation = item.translations[targetLang as keyof typeof item.translations];
      menuText += `- ${translation} - ${item.price.toFixed(2)} €\n`;
    });
  });
  
  return menuText;
}

export function findMenuItem(searchTerm: string, language: string = 'hr'): MenuItem[] {
  const lang = language.toLowerCase();
  const supportedLangs = ['hr', 'sl', 'en', 'de', 'it', 'nl'];
  const targetLang = supportedLangs.includes(lang) ? lang : 'hr';
  const searchLower = searchTerm.toLowerCase();
  
  const results: MenuItem[] = [];
  
  FANCITA_MENU.forEach(category => {
    category.items.forEach(item => {
      const translation = item.translations[targetLang as keyof typeof item.translations].toLowerCase();
      
      // Exact match or contains search term
      if (translation.includes(searchLower)) {
        results.push(item);
      }
    });
  });
  
  return results;
}