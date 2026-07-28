# Tupperware Norsk Nettbutikk

En norsk produktkatalog som henter samlinger, produktdata, bilder,
NOK-priser og tilgjengelighet fra Tupperwares norske butikksider.

## Starte lokalt

Dobbeltklikk `start.bat`, eller kjør:

```powershell
python server.py
```

Butikken åpnes på `http://127.0.0.1:8789/`.

Alle produktlenker inneholder konsulentreferansen `LISBETHOVERBYE` som standard.
Referansen kan overstyres i katalogadressen:

```text
https://tupperware-norsk-nettbutikk.onrender.com/?ref=DINREFERANSE&consultant=Ditt%20Navn
```

`consultant` er valgfri og brukes i konsulentlinjen øverst.
