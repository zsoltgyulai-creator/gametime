# GameTime Shared v4 – belépés nélkül

Két fix profil: **Zsoló** és **Dénes**. Nincs névbeíró mező. A napi keret a szülői nézetben állítható. A szülő PIN-nel tud időt korrigálni vagy a mai napot nullázni. Az időadatok Supabase adatbázisban vannak, így a két gyerek eszköze és a szülő telefonja ugyanazt látja.

## Beállítás és élesítés

Ez a csomag forráskód, még nem telepített éles webapp. Vercel + Supabase kell hozzá.

1. Hozz létre egy Supabase projektet.
2. Supabase SQL Editorban futtasd a `schema.sql` tartalmát.
3. Töltsd fel a fájlokat egy új Vercel projektbe, vagy másold be a meglévő Vercel projektedbe.
4. A Vercel Project Settings → Environment Variables alatt állítsd be:
   - `SUPABASE_URL` – Supabase Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` – Supabase service role key (**csak szerveroldali titok, soha ne tedd HTML-be**)
   - `PARENT_PIN` – külön PIN a szülői módosításokhoz
5. Futtass új deploymentet. A `package.json` telepíti a Supabase klienst.
6. Nyisd meg a Vercel HTTPS webcímet; az időmérő azonnal megjelenik, nincs családi kódos belépés. iPhone-on: Megosztás → Főképernyőhöz adás.

## Működés
- Gyerekprofil-választó: Zsoló, Dénes.
- Játék indítása/leállítása; több alkalom összeadása.
- Időkorrekció és mai nap nullázása a szülői nézetben, külön PIN-nel.
- Naptár és napi/havi összesítés.
- Nincs SMS vagy külső üzenetküldés.

## Korlátok és biztonság
- A keret-, korrekciós és nullázási műveletekhez a szerveroldalon ellenőrzött szülői PIN kell.
- **Fontos biztonsági kompromisszum:** belépés nélkül bárki, aki ismeri a webcímet, megtekintheti a családi játékidőket, illetve elindíthatja/leállíthatja az időmérőt. A szülői PIN védi a keret módosítását, az időkorrekciót és a nullázást, de nem teszi priváttá az adatokat.
- A megosztott állapot egy JSON rekordban van. Kis családi alkalmazáshoz megfelelő, de egyszerre végzett módosításoknál az utolsó mentés felülírhat egy másikat.
- A futó időt az API a kezdési időpontból számolja, ezért az app bezárása nem állítja meg az időmérést.

## Szülői műveletek naplója
Az új verzió naplózza a napi keret módosítását, az időlevonást és a napi nullázást a `gametime_audit_log` táblába.
Telepítés előtt futtasd le a `schema.sql`-t a Supabase SQL Editorban.

## v8: futva hagyott időmérő és alkalmak kezelése
- A futó időmérő automatikusan lezárul, amikor eléri a napi keretet, illetve biztonsági okból 6 óra után.
- A mai alkalmaknál és a naptár napi részleteinél a szülői PIN megadásával szerkeszthető az alkalom hossza vagy törölhető az alkalom.
- A módosítások és törlések is naplózódnak.
