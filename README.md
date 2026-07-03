# Í ljósi sögunnar — kort og tímalína

Vefur sem raðar öllum þáttum útvarpsþáttarins
[Í ljósi sögunnar](https://www.ruv.is/utvarp/spila/i-ljosi-sogunnar/23795)
eftir Veru Illugadóttur á heimskort og sögulega tímalínu. Hver þáttur er
merktur við staðina þar sem sagan gerist og ártölin sem hún spannar, svo hægt
er að vafra um rúman áratug af þáttum eftir landafræði jafnt sem öldum — sjá
í sjónhendingu hvar í heiminum og hvenær í sögunni hver þáttur á heima.

Þetta er óopinbert aðdáendaverkefni og ekki á vegum RÚV. Allt efni þáttanna —
titlar, lýsingar, hljóð og myndir — tilheyrir RÚV og Veru Illugadóttur og er
sótt beint þaðan.

## Eiginleikar

- **Heimskort** — hver þáttur fær punkt á sögusviði sínu. Litur punktsins
  sýnir tímabil sögunnar á bláum litakvarða, frá ljósu (forsaga og fornöld)
  yfir í dökkt (20. og 21. öld). Þar sem margir þættir gerast á sama stað
  (New York ein hýsir tíu) opnast valmynd í stað þess að punktarnir skarist.
- **Tímalína** — neðst á síðunni sést dreifing allra þátta frá forsögu til
  nútímans, og með því að draga handföngin má sía kortið eftir tímabili.
  Kvarðinn er ólínulegur: tuttugasta öldin, þar sem flestir þættir eiga heima,
  fær rúmt pláss en allt fyrir 3000 f.Kr. þjappast í mjótt „forsögu“-band.
- **Þáttaspjald** — við að smella á punkta opnast spjald með lýsingu þáttarins,
  spilara sem streymir hljóðinu beint frá RÚV og tengli á þáttasíðuna á
  ruv.is.
- **Listi** — tafla yfir alla þætti í skúffu við hlið kortsins (á fullum
  skjá á síma), raðanleg eftir titli, dagsetningu, stað og ártali. Þar sjást
  líka endurfluttir þættir og þeir fáu sem ekki fá punkt á kortinu.
- **Leit og tímabilsval** — textaleit í titlum og lýsingum ásamt forstilltum
  tímabilum (fornöld, miðaldir, heimsstyrjaldirnar o.s.frv.).

## Hvernig gögnin urðu til

Vefurinn hvílir á þremur gagnasöfnum sem urðu til í sitthvoru skrefinu:

1. **Þáttaskráin** (`data/catalog.json`) er sótt sjálfvirkt úr GraphQL-vef
   RÚV með `npm run fetch-catalog`: 357 þættir með titlum, lýsingum,
   útsendingardögum og beinum MP3-slóðum. Skráin er alfarið vélunnin og má
   endurnýja hvenær sem er — nýir þættir bætast þá við sem óunnin auðkenni.

2. **Efnisgreiningin** (`data/annotations.json`) er handunnin viðbót, gerð
   með aðstoð gervigreindar í yfirförnum skömmtum: fyrir hvern þátt var lesið
   úr titli og lýsingu hvaða staðir koma við sögu (og hver þeirra er
   aðalstaður), hvaða ártalsbil sagan spannar, hvaða efnisorð eiga við, hvort
   þátturinn tilheyri syrpu og hvort um endurflutning sé að ræða. Hver færsla
   ber öryggismat (`high`/`medium`/`low`) eftir því hve skýrt sögusviðið er,
   svo óvissar staðsetningar séu aðgreinanlegar frá öruggum.

3. **Staðaskráin** (`data/places.json`) er handvalin skrá yfir 245 sögustaði
   með hnitum. Hnitin koma frá [Nominatim](https://nominatim.org)
   (OpenStreetMap) og hver einasta færsla er sannreynd með
   `npm run verify-places` áður en hún er tekin í notkun.

Skipunin `npm run build-episodes` fléttar söfnin þrjú saman í eina skrá,
`public/data/episodes.json` — það eina sem vefurinn hleður — og gengur um
leið úr skugga um innri reglur gagnanna: hver greindur þáttur hefur nákvæmlega
einn aðalstað, allar staðatilvísanir vísa á gilda færslu í staðaskránni og
upphafsár er aldrei á eftir lokaári (neikvæð ártöl tákna f.Kr.).
Endurfluttir þættir (15 talsins) eru merktir við upprunalega þáttinn svo
kortið sýni hverja sögu aðeins einu sinni, og þrettán þættir sem RÚV birti án
lýsingar standa utan korts og sjást eingöngu í listanum.

## Skipanir

| Skipun                              | Hlutverk                                           |
| ----------------------------------- | -------------------------------------------------- |
| `npm run fetch-catalog`             | Endursækja þáttalýsigögn frá GraphQL-vef RÚV       |
| `npm run verify-places`             | Sannreyna öll hnit staðaskrárinnar gegn Nominatim  |
| `npm run next-batch [-- N]`         | Prenta næstu N ógreindu þættina                    |
| `npm run merge-batch -- batch.json` | Sannreyna og flétta greiningarskammt inn í `data/` |
| `npm run build-episodes`            | Byggja `public/data/episodes.json` fyrir vefinn    |

## Gagnalindir og þakkir

- Þáttalýsigögn og hljóð: [RÚV](https://www.ruv.is) — allt efni þáttanna
  tilheyrir RÚV og Veru Illugadóttur.
- Hnit: [Nominatim](https://nominatim.org) / OpenStreetMap-höfundar.
- Kortagrunnur: [OpenFreeMap](https://openfreemap.org).
