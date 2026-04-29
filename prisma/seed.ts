import { PrismaClient, Role, EquivalenceScope } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function upsertEquivalence(data: {
  rawName: string;
  scope: EquivalenceScope;
  portId: string | null;
  speciesId: string;
  notes?: string | null;
}) {
  // Prisma no permite null en claves compuestas únicas (rawName_portId),
  // así que hacemos findFirst + create/update manualmente.
  const existing = await prisma.speciesEquivalence.findFirst({
    where: { rawName: data.rawName, portId: data.portId }
  });
  if (existing) {
    return prisma.speciesEquivalence.update({
      where: { id: existing.id },
      data: { scope: data.scope, speciesId: data.speciesId, notes: data.notes ?? null, active: true }
    });
  }
  return prisma.speciesEquivalence.create({ data });
}

async function main() {
  // ── Users ──────────────────────────────────────────────
  const adminPass = await bcrypt.hash("admin1234", 10);
  await prisma.user.upsert({
    where: { email: "admin@capturas.local" },
    update: {},
    create: {
      email: "admin@capturas.local",
      name: "Administrador",
      passwordHash: adminPass,
      role: Role.ADMIN
    }
  });

  // ── Puertos ────────────────────────────────────────────
  const ports = [
    { code: "LARE", name: "Laredo", province: "Cantabria" },
    { code: "STNA", name: "Santoña", province: "Cantabria" },
    { code: "SDER", name: "Santander", province: "Cantabria" },
    { code: "SVIC", name: "San Vicente de la Barquera", province: "Cantabria" },
    { code: "COLI", name: "Colindres", province: "Cantabria" },
    { code: "CAST", name: "Castro Urdiales", province: "Cantabria" },
    { code: "HOND", name: "Hondarribia", province: "Gipuzkoa" },
    { code: "PASA", name: "Pasaia", province: "Gipuzkoa" },
    { code: "ONDR", name: "Ondarroa", province: "Bizkaia" },
    { code: "GETA", name: "Getaria", province: "Gipuzkoa" },
    { code: "BERM", name: "Bermeo", province: "Bizkaia" }
  ];
  for (const p of ports) {
    await prisma.port.upsert({ where: { code: p.code }, update: {}, create: p });
  }

  // ── Barco ──────────────────────────────────────────────
  await prisma.boat.upsert({
    where: { name: "ITSAS LAGUNAK" },
    update: {},
    create: { code: "SS-1", name: "ITSAS LAGUNAK" }
  });

  // ── Especies ───────────────────────────────────────────
  // Códigos FAO (ASFIS) de las especies más habituales en capturas del Cantábrico.
  // Nombre común: un solo nombre, el más usado en castellano (sin barras ni aliases).
  // Los sinónimos regionales (Bokarta, Txardina, Verdel, etc.) se resuelven vía equivalencias.
  const species = [
    // Pelágicos
    { code: "ANE", commonName: "Anchoa", scientificName: "Engraulis encrasicolus" },
    { code: "SAR", commonName: "Sardina", scientificName: "Sardina pilchardus" },
    { code: "MAC", commonName: "Caballa", scientificName: "Scomber scombrus" },
    { code: "MAS", commonName: "Estornino", scientificName: "Scomber colias" },
    { code: "HOM", commonName: "Jurel", scientificName: "Trachurus trachurus" },
    { code: "JAA", commonName: "Jurel blanco", scientificName: "Trachurus mediterraneus" },
    { code: "ALB", commonName: "Atún blanco", scientificName: "Thunnus alalunga" },
    { code: "BFT", commonName: "Atún rojo", scientificName: "Thunnus thynnus" },
    { code: "BON", commonName: "Bonito atlántico", scientificName: "Sarda sarda" },
    { code: "BOG", commonName: "Boga", scientificName: "Boops boops" },
    // Demersales
    { code: "HKE", commonName: "Merluza", scientificName: "Merluccius merluccius" },
    { code: "WHG", commonName: "Pescadilla", scientificName: "Merlangius merlangus" },
    { code: "POK", commonName: "Abadejo", scientificName: "Pollachius pollachius" },
    { code: "LIN", commonName: "Maruca", scientificName: "Molva molva" },
    { code: "COD", commonName: "Bacalao", scientificName: "Gadus morhua" },
    { code: "HAD", commonName: "Eglefino", scientificName: "Melanogrammus aeglefinus" },
    { code: "MEG", commonName: "Gallo", scientificName: "Lepidorhombus whiffiagonis" },
    { code: "ANF", commonName: "Rape", scientificName: "Lophius piscatorius" },
    { code: "ANK", commonName: "Rape negro", scientificName: "Lophius budegassa" },
    { code: "SOL", commonName: "Lenguado", scientificName: "Solea solea" },
    { code: "BSS", commonName: "Lubina", scientificName: "Dicentrarchus labrax" },
    { code: "COE", commonName: "Congrio", scientificName: "Conger conger" },
    { code: "MUL", commonName: "Mújol", scientificName: "Mugil cephalus" },
    { code: "MGR", commonName: "Corvina", scientificName: "Argyrosomus regius" },
    { code: "SBG", commonName: "Sargo", scientificName: "Diplodus sargus" },
    { code: "DEN", commonName: "Dentón", scientificName: "Dentex dentex" },
    { code: "SBR", commonName: "Besugo", scientificName: "Pagellus bogaraveo" },
    { code: "PAC", commonName: "Pargo", scientificName: "Pagrus pagrus" },
    { code: "REB", commonName: "Rodaballo", scientificName: "Scophthalmus maximus" },
    { code: "BRF", commonName: "Cabracho", scientificName: "Scorpaena scrofa" },
    { code: "POR", commonName: "Pintarroja", scientificName: "Scyliorhinus canicula" },
    { code: "DGS", commonName: "Mielga", scientificName: "Squalus acanthias" },
    { code: "BSK", commonName: "Musola", scientificName: "Mustelus mustelus" },
    // Cefalópodos
    { code: "OCC", commonName: "Pulpo", scientificName: "Octopus vulgaris" },
    { code: "CTC", commonName: "Sepia", scientificName: "Sepia officinalis" },
    { code: "SQR", commonName: "Calamar", scientificName: "Loligo vulgaris" },
    { code: "SQZ", commonName: "Pota", scientificName: "Todarodes sagittatus" },
    // Crustáceos
    { code: "CRE", commonName: "Buey de mar", scientificName: "Cancer pagurus" },
    { code: "CRA", commonName: "Centollo", scientificName: "Maja brachydactyla" },
    { code: "PCB", commonName: "Percebe", scientificName: "Pollicipes pollicipes" },
    { code: "NEP", commonName: "Cigala", scientificName: "Nephrops norvegicus" }
  ];
  // OJO: update: s (no {}), para que al relanzar el seed se actualicen los nombres
  // de las especies ya creadas en ejecuciones anteriores.
  for (const s of species) {
    await prisma.species.upsert({ where: { code: s.code }, update: s, create: s });
  }

  // ── Equivalencias base ─────────────────────────────────
  const lare = await prisma.port.findUnique({ where: { code: "LARE" } });
  const ane = await prisma.species.findUnique({ where: { code: "ANE" } });

  if (lare && ane) {
    // Denominaciones específicas vistas en las facturas de la Cofradía San Martín (Laredo)
    await upsertEquivalence({ rawName: "ANE/BOCARTE VIIIC", scope: EquivalenceScope.PORT, portId: lare.id, speciesId: ane.id });
    await upsertEquivalence({ rawName: "ANEBOCARTE VIIIC", scope: EquivalenceScope.PORT, portId: lare.id, speciesId: ane.id });
    // Globales para bocarte/anchoa
    await upsertEquivalence({ rawName: "BOCARTE", scope: EquivalenceScope.GLOBAL, portId: null, speciesId: ane.id });
    await upsertEquivalence({ rawName: "ANCHOA", scope: EquivalenceScope.GLOBAL, portId: null, speciesId: ane.id });
    await upsertEquivalence({ rawName: "ANE BOCARTE", scope: EquivalenceScope.GLOBAL, portId: null, speciesId: ane.id });
    await upsertEquivalence({ rawName: "ANEBOCARTE", scope: EquivalenceScope.GLOBAL, portId: null, speciesId: ane.id });
    await upsertEquivalence({ rawName: "ANE/BOCARTE", scope: EquivalenceScope.GLOBAL, portId: null, speciesId: ane.id });
    await upsertEquivalence({ rawName: "BOQUERON", scope: EquivalenceScope.GLOBAL, portId: null, speciesId: ane.id });
  }

  // ── Equivalencias globales para el resto de especies comunes ──
  const mac = await prisma.species.findUnique({ where: { code: "MAC" } });
  const sar = await prisma.species.findUnique({ where: { code: "SAR" } });
  const hom = await prisma.species.findUnique({ where: { code: "HOM" } });
  const hke = await prisma.species.findUnique({ where: { code: "HKE" } });
  const alb = await prisma.species.findUnique({ where: { code: "ALB" } });
  const bon = await prisma.species.findUnique({ where: { code: "BON" } });
  const bft = await prisma.species.findUnique({ where: { code: "BFT" } });
  const anf = await prisma.species.findUnique({ where: { code: "ANF" } });

  if (mac) {
    for (const n of ["MACVERDEL", "MAC VERDEL", "VERDEL", "VERDEL MAC", "CABALLA", "MAC CABALLA", "MACCABALLA"]) {
      await upsertEquivalence({ rawName: n, scope: EquivalenceScope.GLOBAL, portId: null, speciesId: mac.id });
    }
  }
  if (sar) {
    for (const n of ["SARDINA", "PILSARDINA", "PIL SARDINA", "SAR SARDINA", "PARROCHA"]) {
      await upsertEquivalence({ rawName: n, scope: EquivalenceScope.GLOBAL, portId: null, speciesId: sar.id });
    }
  }
  if (hom) {
    for (const n of ["CHICHARRO", "JUREL", "HOMJUREL", "HOM JUREL", "HOMCHICHARRO"]) {
      await upsertEquivalence({ rawName: n, scope: EquivalenceScope.GLOBAL, portId: null, speciesId: hom.id });
    }
  }
  if (hke) {
    for (const n of ["MERLUZA", "HKE MERLUZA", "HKEMERLUZA", "PESCADA"]) {
      await upsertEquivalence({ rawName: n, scope: EquivalenceScope.GLOBAL, portId: null, speciesId: hke.id });
    }
  }
  if (alb) {
    for (const n of ["BONITO", "BONITO DEL NORTE", "ATUN BLANCO", "ALBACORA", "ALB BONITO", "ALBBONITO"]) {
      await upsertEquivalence({ rawName: n, scope: EquivalenceScope.GLOBAL, portId: null, speciesId: alb.id });
    }
  }
  if (bon) {
    for (const n of ["BONITO ATLANTICO", "SERRUCHO", "BON SERRUCHO"]) {
      await upsertEquivalence({ rawName: n, scope: EquivalenceScope.GLOBAL, portId: null, speciesId: bon.id });
    }
  }
  if (bft) {
    for (const n of ["ATUN ROJO", "BFT ATUN ROJO"]) {
      await upsertEquivalence({ rawName: n, scope: EquivalenceScope.GLOBAL, portId: null, speciesId: bft.id });
    }
  }
  if (anf) {
    for (const n of ["RAPE", "PIXIN", "ANF RAPE", "RAPE BLANCO"]) {
      await upsertEquivalence({ rawName: n, scope: EquivalenceScope.GLOBAL, portId: null, speciesId: anf.id });
    }
  }

  // ── Formatos documentales ─────────────────────────────
  await prisma.documentFormat.upsert({
    where: { code: "GENERIC" },
    update: {},
    create: {
      code: "GENERIC",
      name: "Genérico (fallback)",
      parserKey: "generic",
      description: "Parser por defecto cuando no se puede clasificar el documento.",
      config: {}
    }
  });
  if (lare) {
    const sanMartinFmt = {
      code: "LARE_SANMARTIN",
      name: "Laredo · Cofradía San Martín",
      portId: lare.id,
      parserKey: "laredo-sanmartin",
      description: "Factura de pesca subastada emitida por la Cofradía de Pescadores Ntra. Sra. San Martín (Laredo, Cantabria).",
      config: {
        signatures: [
          "COFRADÍA DE PESCADORES NTRA. SAN MARTIN",
          "COFRADIA DE PESCADORES NTRA. SAN MARTIN",
          "cpsanmartin.es",
          "LAREDO",
          "G39022454"
        ],
        defaultVatRate: 10
      }
    };
    // Upsert con update completo para sobreescribir valores antiguos (cuando se hizo mal al principio).
    await prisma.documentFormat.upsert({
      where: { code: "LARE_SANMARTIN" },
      update: sanMartinFmt,
      create: sanMartinFmt
    });
    // Si existía la versión mal etiquetada (HOND_SANMARTIN), la desactivamos y la re-apuntamos
    const oldHond = await prisma.documentFormat.findUnique({ where: { code: "HOND_SANMARTIN" } });
    if (oldHond) {
      await prisma.documentFormat.update({ where: { id: oldHond.id }, data: { active: false } });
    }
  }

  // ── Formato Ondarroa · Kalare Deuna Kofradía ──────────
  const ondr = await prisma.port.findUnique({ where: { code: "ONDR" } });
  if (ondr) {
    const kalareDeunaFmt = {
      code: "ONDR_KALAREDEUNA",
      name: "Ondarroa · Kalare Deuna Kofradía",
      portId: ondr.id,
      parserKey: "ondarroa-kalaredeuna",
      description: "Factura de barco (Itsasontziko Faktura) emitida por la Kofradía San Nicolás (Kalare Deuna) de Ondarroa, Bizkaia.",
      config: {
        signatures: [
          "KALARE DEUNA",
          "ARRANTZALEEN KOFRADIA",
          "ITSASONTZIKO FAKTURA",
          "FACTURA DE BARCO",
          "G48108039",
          "ONDARROA"
        ],
        defaultVatRate: 10
      }
    };
    await prisma.documentFormat.upsert({
      where: { code: "ONDR_KALAREDEUNA" },
      update: kalareDeunaFmt,
      create: kalareDeunaFmt
    });
    if (ane) {
      await upsertEquivalence({ rawName: "ANCHOA (30-50 GRANOS)", scope: EquivalenceScope.PORT, portId: ondr.id, speciesId: ane.id });
      await upsertEquivalence({ rawName: "ANCHOA", scope: EquivalenceScope.PORT, portId: ondr.id, speciesId: ane.id });
    }
  }

  // ── Formato Getaria · Elkano Kofradía ─────────────────
  const geta = await prisma.port.findUnique({ where: { code: "GETA" } });
  if (geta) {
    const elkanoFmt = {
      code: "GETA_ELKANO",
      name: "Getaria · Elkano Kofradía",
      portId: geta.id,
      parserKey: "getaria-elkano",
      description: "Factura de barco (Itsasontziko Faktura) emitida por la Elkano Arrantzaleen Kofradia (Getaria, Gipuzkoa).",
      config: {
        signatures: [
          "ELKANO ARRANTZALEEN KOFRADIA",
          "ITSASONTZIKO FAKTURA",
          "G20045522",
          "GETARIA"
        ],
        defaultVatRate: 10
      }
    };
    await prisma.documentFormat.upsert({
      where: { code: "GETA_ELKANO" },
      update: elkanoFmt,
      create: elkanoFmt
    });
    if (ane) {
      await upsertEquivalence({ rawName: "ANCHOA", scope: EquivalenceScope.PORT, portId: geta.id, speciesId: ane.id });
    }
    const sar = await prisma.species.findUnique({ where: { code: "SAR" } });
    if (sar) {
      await upsertEquivalence({ rawName: "SARDINA", scope: EquivalenceScope.PORT, portId: geta.id, speciesId: sar.id });
    }
  }

  // ── Formato Hondarribia · Cofradía San Pedro ──────────
  const hond = await prisma.port.findUnique({ where: { code: "HOND" } });
  if (hond) {
    const sanPedroFmt = {
      code: "HOND_SANPEDRO",
      name: "Hondarribia · Cofradía San Pedro",
      portId: hond.id,
      parserKey: "hondarribia-sanpedro",
      description: "Factura de barco (Itsasontziko Faktura) emitida por la Cofradía de Mareantes de San Pedro / Done Pedro Itsas Gizonen Kofradia (Hondarribia, Gipuzkoa).",
      config: {
        signatures: [
          "DONE PEDRO ITSAS GIZONEN",
          "COFRADIA DE MAREANTES DE SAN PEDRO",
          "COFRADÍA DE MAREANTES DE SAN PEDRO",
          "G20037339"
        ],
        defaultVatRate: 10
      }
    };
    await prisma.documentFormat.upsert({
      where: { code: "HOND_SANPEDRO" },
      update: sanPedroFmt,
      create: sanPedroFmt
    });
    if (ane) {
      await upsertEquivalence({ rawName: "ANTXOA - BOKARTA", scope: EquivalenceScope.PORT, portId: hond.id, speciesId: ane.id });
      await upsertEquivalence({ rawName: "ANTXOA", scope: EquivalenceScope.PORT, portId: hond.id, speciesId: ane.id });
      await upsertEquivalence({ rawName: "BOKARTA", scope: EquivalenceScope.PORT, portId: hond.id, speciesId: ane.id });
    }
  }

  // ── Formato Bermeo · San Pedro Arrantzaleen Kofradia ──
  const berm = await prisma.port.findUnique({ where: { code: "BERM" } });
  if (berm) {
    const bermeoFmt = {
      code: "BERM_SANPEDRO",
      name: "Bermeo · San Pedro Arrantzaleen Kofradia",
      portId: berm.id,
      parserKey: "bermeo-sanpedro",
      description: "TXANTEL (certificado de captura) emitido por la San Pedro Arrantzaleen Kofradia de Bermeo, Bizkaia.",
      config: {
        signatures: [
          "BERMEO",
          "TXANTEL",
          "SAN PEDRO ARRANTZALEEN",
          "G48039002"
        ],
        defaultVatRate: 10
      }
    };
    await prisma.documentFormat.upsert({
      where: { code: "BERM_SANPEDRO" },
      update: bermeoFmt,
      create: bermeoFmt
    });
    if (ane) {
      // Variantes de bocarte/anchoa con códigos de talla
      await upsertEquivalence({ rawName: "ANTXOA 44", scope: EquivalenceScope.PORT, portId: berm.id, speciesId: ane.id });
      await upsertEquivalence({ rawName: "ANTXOA 46", scope: EquivalenceScope.PORT, portId: berm.id, speciesId: ane.id });
      await upsertEquivalence({ rawName: "ANTXOA 48", scope: EquivalenceScope.PORT, portId: berm.id, speciesId: ane.id });
    }
    const sar = await prisma.species.findUnique({ where: { code: "SAR" } });
    if (sar) {
      await upsertEquivalence({ rawName: "SARDINA 36/67", scope: EquivalenceScope.PORT, portId: berm.id, speciesId: sar.id });
      await upsertEquivalence({ rawName: "SARDINA", scope: EquivalenceScope.PORT, portId: berm.id, speciesId: sar.id });
    }
  }

  // ── Formato Santoña · Cofradía Ntra. Sra. del Puerto ──
  const stna = await prisma.port.findUnique({ where: { code: "STNA" } });
  if (stna) {
    const delPuertoFmt = {
      code: "STNA_DELPUERTO",
      name: "Santoña · Cofradía Ntra. Sra. del Puerto",
      portId: stna.id,
      parserKey: "santona-delpuerto",
      description: "Albarán de pesca subastada emitido por la Cofradía de Pescadores Ntra. Sra. del Puerto (Santoña, Cantabria).",
      config: {
        signatures: [
          "COFRADÍA DE PESCADORES NTRA. SRA. DEL PUERTO",
          "COFRADIA DE PESCADORES NTRA. SRA. DEL PUERTO",
          "SANTOÑA",
          "SANTONA",
          "V39023569",
          "ALBARAN PESCA SUBASTADA"
        ],
        defaultVatRate: 10
      }
    };
    await prisma.documentFormat.upsert({
      where: { code: "STNA_DELPUERTO" },
      update: delPuertoFmt,
      create: delPuertoFmt
    });
    // Equivalencia específica del puerto para bocarte
    if (ane) {
      await upsertEquivalence({ rawName: "ANEBOCARTE", scope: EquivalenceScope.PORT, portId: stna.id, speciesId: ane.id });
    }
  }

  console.log("Seed completado.");
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
