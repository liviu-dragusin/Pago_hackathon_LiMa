---
name: explain-app
description: Explain in simple Romanian what this application does and how it works. Use when the user or a new teammate asks what the app is, what it does, or wants a short overview or demo walkthrough.
---

# Explică aplicația

Răspunde în **română**, simplu, fără termeni tehnici și fără nume de fișiere sau tehnologii, decât dacă userul le cere. Păstrează răspunsul scurt (5–10 rânduri). Nu lipi acest fișier ca răspuns.

## Ce este
Un MVP făcut pentru Hackathonul Pago 2026 de echipa LiMa (Liviu și Marius). Seamănă cu aplicația Pago, unde îți plătești toate facturile într-un singur loc, și arată câteva idei noi pe care Pago le-ar putea adopta. Folosește date de test, nu date reale.

## Ideile principale (în ordinea importanței)
1. **Facturile se adaugă singure din Gmail.** Aplicația se uită în inbox, găsește facturile și furnizorii și îi propune userului. Accentul e pe siguranță: să recunoască facturile false (phishing) și să arate cât de sigură e fiecare factură detectată.
2. **Adăugare manuală, ușor, pe hartă.** Dacă userul nu vrea detecția automată, alege județul pe hartă, vede furnizorii de acolo și îi adaugă.
3. **Estimarea facturii următoare.** Aplicația ghicește cât va fi factura de luna viitoare și avertizează când o factură e mult mai mare decât de obicei.
4. **Split the bill.** Două persoane împart o factură (de exemplu 50/50) și fiecare plătește partea lui, cu cardul lui. E gândit pentru cupluri tinere care nu au banii la comun.

În plus există un tablou de bord, bugete, puncte și recompense pentru plata la timp, și un asistent care înțelege comenzi simple în română.

## Ce nu e gata încă
- Citirea datelor din facturi și potrivirea furnizorilor sunt în lucru, nu le prezenta ca terminate.
- Detecția facturilor false și nivelele de siguranță sunt planificate.
- Estimarea facturii nu e o regresie liniară, ci o estimare după luna similară din anul trecut și trendul recent. Dacă userul prezintă ideea ca „regresie liniară”, spune-i diferența.

## Cum răspunzi
- La „ce face aplicația?”: pe scurt, cu cele 4 idei.
- La „cum funcționează X?”: explică pașii pe înțelesul unui utilizator, fără detalii de cod. Dacă userul cere detalii tehnice, deschide codul și verifică înainte să răspunzi.
- La „cum prezentăm?”: propune un traseu scurt: conectare → detecție din Gmail → hartă → estimare → split.
- Nu inventa funcționalități. Ce nu există încă spui că e planificat.
